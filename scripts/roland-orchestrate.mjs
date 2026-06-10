#!/usr/bin/env node
/**
 * Roland SDK orchestration reference — supervisor + UNSC sub-agents.
 *
 * Usage:
 *   npm run build
 *   node scripts/roland-orchestrate.mjs "Add health check endpoint with tests"
 *
 * Requires CURSOR_API_KEY in environment.
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const installRoot = process.env.ROLAND_INSTALL_ROOT?.trim()
  ? resolve(process.env.ROLAND_INSTALL_ROOT.trim())
  : resolve(__dirname, '..');
const distRoot = resolve(installRoot, 'dist');

if (!existsSync(distRoot)) {
  console.error('Run npm run build first — dist/ not found.');
  process.exit(1);
}

const { Agent, CursorAgentError } = await import('@cursor/sdk');
const { configureSdkProcessLimits, resolveSdkAgentLocalOptions } = await import(
  resolve(distRoot, 'utils/sdk-lifecycle.js')
);
configureSdkProcessLimits();
const { loadUnscAgents, toSdkAgentDefinitions } = await import(
  resolve(distRoot, 'rco/unsc-agents.js')
);
const { buildRolandOrchestratorPrompt } = await import(
  resolve(distRoot, 'rco/orchestrator-prompts.js')
);
const { finalizeSynthesisOutput } = await import(
  resolve(distRoot, 'rco/mission-complete.js')
);
const { CommandBlackboard } = await import(
  resolve(distRoot, 'rco/command-blackboard.js')
);

const apiKey = process.env.CURSOR_API_KEY;
if (!apiKey) {
  console.error('CURSOR_API_KEY is not set.');
  process.exit(1);
}

const goal = process.argv.slice(2).join(' ').trim();
if (!goal) {
  console.error('Usage: node scripts/roland-orchestrate.mjs "<mission goal>"');
  process.exit(1);
}

const MAX_STARTUP_RETRIES = 3;
const STARTUP_RETRY_DELAYS = [2_000, 5_000, 10_000];

const board = new CommandBlackboard(process.env.ROLAND_STATE_DIR ?? '.roland');
const unscAgents = toSdkAgentDefinitions(loadUnscAgents());

board.appendBullet('Mission Objectives', `[P2 active] ${goal}`);
board.setAgentStatus({ callsign: 'Roland', state: 'active', lastUpdated: Date.now(), note: 'SDK orchestration' });

const systemContext = buildRolandOrchestratorPrompt({
  goal,
  commandBlackboard: board.smartSnapshot(goal),
});

console.error(`[Roland] Mission: ${goal}`);
console.error(`[Roland] Sub-agents: ${Object.keys(unscAgents).join(', ')}`);

/** Create Roland supervisor with UNSC sub-agents — retries on transient startup failures. */
async function createRolandSupervisor() {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_STARTUP_RETRIES; attempt++) {
    try {
      return await Agent.create({
        apiKey,
        model: { id: 'gpt-5.4-nano' },
        name: 'Roland',
        local: resolveSdkAgentLocalOptions('Roland', {
          cwd: process.cwd(),
          settingSources: ['project'],
        }),
        agents: unscAgents,
      });
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof CursorAgentError && err.isRetryable;
      if (!retryable || attempt >= MAX_STARTUP_RETRIES) break;
      const delay = STARTUP_RETRY_DELAYS[attempt - 1] ?? 10_000;
      console.error(`[Roland] Startup failed (attempt ${attempt}/${MAX_STARTUP_RETRIES}), retrying in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

const roland = await createRolandSupervisor();
let activeRun;

try {
  activeRun = await roland.send(
    `${systemContext}\n\n---\n\nExecute this mission. Delegate to appropriate callsigns. Update the Command Blackboard as you proceed.\n\nMission: ${goal}`,
  );

  console.error(`[Roland] run.id=${activeRun.id} agentId=${roland.agentId}`);

  let streamedOutput = '';

  for await (const event of activeRun.stream()) {
    if (event.type === 'assistant') {
      for (const block of event.message.content) {
        if (block.type === 'text') {
          streamedOutput += block.text;
          process.stdout.write(block.text);
        }
      }
    }
  }

  const result = await activeRun.wait();

  if (result.status === 'error') {
    console.error('\n[Roland] Run failed.');
    board.appendAgentLog('Roland', `Mission failed: ${goal.slice(0, 80)}`);
    board.appendBullet('Open Intel', `[ESCALATION] Mission failed — operator review required: ${goal.slice(0, 100)}`);
    board.setAgentStatus({ callsign: 'Roland', state: 'blocked', lastUpdated: Date.now(), note: 'Mission failed' });
    process.exit(2);
  }

  if (result.status === 'cancelled') {
    console.error('\n[Roland] Run cancelled.');
    board.setAgentStatus({ callsign: 'Roland', state: 'idle', lastUpdated: Date.now(), note: 'Cancelled' });
    process.exit(3);
  }

  board.appendAgentLog('Roland', `Mission complete: ${goal.slice(0, 120)}`);
  board.setAgentStatus({ callsign: 'Roland', state: 'complete', lastUpdated: Date.now() });
  board.appendBullet('Mission Objectives', `[complete] ${goal.slice(0, 120)}`);

  const finalized = finalizeSynthesisOutput(streamedOutput, {
    goal,
    blockersEncountered: 0,
    wavesRun: 1,
    taskCount: 1,
  });
  const alreadyComplete = /###\s+(🎖\s+)?(UNSC\s+)?Mission Complete/i.test(streamedOutput);
  if (!alreadyComplete) {
    const footerStart = finalized.indexOf('\n---\n\n### 🎖 Mission Complete');
    if (footerStart >= 0) {
      process.stdout.write(finalized.slice(footerStart));
    }
  }

  console.error('\n[Roland] Mission complete.');

  const { buildBoardStatusReport, formatConciseUnscSummary } = await import(
    resolve(distRoot, 'rco/board-report.js')
  );
  console.error('\n' + formatConciseUnscSummary(buildBoardStatusReport(process.env.ROLAND_STATE_DIR ?? '.roland', goal)) + '\n');
} catch (err) {
  if (err instanceof CursorAgentError) {
    console.error(`[Roland] Startup failed: ${err.message} (retryable=${err.isRetryable})`);
    board.appendBullet('Open Intel', `[ESCALATION] SDK startup failure: ${err.message.slice(0, 120)}`);
    process.exit(1);
  }
  board.appendBullet('Open Intel', `[ESCALATION] Unexpected error: ${String(err).slice(0, 120)}`);
  throw err;
} finally {
  const { cleanupSdkSession } = await import(resolve(distRoot, 'utils/sdk-lifecycle.js'));
  await cleanupSdkSession(roland, activeRun);
}
