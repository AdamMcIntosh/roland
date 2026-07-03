/**
 * Retry strategies — simple full retry vs focused retry on specific failures.
 */
import type { CritiqueInput, RetryDecision } from './types.js';
export interface RetryStrategyResult {
    decision: RetryDecision;
    reason: string;
    /** Strategy types to prioritize on focused retry (e.g. ['unit', 'lint']) */
    focusAreas?: string[];
}
/** Simple retry — re-run the full loop iteration when any gate fails. */
export declare function simpleRetryStrategy(input: CritiqueInput): RetryStrategyResult;
/**
 * Focused retry — target only failed verification strategies instead of full re-run.
 * Used when failures are localized (single strategy type).
 */
export declare function focusedRetryStrategy(input: CritiqueInput): RetryStrategyResult;
/** Pick strategy based on failure shape — focused when localized, else simple. */
export declare function resolveRetryStrategy(input: CritiqueInput): RetryStrategyResult;
//# sourceMappingURL=retry-strategies.d.ts.map