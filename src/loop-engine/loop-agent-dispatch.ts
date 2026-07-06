/**
 * ## Project Context & Agent Dispatch Fix
 *
 * Dispatches Cursor SDK agents for Pure ClosedLoop Plan/Act phases.
 * Includes role fallbacks when Sparrow / primary agents fail to respond.
 */

import type { Blackboard } from '../coordination/legacy-blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import { AGENT_TIMEOUT_MS } from '../rco/constants.js';
import { buildClaudeToolCallingPrompt } from '../rco/prompts.js';
import { parseWorkerSignals } from '../rco/worker-signals.js';
import type { AgentYaml } from '../rco/types.js';
import { loadUnscAgents } from '../rco/unsc-agents.js';
import { toCursorModelId } from '../rco/model-routing.js';
import { isGreenfieldGoal } from '../rco/goal-scope.js';
import { RoleModelRouter } from '../models/role-model-router.js';
import {
  cleanupSdkSession,
  resolveSdkAgentLocalOptions,
  resolveSdkSettleMs,
  waitForSdkRun,
} from '../utils/sdk-lifecycle.js';
import {
  captureWorkspaceBaseline,
  validateActExecution,
  type WorkspaceBaseline,
} from './act-validation.js';
import type { PhaseConfig } from './loop-phases.js';
import type { LoopState } from './loop-state.js';
import { resolveMissionProjectRoot } from '../utils/mcp-project-context.js';

export interface LoopAgentDispatchOptions {
  phase: 'plan' | 'act';
  iteration: number;
  goal: string;
  stateDir: string;
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  modelRouter?: RoleModelRouter;
  phaseConfig?: PhaseConfig;
  loopState?: LoopState;
  waveNumber?: number;
  isTestMode?: boolean;
  cwd?: string;
}

export interface LoopAgentDispatchResult {
  success: boolean;
  output: string;
  hadBlocker: boolean;
  summary: string;
  agentRole: string;
}

const GREENFIELD_ACT_BRIEF = `This is a **greenfield / bootstrap** goal. You MUST create real files on disk in the project root:
- Add package.json with appropriate scripts (include scripts.test when feasible — even a placeholder is OK)
- Add tsconfig.json / source files as described in the goal
- Do not respond with plans only — write files using your editor tools
- Confirm created paths in your response`;

const ACT_BRIEF = `Implement the goal by creating or modifying files in the project working directory.
Use your file tools — do not only describe changes.`;

const PLAN_BRIEF = `Break the goal into concrete implementation steps for this loop iteration.
Keep scope focused — the Act phase will implement immediately after planning.`;

/** Fallback roles when primary agent dispatch fails (Sparrow → coding → executor). */
const LOOP_AGENT_FALLBACKS: Record<string, string[]> = {
  sparrow: ['coding', 'executor'],
  executor: ['coding', 'sparrow'],
  coding: ['executor', 'sparrow'],
  pm: ['planner', 'lead-pm'],
  planner: ['pm', 'lead-pm'],
  'lead-pm': ['planner', 'pm'],
  'test-author': ['test-executor', 'vanguard'],
  'test-executor': ['test-author', 'vanguard'],
};

function resolveAgentRole(phase: 'plan' | 'act', phaseConfig?: PhaseConfig): string {
  if (phaseConfig?.agent) return phaseConfig.agent;
  return phase === 'plan' ? 'pm' : 'coding';
}

function resolveAgentYaml(role: string): AgentYaml {
  const key = role.toLowerCase().replace(/\s+/g, '-');
  const roster = loadUnscAgents();
  return roster.get(key) ?? { name: role };
}

function buildRetryContext(loopState?: LoopState): string {
  const parts: string[] = [];
  const verify = loopState?.lastVerification;
  if (verify && !verify.accepted) {
    parts.push(`Previous verification: ${verify.summary}`);
    if (verify.strategies?.length) {
      const failed = verify.strategies.filter((s) => !s.pass);
      if (failed.length) {
        parts.push(`Failed checks: ${failed.map((s) => s.type).join(', ')}`);
      }
    }
  }
  const critique = loopState?.lastCritique;
  if (critique?.issues?.length) {
    parts.push(`Critique issues: ${critique.issues.slice(0, 4).join('; ')}`);
  }
  if (critique?.suggestions?.length) {
    parts.push(`Suggestions: ${critique.suggestions.slice(0, 3).join('; ')}`);
  }
  return parts.length ? `\n## Retry context (fix on this iteration)\n\n${parts.join('\n')}` : '';
}

