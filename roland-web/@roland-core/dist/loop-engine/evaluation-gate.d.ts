/**
 * ## Roland Execution Reliability Fix
 *
 * ## Evaluation Gate & Blocker Fix
 *
 * ## Assumptions
 * - Automated verifiers (unit/lint/typecheck) run via TestExecutor shell commands.
 * - Custom criteria are synchronous or async functions supplied by callers/tests.
 * - Manual review defaults to pass in unattended mode unless `manualReviewApproved` is set false.
 * - Confidence is a weighted pass ratio across required gates (0–1); optional gates do not reduce confidence below 0.5 when skipped.
 */
import type { Blackboard } from '../coordination/legacy-blackboard.js';
import { type CommandRunner } from './verification/index.js';
import type { VerificationResult, VerificationStrategyType } from './verification/verify-result.js';
import type { VerificationStrategyConfig } from './verification/verification-strategies.js';
export type GateVerifierType = VerificationStrategyType | 'custom' | 'manual_review';
export interface CustomCriterion {
    name: string;
    /** Relative weight for confidence scoring (default 1). */
    weight?: number;
    evaluate: (ctx: CustomCriterionContext) => Promise<CustomCriterionResult> | CustomCriterionResult;
}
export interface CustomCriterionContext {
    goal: string;
    iteration: number;
    hadWaveBlockers?: boolean;
}
export interface CustomCriterionResult {
    pass: boolean;
    message: string;
}
export interface GateResult {
    type: GateVerifierType;
    name: string;
    pass: boolean;
    required: boolean;
    weight: number;
    durationMs: number;
    confidence: number;
    failures: string[];
    skipped?: boolean;
    skipReason?: string;
}
export interface EvaluationGateResult extends VerificationResult {
    /** Weighted pass confidence across required gates (0–1). */
    confidence: number;
    gates: GateResult[];
    /** True when all required gates passed and confidence >= minConfidence. */
    accepted: boolean;
    /** Exit condition preview when configured (full eval at iteration end). */
    exitPreview?: {
        wouldExit: boolean;
        reason: string;
    };
}
export interface EvaluationGateOptions {
    cwd?: string;
    goal?: string;
    iteration?: number;
    hadWaveBlockers?: boolean;
    templateFilter?: VerificationStrategyType[];
    /** Pre-resolved strategies — when set, overrides config + templateFilter merge. */
    strategies?: VerificationStrategyConfig[];
    customCriteria?: CustomCriterion[];
    /** When true, manual_review gate must explicitly approve. */
    requireManualReview?: boolean;
    /** Pre-set manual review outcome (tests / HITL). */
    manualReviewApproved?: boolean;
    minConfidence?: number;
    runner?: CommandRunner;
    blackboard?: Blackboard;
    /** Exit conditions evaluated after gate run (informational in gate summary). */
    exitConditions?: import('./loop-phases.js').ExitConditionConfig[];
    /** Live dashboard callback during strategy execution. */
    onStrategyProgress?: (type: VerificationStrategyType, status: 'running' | 'pass' | 'fail' | 'skipped', meta?: {
        weight?: number;
        confidence?: number;
    }) => void;
}
/**
 * EvaluationGate — unified pass/fail gate with automated checks, custom criteria,
 * optional manual review, and confidence scoring.
 */
export declare class EvaluationGate {
    private readonly opts;
    constructor(opts?: EvaluationGateOptions);
    evaluate(): Promise<EvaluationGateResult>;
    /** Build gate from pre-computed strategy configs (testing helpers). */
    static fromStrategies(strategies: VerificationStrategyConfig[], runner?: CommandRunner): EvaluationGate;
}
export declare function evaluationResultToLoopState(result: EvaluationGateResult): {
    pass: boolean;
    summary: string;
    at: number;
    durationMs: number;
    confidence: number;
    accepted: boolean;
    strategies: Array<{
        type: string;
        pass: boolean;
        durationMs: number;
        failures?: string[];
    }>;
};
/**
 * ## Component Complete
 * EvaluationGate aggregates automated verifiers, custom criteria, and optional manual review
 * into a single pass/fail decision with weighted confidence scoring for closed-loop retry logic.
 */
//# sourceMappingURL=evaluation-gate.d.ts.map