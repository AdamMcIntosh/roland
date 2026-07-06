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
import { ModelRouter } from '../models/model-router.js';
import type { LoopState } from './loop-state.js';
import type { PhaseResult } from './phase-handlers/types.js';
export interface LightweightPlanActContext {
    stateDir: string;
    goal: string;
    template: LoopTemplate;
    blackboard: Blackboard;
    commandBoard?: CommandBlackboard;
    modelRouter?: ModelRouter;
    cwd?: string;
    isTestMode?: boolean;
}
/** Lightweight Plan — scopes iteration; optional SDK dispatch when not in test mode. */
export declare function runLightweightPlan(iteration: number, opts: LightweightPlanActContext, extras?: {
    phaseConfig?: PhaseConfig;
    loopState?: LoopState;
}): Promise<PhaseResult>;
/** Lightweight Act — dispatches coding agent to implement goal on disk. */
export declare function runLightweightAct(iteration: number, opts: LightweightPlanActContext, extras?: {
    waveNumber?: number;
    phaseConfig?: PhaseConfig;
    loopState?: LoopState;
}): Promise<PhaseResult>;
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
//# sourceMappingURL=lightweight-plan-act.d.ts.map