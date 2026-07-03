/**
 * ## Assumptions
 * - Loaded from config.yaml `loop_engine` section only.
 * - `default_dispatch: cursor_sdk` is the Loop Engineering default unless overridden.
 * - Env `ROLAND_DEFAULT_DISPATCH=direct` overrides YAML.
 */
import { z } from 'zod';
import type { LoopTemplate } from './loop-phases.js';
export declare const LoopEngineConfigSchema: z.ZodObject<{
    default_template: z.ZodOptional<z.ZodString>;
    templates_dir: z.ZodOptional<z.ZodString>;
    /** Default between-iteration shell command when template omits between_iterations. */
    between_iterations: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        action: z.ZodOptional<z.ZodEnum<["run-tests", "git-commit", "critique-only"]>>;
        command: z.ZodOptional<z.ZodString>;
        timeout_ms: z.ZodOptional<z.ZodNumber>;
        optional: z.ZodOptional<z.ZodBoolean>;
        dry_run: z.ZodOptional<z.ZodBoolean>;
        exit_on_failure: z.ZodOptional<z.ZodBoolean>;
        message_template: z.ZodOptional<z.ZodString>;
        include_files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        auto_stage: z.ZodOptional<z.ZodBoolean>;
        require_approval: z.ZodOptional<z.ZodBoolean>;
        approval_timeout_ms: z.ZodOptional<z.ZodNumber>;
        auto_reject_on_timeout: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        command?: string | undefined;
        optional?: boolean | undefined;
        action?: "run-tests" | "git-commit" | "critique-only" | undefined;
        timeout_ms?: number | undefined;
        dry_run?: boolean | undefined;
        exit_on_failure?: boolean | undefined;
        message_template?: string | undefined;
        include_files?: string[] | undefined;
        auto_stage?: boolean | undefined;
        require_approval?: boolean | undefined;
        approval_timeout_ms?: number | undefined;
        auto_reject_on_timeout?: boolean | undefined;
    }, {
        command?: string | undefined;
        optional?: boolean | undefined;
        action?: "run-tests" | "git-commit" | "critique-only" | undefined;
        timeout_ms?: number | undefined;
        dry_run?: boolean | undefined;
        exit_on_failure?: boolean | undefined;
        message_template?: string | undefined;
        include_files?: string[] | undefined;
        auto_stage?: boolean | undefined;
        require_approval?: boolean | undefined;
        approval_timeout_ms?: number | undefined;
        auto_reject_on_timeout?: boolean | undefined;
    }>]>>;
    verification: z.ZodOptional<z.ZodObject<{
        require_pass_before_critique: z.ZodOptional<z.ZodBoolean>;
        min_confidence: z.ZodOptional<z.ZodNumber>;
        strategies: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEffects<z.ZodString, import("./index.js").VerificationStrategyType, string>;
            command: z.ZodOptional<z.ZodString>;
            timeout_ms: z.ZodOptional<z.ZodNumber>;
            optional: z.ZodOptional<z.ZodBoolean>;
            weight: z.ZodOptional<z.ZodNumber>;
            success_threshold: z.ZodOptional<z.ZodNumber>;
            min_confidence: z.ZodOptional<z.ZodNumber>;
            dry_run: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            type: import("./index.js").VerificationStrategyType;
            weight?: number | undefined;
            command?: string | undefined;
            optional?: boolean | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }, {
            type: string;
            weight?: number | undefined;
            command?: string | undefined;
            optional?: boolean | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        require_pass_before_critique?: boolean | undefined;
        min_confidence?: number | undefined;
        strategies?: {
            type: import("./index.js").VerificationStrategyType;
            weight?: number | undefined;
            command?: string | undefined;
            optional?: boolean | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }[] | undefined;
    }, {
        require_pass_before_critique?: boolean | undefined;
        min_confidence?: number | undefined;
        strategies?: {
            type: string;
            weight?: number | undefined;
            command?: string | undefined;
            optional?: boolean | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }[] | undefined;
    }>>;
    critique: z.ZodOptional<z.ZodObject<{
        max_retries: z.ZodOptional<z.ZodNumber>;
        escalation_threshold: z.ZodOptional<z.ZodNumber>;
        test_mode: z.ZodOptional<z.ZodObject<{
            max_retries: z.ZodOptional<z.ZodNumber>;
            escalation_threshold: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            max_retries?: number | undefined;
            escalation_threshold?: number | undefined;
        }, {
            max_retries?: number | undefined;
            escalation_threshold?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        max_retries?: number | undefined;
        escalation_threshold?: number | undefined;
        test_mode?: {
            max_retries?: number | undefined;
            escalation_threshold?: number | undefined;
        } | undefined;
    }, {
        max_retries?: number | undefined;
        escalation_threshold?: number | undefined;
        test_mode?: {
            max_retries?: number | undefined;
            escalation_threshold?: number | undefined;
        } | undefined;
    }>>;
    retry: z.ZodOptional<z.ZodObject<{
        exponential_backoff: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            base_ms: z.ZodOptional<z.ZodNumber>;
            max_ms: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            base_ms?: number | undefined;
            max_ms?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            base_ms?: number | undefined;
            max_ms?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        exponential_backoff?: {
            enabled?: boolean | undefined;
            base_ms?: number | undefined;
            max_ms?: number | undefined;
        } | undefined;
    }, {
        exponential_backoff?: {
            enabled?: boolean | undefined;
            base_ms?: number | undefined;
            max_ms?: number | undefined;
        } | undefined;
    }>>;
    timeout_ms: z.ZodOptional<z.ZodNumber>;
    use_pm_team: z.ZodOptional<z.ZodBoolean>;
    default_dispatch: z.ZodOptional<z.ZodEnum<["cursor_sdk", "direct"]>>;
}, "strip", z.ZodTypeAny, {
    retry?: {
        exponential_backoff?: {
            enabled?: boolean | undefined;
            base_ms?: number | undefined;
            max_ms?: number | undefined;
        } | undefined;
    } | undefined;
    critique?: {
        max_retries?: number | undefined;
        escalation_threshold?: number | undefined;
        test_mode?: {
            max_retries?: number | undefined;
            escalation_threshold?: number | undefined;
        } | undefined;
    } | undefined;
    verification?: {
        require_pass_before_critique?: boolean | undefined;
        min_confidence?: number | undefined;
        strategies?: {
            type: import("./index.js").VerificationStrategyType;
            weight?: number | undefined;
            command?: string | undefined;
            optional?: boolean | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }[] | undefined;
    } | undefined;
    default_template?: string | undefined;
    templates_dir?: string | undefined;
    timeout_ms?: number | undefined;
    between_iterations?: string | {
        command?: string | undefined;
        optional?: boolean | undefined;
        action?: "run-tests" | "git-commit" | "critique-only" | undefined;
        timeout_ms?: number | undefined;
        dry_run?: boolean | undefined;
        exit_on_failure?: boolean | undefined;
        message_template?: string | undefined;
        include_files?: string[] | undefined;
        auto_stage?: boolean | undefined;
        require_approval?: boolean | undefined;
        approval_timeout_ms?: number | undefined;
        auto_reject_on_timeout?: boolean | undefined;
    } | undefined;
    use_pm_team?: boolean | undefined;
    default_dispatch?: "cursor_sdk" | "direct" | undefined;
}, {
    retry?: {
        exponential_backoff?: {
            enabled?: boolean | undefined;
            base_ms?: number | undefined;
            max_ms?: number | undefined;
        } | undefined;
    } | undefined;
    critique?: {
        max_retries?: number | undefined;
        escalation_threshold?: number | undefined;
        test_mode?: {
            max_retries?: number | undefined;
            escalation_threshold?: number | undefined;
        } | undefined;
    } | undefined;
    verification?: {
        require_pass_before_critique?: boolean | undefined;
        min_confidence?: number | undefined;
        strategies?: {
            type: string;
            weight?: number | undefined;
            command?: string | undefined;
            optional?: boolean | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }[] | undefined;
    } | undefined;
    default_template?: string | undefined;
    templates_dir?: string | undefined;
    timeout_ms?: number | undefined;
    between_iterations?: string | {
        command?: string | undefined;
        optional?: boolean | undefined;
        action?: "run-tests" | "git-commit" | "critique-only" | undefined;
        timeout_ms?: number | undefined;
        dry_run?: boolean | undefined;
        exit_on_failure?: boolean | undefined;
        message_template?: string | undefined;
        include_files?: string[] | undefined;
        auto_stage?: boolean | undefined;
        require_approval?: boolean | undefined;
        approval_timeout_ms?: number | undefined;
        auto_reject_on_timeout?: boolean | undefined;
    } | undefined;
    use_pm_team?: boolean | undefined;
    default_dispatch?: "cursor_sdk" | "direct" | undefined;
}>;
export type LoopEngineConfig = z.infer<typeof LoopEngineConfigSchema> & {
    verification?: {
        require_pass_before_critique?: boolean;
        minConfidence?: number;
        strategies?: Array<{
            type: string;
            command?: string;
            timeoutMs?: number;
            optional?: boolean;
            weight?: number;
            successThreshold?: number;
            minConfidence?: number;
            dryRun?: boolean;
        }>;
    };
    critique?: {
        maxRetries?: number;
        escalationThreshold?: number;
        testMode?: {
            maxRetries?: number;
            escalationThreshold?: number;
        };
    };
    retry?: {
        exponentialBackoff?: {
            enabled?: boolean;
            baseMs?: number;
            maxMs?: number;
        };
    };
    /** Default wall-clock timeout for full loop runs (ms). */
    timeoutMs?: number;
    /** [DEPRECATED] When true, templates with pm_plan/pm_act: auto may invoke legacy PM Team (default false). */
    usePmTeam?: boolean;
    /** Default model dispatch backend for Loop Engineering (default cursor_sdk). */
    defaultDispatch?: 'cursor_sdk' | 'direct';
    /** Project-wide between-iteration hook (templates may override). */
    betweenIterations?: string | import('./loop-phases.js').BetweenIterationsHookConfig;
};
export interface CritiqueThresholds {
    maxRetries: number;
    escalationThreshold: number;
}
/** Resolve retry + escalation thresholds from template, base config, and optional test mode. */
export declare function resolveCritiqueThresholds(template: LoopTemplate, opts?: {
    isTestMode?: boolean;
}): CritiqueThresholds;
export declare function loadLoopEngineConfig(): LoopEngineConfig;
/** Resolve default dispatch policy — env overrides YAML. */
export declare function loadDefaultDispatchPolicy(): 'cursor_sdk' | 'direct';
export declare function clearLoopEngineConfigCache(): void;
/** Resolve between-iteration command: template override → config → undefined. */
export declare function resolveBetweenIterations(template: LoopTemplate): string | undefined;
export { resolveBetweenIterationsCommand } from './loop-template-resolution.js';
export type { ResolvedBetweenIterationsHook } from './loop-template-resolution.js';
//# sourceMappingURL=loop-config.d.ts.map