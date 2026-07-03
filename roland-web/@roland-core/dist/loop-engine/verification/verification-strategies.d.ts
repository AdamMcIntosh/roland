/**
 * ## Assumptions
 * - Verification commands are project-defined in config.yaml loop_engine.verification.strategies.
 * - Generic fallbacks use common npm test/lint patterns; override per project.
 * - Types not configured (smoke, integration, e2e) use optional generic fallbacks.
 */
import type { VerificationStrategyType } from './verify-result.js';
export interface VerificationStrategyConfig {
    type: VerificationStrategyType;
    command: string;
    timeoutMs?: number;
    /** When true, failure does not fail the overall verify gate */
    optional?: boolean;
    /** Relative weight in EvaluationGate confidence scoring (default by type). */
    weight?: number;
    /** Confidence contribution when strategy passes (default 1 on pass). */
    successThreshold?: number;
    /** Per-strategy minimum confidence — gate fails acceptance when pass conf is below this. */
    minConfidence?: number;
    /** Log only — skip shell execution. */
    dryRun?: boolean;
}
/** Default relative weights for confidence scoring. */
export declare const DEFAULT_STRATEGY_WEIGHTS: Record<VerificationStrategyType, number>;
/** Default success confidence when a strategy passes (optional strategies contribute less). */
export declare const DEFAULT_SUCCESS_THRESHOLDS: Record<VerificationStrategyType, number>;
export declare function getStrategyWeight(type: VerificationStrategyType, override?: number): number;
export declare function getStrategySuccessThreshold(type: VerificationStrategyType, optional?: boolean, override?: number): number;
/** Generic defaults when config.yaml omits loop_engine.verification.strategies. */
export declare const DEFAULT_VERIFICATION_STRATEGIES: VerificationStrategyConfig[];
export declare const SMOKE_STRATEGY: VerificationStrategyConfig;
export declare const INTEGRATION_STRATEGY: VerificationStrategyConfig;
export declare const E2E_STRATEGY: VerificationStrategyConfig;
export declare function getBuiltinStrategy(type: VerificationStrategyType): VerificationStrategyConfig;
export declare function coerceVerificationStrategies(configured: Array<{
    type: string;
    command?: string;
    timeoutMs?: number;
    optional?: boolean;
    weight?: number;
    successThreshold?: number;
    minConfidence?: number;
    dryRun?: boolean;
}> | undefined): VerificationStrategyConfig[];
export declare function resolveStrategies(configured: VerificationStrategyConfig[] | undefined, templateFilter?: VerificationStrategyType[]): VerificationStrategyConfig[];
export declare function isVerificationStrategyType(value: string): value is VerificationStrategyType;
//# sourceMappingURL=verification-strategies.d.ts.map