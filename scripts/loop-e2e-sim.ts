#!/usr/bin/env npx tsx
/**
 * ## Assumptions
 * - Safe local simulation: passRunner for verify, git-commit dry-run from template, one real HITL cycle mocked.
 * - Uses `.roland-sim` state dir so it never touches the active `.roland`.
 * - ROLAND_LOOP_TEST_MODE=1 relaxes retry/escalation limits for a short run.
 *
 * Usage:
 *   npm run loop:e2e-sim
 *   npx tsx scripts/loop-e2e-sim.ts [--state-dir .roland-sim]
 */

import fs from 'fs';
import path from 'path';
import {
  ClosedLoop,
  runBetweenIterations,
  readLoopState,
  type LoopMemory,
} from '../src/loop-engine/index.js';
import type { ResolvedBetweenIterationsHook } from '../src/loop-engine/loop-template-resolution.js';
import { RoleModelRouter, resetRoleModelRouter } from '../src/models/role-model-router.js';
import { Blackboard } from '../src/coordination/legacy-blackboard.js';
import { CommandBlackboard } from '../src/rco/command-blackboard.js';
import { decideGitCommitApprovalCli } from '../src/rco/git-commit-approval-cli.js';
import { clearLoopEngineConfigCache } from '../src/loop-engine/loop-config.js';
import type { CommandRunner } from '../src/loop-engine/verification/index.js';

const passRunner: CommandRunner = async (cmd) => ({
  exitCode: 0,
  stdout: `[sim] OK: ${cmd.split(/\s+/).slice(0, 3).join(' ')}\n`,
  stderr: '',
});

function parseArgs(argv: string[]): { stateDir: string; template: string } {
  let stateDir = '.roland-sim';
  let template = 'feature-implementation-loop';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state-dir' && argv[i + 1]) stateDir = argv[++i];
    else if (argv[i] === '--template' && argv[i + 1]) template = argv[++i];
  }
  return { stateDir, template };
}

function mockMemory(): LoopMemory {
  return { recordBetweenIteration: () => {} } as unknown as LoopMemory;
}

async function simulateHitlApproval(stateDir: string): Promise<void> {
  console.error('\n[sim] ── HITL git-commit approval cycle ──');
  const hook: ResolvedBetweenIterationsHook = {
    command: '',
    label: 'git-commit',
    timeoutMs: 30_000,
    optional: true,
    dryRun: false,
    exitOnFailure: false,
    noOp: false,
    source: 'simulation',
    action: 'git-commit',
    gitCommit: {
      messageTemplate: 'chore(sim): HITL checkpoint iteration {iteration}',
      autoStage: false,
      dryRun: false,
      requireApproval: true,
      approvalTimeoutMs: 60_000,
      autoRejectOnTimeout: true,
    },
  };

  const runPromise = runBetweenIterations({
    hook,
    iteration: 1,
    cwd: process.cwd(),
    memory: mockMemory(),
    stateDir,
    onApprovalPending: (snap) => {
      console.error(`[sim] HITL pending: ${snap.id} — "${snap.message}"`);
    },
    onApprovalResolved: () => {
      console.error('[sim] HITL resolved via operator decision');
    },
  });

  await new Promise((r) => setTimeout(r, 120));
  const result = decideGitCommitApprovalCli('approve', {
    stateDir,
    message: 'chore(sim): operator-approved via roland approve-commit',
    interactive: false,
  });
  console.error(`[sim] approve-commit CLI: ok=${result.ok} exit=${result.exitCode}`);
  const between = await runPromise;
  console.error(`[sim] between-iterations HITL: success=${between.success}`);
}

async function main(): Promise<void> {
  const { stateDir, template } = parseArgs(process.argv.slice(2));
  const absState = path.resolve(stateDir);

  if (fs.existsSync(absState)) {
    fs.rmSync(absState, { recursive: true, force: true });
  }
  fs.mkdirSync(absState, { recursive: true });

  process.env.ROLAND_LOOP_TEST_MODE = '1';
  clearLoopEngineConfigCache();
  resetRoleModelRouter();

  const blackboard = new Blackboard(absState);
  const commandBoard = new CommandBlackboard(absState);
  const goal = 'Add a brief module header comment to RoleModelRouter (simulation only — no repo edits)';

  console.error('\n[sim] ── ClosedLoop harness (Pure ClosedLoop + Cursor SDK defaults) ──');
  console.error(`[sim] template=${template} stateDir=${stateDir}`);

  const router = RoleModelRouter.fromConfig();
  const planDispatch = router.resolveDispatchForPhase('plan', { log: false });
  console.error(`[sim] dispatch plan → ${planDispatch.method} (${planDispatch.model ?? 'default'})`);

  const loop = new ClosedLoop({
    stateDir: absState,
    goal,
    template,
    blackboard,
    commandBoard,
    runner: passRunner,
    isTestMode: true,
    skipBackoff: true,
    enablePmIntegration: false,
  });

  const result = await loop.run({ hadBlockers: false });

  console.error(`\n[sim] Loop finished: status=${result.status} spawns=${result.spawnCount} iterations=${result.state.iteration}`);
  const loopState = readLoopState(absState);
  const la = loopState?.liveActivity;
  const spawnHistory = loopState?.spawnActivityHistory ?? la?.recentSpawns ?? [];
  if (la) {
    console.error(`[sim] liveActivity kind=${la.kind ?? '—'} label=${la.label ?? '—'}`);
  }
  console.error(`[sim] spawnActivityHistory pulses=${spawnHistory.length}`);

  await simulateHitlApproval(absState);

  console.error('\n[sim] ── roland hitl-status ──');
  const { spawnSync } = await import('child_process');
  spawnSync(process.execPath, ['dist/index.js', 'hitl-status', '--state-dir', absState], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  delete process.env.ROLAND_LOOP_TEST_MODE;

  const ok = result.status === 'completed' && result.spawnCount > 0 && spawnHistory.length > 0;
  console.error(`\n[sim] ${ok ? 'PASS' : 'FAIL'} — end-to-end simulation complete`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[sim] fatal:', err);
  process.exit(1);
});
