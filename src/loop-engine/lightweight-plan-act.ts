/**
 * ## Roland Execution Reliability Fix
 *
 * ## Assumptions
 * - Pure ClosedLoop Plan/Act dispatch Cursor SDK agents via loop-agent-dispatch.ts.
 * - [DEPRECATED] LoopPmBridge delegates to legacy PM Team when explicitly opted in.
 */

import type { Blackboard } from '../coordination/legacy-blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { LoopTemplate } from './loop-phases.js';
import type { PhaseConfig } from './loop-phases.js';
import { writeLoopPmSession } from './loop-pm-session.js';
import { RoleModelRouter } from '../models/role-model-router.js';
import { dispatchLoopPhaseAgent } from './loop-agent-dispatch.js';
import type { LoopState } from './loop-state.js';
import type { PhaseResult } from './phase-handlers/types.js';

export interface LightweightPlanActContext {
  stateDir: string;
  goal: string;
  template: LoopTemplate;
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  modelRouter?: RoleModelRouter;
  cwd?: string;
  isTestMode?: boolean;
}

/** Lightweight Plan — scopes iteration; optional SDK dispatch when not in test mode. */
export async function runLightweightPlan(
  iteration: number,
  opts: LightweightPlanActContext,
  extras: { phaseConfig?: PhaseConfig; loopState?: LoopState } = {},
): Promise<PhaseResult> {
  const router = opts.modelRouter ?? RoleModelRouter.fromConfig();
  const planDispatch = router.resolveDispatchForPhase('plan', { log: true });

  writeLoopPmSession(opts.stateDir, {
    iteration,
    templateId: opts.template.name,
    executionPath: 'lightweight',
    routingReason: 'pure ClosedLoop plan',
    wavesRun: 0,
    blockersEncountered: 0,
    taskResults: {},
    updatedAt: Date.now(),
  });

  const dispatch = await dispatchLoopPhaseAgent({
    phase: 'plan',
    iteration,
    goal: opts.goal,
    stateDir: opts.stateDir,
    blackboard: opts.blackboard,
    commandBoard: opts.commandBoard,
    modelRouter: router,
    phaseConfig: extras.phaseConfig,
    loopState: extras.loopState,
    isTestMode: opts.isTestMode,
    cwd: opts.cwd,
  });

  opts.blackboard.post({
    type: 'decision',
    title: 'Loop: Plan phase (pure ClosedLoop)',
    content: dispatch.output || `Planning iteration ${iteration} for goal: ${opts.goal.slice(0, 200)}`,
    status: dispatch.hadBlocker ? 'blocked' : 'done',
    author: 'loop-engine',
    priority: 'medium',
    tags: ['loop', 'plan', 'lightweight', 'pure-closed-loop'],
    relatedIds: [],
  });
  opts.commandBoard?.appendBullet(
    'Key Decisions',
    `[Pure ClosedLoop] Plan iter ${iteration} — ${planDispatch.displayLabel} (${planDispatch.method})`,
  );

  console.error(
    `[Loop][pure] Plan iteration=${iteration} path=lightweight dispatch=${planDispatch.method} model=${planDispatch.displayLabel}`,
  );

  return {
    success: dispatch.success,
    summary: dispatch.summary || 'Planning complete (pure ClosedLoop)',
  };
}

/** Lightweight Act — dispatches coding agent to implement goal on disk. */
export async function runLightweightAct(
  iteration: number,
  opts: LightweightPlanActContext,
  extras: {
    waveNumber?: number;
    phaseConfig?: PhaseConfig;
    loopState?: LoopState;
  } = {},
): Promise<PhaseResult> {
  const router = opts.modelRouter ?? RoleModelRouter.fromConfig();
  const actDispatch = router.resolveDispatchForPhase('act', { log: true });
  const waveNumber = extras.waveNumber ?? 0;

  opts.commandBoard?.setAgentStatus({
    callsign: 'Roland',
    state: 'active',
    lastUpdated: Date.now(),
    note: 'Loop Act — pure ClosedLoop',
  });

  const dispatch = await dispatchLoopPhaseAgent({
    phase: 'act',
    iteration,
    goal: opts.goal,
    stateDir: opts.stateDir,
    blackboard: opts.blackboard,
    commandBoard: opts.commandBoard,
    modelRouter: router,
    phaseConfig: extras.phaseConfig,
    loopState: extras.loopState,
    waveNumber,
    isTestMode: opts.isTestMode,
    cwd: opts.cwd,
  });

  opts.blackboard.post({
    type: 'decision',
    title:
      waveNumber > 0
        ? `Loop: Act phase (pure, wave ${waveNumber})`
        : 'Loop: Act phase (pure ClosedLoop)',
    content: dispatch.output || `Lightweight execution for iteration ${iteration}`,
    status: dispatch.hadBlocker ? 'blocked' : 'done',
    author: dispatch.agentRole,
    priority: dispatch.hadBlocker ? 'high' : 'medium',
    tags: ['loop', 'act', 'lightweight', 'pure-closed-loop'],
    relatedIds: [],
  });

  console.error(
    `[Loop][pure] Act iteration=${iteration} path=lightweight dispatch=${actDispatch.method} model=${actDispatch.displayLabel}`,
  );

  return {
    success: dispatch.success,
    summary: dispatch.summary || 'Act phase complete (pure ClosedLoop)',
    shouldRetry: dispatch.hadBlocker,
  };
}

/**
 * ## Roland Execution Now Reliable
 *
 * Pure ClosedLoop Plan/Act via dispatchLoopPhaseAgent + post-Act filesystem validation.
 * Test: npx vitest run tests/unit/loop-agent-dispatch.test.ts tests/unit/act-validation.test.ts
 */

/**
 * ## Final Decoupling + Model Router Integration Complete
 *
 * Default loop missions use these handlers. Legacy PM Team is opt-in via `use_pm_team`.
 */
