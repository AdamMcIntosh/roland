/**
 * ## P1 Honesty & Consolidation
 *
 * ## Evaluation Gate & Blocker Fix
 *
 * Verify phase — runs EvaluationGate and surfaces structured results to loop state.
 */
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import type { CommandRunner } from '../verification/index.js';
export interface VerifyPhaseHandlerOptions {
    cwd?: string;
    /** Loop template for verification strategy resolution. */
    template?: import('../loop-phases.js').LoopTemplate;
    /** Inject for unit tests — bypasses real npm test */
    runner?: CommandRunner;
    customCriteria?: import('../evaluation-gate.js').CustomCriterion[];
    requireManualReview?: boolean;
    manualReviewApproved?: boolean;
    minConfidence?: number;
    exitConditions?: import('../loop-phases.js').ExitConditionConfig[];
}
export declare class VerifyPhaseHandler implements PhaseHandler {
    readonly phase: "verify";
    protected readonly opts: VerifyPhaseHandlerOptions;
    constructor(opts?: VerifyPhaseHandlerOptions);
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
//# sourceMappingURL=verify-phase.d.ts.map