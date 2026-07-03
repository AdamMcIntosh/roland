/**
 * ## Assumptions
 * - Exit conditions are declarative rules from loop templates (loops.elorm.xyz pattern).
 * - Multiple conditions combine with AND semantics — all must pass to exit early.
 * - Confidence streak reads from LoopMemory disk state updated after each verify phase.
 * - Command success uses the most recent between-iterations run when configured.
 */
import type { ExitConditionConfig } from './loop-phases.js';
import type { LoopDiskState, BetweenIterationRun } from './loop-memory.js';
import type { EvaluationGateResult } from './evaluation-gate.js';
export interface ExitConditionStatus {
    id: string;
    type: ExitConditionConfig['type'];
    description: string;
    met: boolean;
    reason: string;
    evaluatedAt: number;
}
export interface ExitEvaluationContext {
    iteration: number;
    maxIterations: number;
    evaluation?: EvaluationGateResult;
    memory: LoopDiskState;
    lastBetweenRun?: BetweenIterationRun;
}
export interface ExitEvaluationResult {
    shouldExit: boolean;
    reason: string;
    statuses: ExitConditionStatus[];
    /** Human-readable summary for dashboard / logs. */
    summary: string;
}
/**
 * Evaluate configured exit conditions. When none are configured, falls back to
 * verification accepted on the current iteration (loops.elorm.xyz default).
 */
export declare function evaluateExitConditions(conditions: ExitConditionConfig[] | undefined, ctx: ExitEvaluationContext): ExitEvaluationResult;
/**
 * ## Loop Integration Complete
 * Exit conditions enable explicit loop termination rules (confidence streaks, all-green gates,
 * command checks) with clear visibility into why a loop succeeded or continues.
 */
//# sourceMappingURL=exit-conditions.d.ts.map