function buildTaskContext(opts: LoopAgentDispatchOptions): string {
  const { phase, goal, iteration, waveNumber, loopState } = opts;
  const brief =
    phase === 'plan'
      ? PLAN_BRIEF
      : isGreenfieldGoal(goal)
        ? GREENFIELD_ACT_BRIEF
        : ACT_BRIEF;

  return [
    brief,
    `\n## Mission goal\n\n${goal}`,
    `\n## Loop context\n\nIteration ${iteration}${waveNumber ? ` · wave ${waveNumber}` : ''}`,
    buildRetryContext(loopState),
    phase === 'act' && isGreenfieldGoal(goal)
      ? '\n## Deliverable check\n\nWhen done, list every file path you created or modified.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function callSdkAgent(
  agentRole: string,
  prompt: string,
  cwd: string,
): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error('CURSOR_API_KEY is not set');

  const { Agent } = (await import('@cursor/sdk')) as typeof import('@cursor/sdk');
  const modelId = toCursorModelId('', agentRole);

  type SdkAgent = Awaited<ReturnType<typeof Agent.create>>;
  type SdkRun = Awaited<ReturnType<SdkAgent['send']>>;

  let agent: SdkAgent | undefined;
  let run: SdkRun | undefined;

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      name: agentRole,
      local: resolveSdkAgentLocalOptions(agentRole, { cwd, settingSources: ['project'] }) as import('@cursor/sdk').LocalAgentOptions,
    });

    run = await agent.send(prompt);
    const result = await waitForSdkRun(run, {
      timeoutMs: AGENT_TIMEOUT_MS,
      agentName: agentRole,
      heartbeatIntervalMs: 30_000,
      onHeartbeat: (elapsedMs) => {
        const s = Math.floor(elapsedMs / 1000);
        console.error(`[Loop][agent] ⏳ ${agentRole} still running… (${s}s)`);
      },
    });

    if (result.status === 'error' || result.status === 'cancelled') {
      throw new Error(`Agent "${agentRole}" ${result.status}: ${result.result ?? 'no detail'}`);
    }
    return result.result ?? '';
  } finally {
    const settleMs = resolveSdkSettleMs(agentRole, prompt);
    await cleanupSdkSession(agent, run, { settleMs, agentName: agentRole });
  }
}

function fallbackRolesFor(role: string): string[] {
  const key = role.toLowerCase().replace(/\s+/g, '-');
  return LOOP_AGENT_FALLBACKS[key] ?? ['executor', 'coding'];
}

