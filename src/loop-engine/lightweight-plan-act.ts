/**
 * ## Assumptions
 * - Pure ClosedLoop Plan/Act use these handlers (no PM Team / runTeam).
 * - LoopPmBridge delegates here when PM routing chooses lightweight.
 */

import type { Blackboard } from '../rco/blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { LoopTemplate } from './loop-phases.js';
import type { PhaseResult } from './phase-handlers/types.js';
import { writeLoopPmSession } from './loop-pm-session.js';
import { ModelRouter } from '../models/model-router.js';

export interface LightweightPlanActContext {
  stateDir: string;
  goal: string;
  template: LoopTemplate;
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  modelRouter?: ModelRouter;
}

/** Lightweight Plan — no PM Team decomposition. */
export function runLightweightPlan(
  iteration: number,
  opts: LightweightPlanActContext,
): PhaseResult {
  const router = opts.modelRouter ?? ModelRouter.fromConfig();
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

  opts.blackboard.post({
    type: 'decision',
    title: 'Loop: Plan phase (pure ClosedLoop)',
    content: `Planning iteration ${iteration} for goal: ${opts.goal.slice(0, 200)}`,
    status: 'done',
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
    success: true,
    summary: 'Planning complete (pure ClosedLoop — no PM Team)',
  };
}

/** Lightweight Act — no PM Team waves. */
export function runLightweightAct(
  iteration: number,
  opts: LightweightPlanActContext,
  waveNumber = 0,
): PhaseResult {
  const router = opts.modelRouter ?? ModelRouter.fromConfig();
  const actDispatch = router.resolveDispatchForPhase('act', { log: true });

  opts.commandBoard?.setAgentStatus({
    callsign: 'Roland',
    state: 'active',
    lastUpdated: Date.now(),
    note: 'Loop Act — pure ClosedLoop',
  });

  opts.blackboard.post({
    type: 'decision',
    title: waveNumber > 0 ? `Loop: Act phase (pure, wave ${waveNumber})` : 'Loop: Act phase (pure ClosedLoop)',
    content: `Lightweight execution for iteration ${iteration}`,
    status: 'in_progress',
    author: 'loop-engine',
    priority: 'medium',
    tags: ['loop', 'act', 'lightweight', 'pure-closed-loop'],
    relatedIds: [],
  });

  console.error(
    `[Loop][pure] Act iteration=${iteration} path=lightweight dispatch=${actDispatch.method} model=${actDispatch.displayLabel}`,
  );

  return {
    success: true,
    summary: 'Act phase complete (pure ClosedLoop — no PM waves)',
  };
}

/**
 * ## Final Decoupling + Model Router Integration Complete
 *
 * Default loop missions use these handlers. Legacy PM Team is opt-in via `use_pm_team`.
 */
