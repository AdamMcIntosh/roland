/**
 * ## Assumptions
 * - Template YAML verification merges with loop_engine.verification.strategies by type.
 * - Shorthand verification arrays (type names only) filter config strategies — backward compatible.
 * - Between-iterations hooks resolve: phase.after → template.between_iterations → config.between_iterations.
 * - Built-in actions expand to project commands from config where possible.
 */
import type { BetweenIterationsBuiltinAction, BetweenIterationsHookConfig, LoopTemplate, PhaseConfig } from './loop-phases.js';
import { type VerificationStrategyConfig } from './verification/verification-strategies.js';
export interface ResolvedBetweenIterationsHook {
    command: string;
    label: string;
    timeoutMs: number;
    optional: boolean;
    dryRun: boolean;
    exitOnFailure: boolean;
    /** When true, skip command execution (critique-only and dry-run). */
    noOp: boolean;
    source: 'template' | 'phase-after' | 'phase-between' | 'config' | 'builtin';
    /** Built-in action when set (git-commit uses dedicated handler). */
    action?: BetweenIterationsBuiltinAction;
    /** git-commit action options. */
    gitCommit?: {
        messageTemplate: string;
        includeFiles?: string[];
        autoStage: boolean;
        dryRun: boolean;
        requireApproval: boolean;
        approvalTimeoutMs: number;
        autoRejectOnTimeout: boolean;
    };
}
/** Normalize legacy string or object hook config from YAML. */
export declare function normalizeBetweenIterationsHook(raw: string | BetweenIterationsHookConfig | undefined): BetweenIterationsHookConfig | undefined;
/** Resolve between-iterations hook: phase.after → phase.betweenIterations → template → config. */
export declare function resolveBetweenIterationsHook(template: LoopTemplate, scope?: {
    phaseConfig?: PhaseConfig;
}): ResolvedBetweenIterationsHook | undefined;
/** Backward-compatible string command for exit conditions and legacy callers. */
export declare function resolveBetweenIterationsCommand(template: LoopTemplate): string | undefined;
/** Merge template phase verification with loop_engine.verification.strategies. */
export declare function resolveVerificationStrategies(template: LoopTemplate, phaseConfig?: PhaseConfig): VerificationStrategyConfig[];
/** Verification summary for verify phase (or first verify phase in template). */
export declare function summarizeVerificationConfig(template: LoopTemplate): string | null;
/** Resolve EvaluationGate min_confidence: template → config → default. */
export declare function resolveMinConfidence(template: LoopTemplate, override?: number): number;
/** Between-iterations hook summary for logs and dashboard. */
export declare function summarizeBetweenIterationsConfig(template: LoopTemplate): string | null;
/** Phase-level after hooks declared in template. */
export declare function listPhaseAfterHooks(template: LoopTemplate): string[];
/**
 * ## Verification Strategies + Between-Iterations Hooks Complete
 *
 * Central resolution for declarative loop template verification and hooks.
 */
//# sourceMappingURL=loop-template-resolution.d.ts.map