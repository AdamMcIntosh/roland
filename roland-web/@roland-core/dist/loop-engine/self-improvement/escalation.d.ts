/**
 * Escalation rules — when critique should route to human HITL instead of retrying.
 */
import type { RetryDecision } from './types.js';
export interface EscalationContext {
    retryCount: number;
    maxRetries: number;
    /** Consecutive verify failures before escalating (independent of retry budget). */
    escalationThreshold: number;
    consecutiveVerifyFailures: number;
    hadBlockers: boolean;
}
export declare const DEFAULT_MAX_RETRIES = 3;
/** Default consecutive verify-failure count before HITL (was tied to maxRetries=2–3; now 4). */
export declare const DEFAULT_ESCALATION_THRESHOLD = 4;
/**
 * Returns true when the loop should escalate to human operator (HITL).
 * Two paths: retry budget exhausted, or consecutive verify failures exceed threshold.
 */
export declare function shouldEscalateToHuman(ctx: EscalationContext): boolean;
/** Map escalation state to retry decision. */
export declare function escalationRetryDecision(ctx: EscalationContext): RetryDecision;
//# sourceMappingURL=escalation.d.ts.map