/**
 * Retry phase — schedules the next loop iteration with smart retry strategies.
 *
 * Strategies:
 *   - Full retry — re-run all phases on the next iteration
 *   - Focused retry — target failed verification strategies / test files only
 *   - Exponential backoff — optional delay before next iteration (config-driven)
 *   - Human escalation — surfaces HITL when critique already decided escalate
 */
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
export interface RetryPhaseHandlerOptions {
    /** Override exponential backoff for tests */
    backoffEnabled?: boolean;
    /** Skip actual sleep in unit tests */
    skipDelay?: boolean;
}
export declare class RetryPhaseHandler implements PhaseHandler {
    readonly phase: "retry";
    private readonly opts;
    constructor(opts?: RetryPhaseHandlerOptions);
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
//# sourceMappingURL=retry-phase.d.ts.map