/** Try primary role then fallbacks before surfacing a hard failure. */
async function callSdkAgentWithFallbacks(
  primaryRole: string,
  prompt: string,
  cwd: string,
): Promise<{ output: string; agentRole: string }> {
  const tried = new Set<string>();
  const roles = [primaryRole, ...fallbackRolesFor(primaryRole)];

  let lastError: Error | undefined;
  for (const role of roles) {
    const key = role.toLowerCase();
    if (tried.has(key)) continue;
    tried.add(key);

    try {
      const output = await callSdkAgent(role, prompt, cwd);
      if (role !== primaryRole) {
        console.error(
          `[Loop][agent] Fallback succeeded — ${primaryRole} → ${role} cwd=${cwd}`,
        );
      }
      return { output, agentRole: role };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[Loop][agent] Dispatch failed for ${role}: ${lastError.message.slice(0, 120)}` +
          (tried.size < roles.length ? ' — trying fallback' : ''),
      );
    }
  }

  throw lastError ?? new Error(`Agent "${primaryRole}" failed with no fallbacks`);
}

function testModeStub(opts: LoopAgentDispatchOptions): LoopAgentDispatchResult {
  const role = resolveAgentRole(opts.phase, opts.phaseConfig);
  const output =
    opts.phase === 'act'
      ? `[Loop test stub] Implemented iteration ${opts.iteration} for: ${opts.goal.slice(0, 120)}`
      : `[Loop test stub] Planned iteration ${opts.iteration}`;
  return {
    success: true,
    output,
    hadBlocker: false,
    summary: `${opts.phase} complete (test mode stub)`,
    agentRole: role,
  };
}

/** Execute a loop Plan or Act phase agent via Cursor SDK (Pure ClosedLoop). */
export async function dispatchLoopPhaseAgent(
  opts: LoopAgentDispatchOptions,
): Promise<LoopAgentDispatchResult> {
  const role = resolveAgentRole(opts.phase, opts.phaseConfig);
  const cwd = opts.cwd ?? resolveMissionProjectRoot();

  if (opts.isTestMode || process.env.ROLAND_LOOP_TEST_MODE === '1') {
    return testModeStub(opts);
  }

  if (!process.env.CURSOR_API_KEY) {
    console.error('[Loop][agent] CURSOR_API_KEY missing — act phase cannot create files');
    return {
      success: false,
      output: '',
      hadBlocker: true,
      summary: 'Act phase blocked — CURSOR_API_KEY not set',
      agentRole: role,
    };
  }

  const router = opts.modelRouter ?? RoleModelRouter.fromConfig();
  const dispatch = router.resolveDispatchForPhase(opts.phase, { log: true });
  const agentYaml = resolveAgentYaml(role);
  const taskContext = buildTaskContext(opts);
  const prompt = buildClaudeToolCallingPrompt({
    agentYaml,
    taskContext,
    teamGoal: opts.goal,
    blackboardSnapshot: opts.blackboard.snapshot(),
    commandBlackboardSnapshot: opts.commandBoard?.smartSnapshot(opts.goal),
    teamSize: 1,
  });

  console.error(
    `[Loop][agent] Dispatch ${opts.phase} iter=${opts.iteration} role=${role} ` +
      `method=${dispatch.method} model=${dispatch.displayLabel} cwd=${cwd}`,
  );

  try {
    let actBaseline: WorkspaceBaseline | undefined;
    if (opts.phase === 'act') {
      actBaseline = captureWorkspaceBaseline(cwd);
    }

    const { output, agentRole: effectiveRole } = await callSdkAgentWithFallbacks(role, prompt, cwd);
    const signals = parseWorkerSignals(output);
    let hadBlocker = signals.blockers.length > 0;

    if (opts.phase === 'act' && actBaseline) {
      const validation = validateActExecution({
        cwd,
        goal: opts.goal,
        baseline: actBaseline,
        agentOutput: output,
        skipInTestMode: opts.isTestMode,
      });

      opts.commandBoard?.appendBullet(
        'Open Intel',
        validation.ok
          ? `[ACT-VERIFY] ${validation.message}`
          : `[ACT-VERIFY] FAILED — ${validation.message}`,
      );

      if (!validation.ok) {
        hadBlocker = true;
        opts.blackboard.post({
          type: 'blocker',
          title: 'BLOCKER: Act phase produced no files',
          content: validation.message,
          status: 'pending',
          author: 'loop-engine',
          priority: 'critical',
          tags: ['blocker', 'loop', 'act', 'act-validation'],
          relatedIds: [],
        });
      } else if (validation.filesCreated.length || validation.filesModified.length) {
        opts.blackboard.post({
          type: 'result',
          title: 'Loop act: filesystem verification',
          content: validation.message,
          status: 'done',
          author: 'loop-engine',
          priority: 'medium',
          tags: ['loop', 'act', 'act-validation'],
          relatedIds: [],
        });
      }
    }

    if (hadBlocker && signals.blockers.length > 0) {
      for (const blocker of signals.blockers) {
        opts.blackboard.post({
          type: 'blocker',
          title: `BLOCKER: ${role} on loop ${opts.phase}`,
          content: blocker.description,
          status: 'pending',
          author: role,
          priority: 'critical',
          tags: ['blocker', 'loop', opts.phase],
          relatedIds: [],
        });
        opts.commandBoard?.appendBullet(
          'Open Intel',
          `[BLOCKER] ${role} loop-${opts.phase}: ${blocker.description.slice(0, 160)}`,
        );
      }
    }

    opts.blackboard.post({
      type: 'result',
      title: `Loop ${opts.phase}: ${role} output`,
      content: output.length > 4000 ? output.slice(0, 4000) + '\n…(truncated)' : output,
      status: hadBlocker ? 'blocked' : 'done',
      author: role,
      priority: hadBlocker ? 'critical' : 'medium',
      tags: ['loop', opts.phase, 'agent-output'],
      relatedIds: [],
    });

    return {
      success: !hadBlocker,
      output,
      hadBlocker,
      summary: hadBlocker
        ? signals.blockers.length > 0
          ? `${opts.phase} blocked — agent signalled blocker`
          : `${opts.phase} blocked — no files written to disk`
        : `${opts.phase} complete via ${dispatch.displayLabel}${effectiveRole !== role ? ` (fallback: ${effectiveRole})` : ''}`,
      agentRole: effectiveRole,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Loop][agent] ${opts.phase} dispatch failed`, { error: message });
    opts.blackboard.post({
      type: 'blocker',
      title: `BLOCKER: loop ${opts.phase} agent failure`,
      content: message,
      status: 'pending',
      author: 'loop-engine',
      priority: 'critical',
      tags: ['blocker', 'loop', opts.phase],
      relatedIds: [],
    });
    return {
      success: false,
      output: '',
      hadBlocker: true,
      summary: `${opts.phase} failed — ${message}`,
      agentRole: role,
    };
  }
}

/**
 * ## Project Context Switching and Agent Dispatch Fixed
 *
 * Act phase dispatches Cursor SDK agents with Sparrow/coding fallbacks and validates filesystem changes.
 * Test: npx vitest run tests/unit/loop-agent-dispatch.test.ts tests/integration/mcp-mission-project-context.test.ts
 */
