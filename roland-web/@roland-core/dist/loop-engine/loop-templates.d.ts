/**
 * ## Assumptions
 * - Loop templates are generic-first YAML under recipes/loops/ (or templates_dir override).
 * - Deprecated names resolve via alias_of or TEMPLATE_ALIASES for backward compatibility.
 * - Project-specific commands belong in config.yaml, not template YAML.
 * - Malformed templates surface as load errors; lint runs in loop:ready-check.
 */
import { z } from 'zod';
import type { LoopTemplate } from './loop-phases.js';
import { Phase } from './loop-phases.js';
/** Canonical generic templates — readiness gate expects these to exist (7 templates). */
export declare const CORE_GENERIC_TEMPLATES: readonly ["small-fix-loop", "standard-code-loop", "feature-implementation-loop", "refactor-and-modernize-loop", "research-and-plan-loop", "full-cycle-verified-loop", "maintenance-loop"];
/** Backward-compatible aliases when alias_of is not in YAML. */
export declare const TEMPLATE_ALIASES: Record<string, string>;
export declare const LoopTemplateSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    deprecated: z.ZodOptional<z.ZodBoolean>;
    alias_of: z.ZodOptional<z.ZodString>;
    phases: z.ZodArray<z.ZodObject<{
        phase: z.ZodEffects<z.ZodString, Phase, string>;
        label: z.ZodOptional<z.ZodString>;
        agent: z.ZodOptional<z.ZodString>;
        optional: z.ZodOptional<z.ZodBoolean>;
        verification: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodEnum<["unit", "integration", "smoke", "e2e", "lint", "typecheck"]>, z.ZodObject<{
            type: z.ZodEnum<["unit", "integration", "smoke", "e2e", "lint", "typecheck"]>;
            command: z.ZodOptional<z.ZodString>;
            timeout_ms: z.ZodOptional<z.ZodNumber>;
            optional: z.ZodOptional<z.ZodBoolean>;
            weight: z.ZodOptional<z.ZodNumber>;
            success_threshold: z.ZodOptional<z.ZodNumber>;
            min_confidence: z.ZodOptional<z.ZodNumber>;
            dry_run: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            type: "unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck";
            command?: string | undefined;
            optional?: boolean | undefined;
            weight?: number | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }, {
            type: "unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck";
            command?: string | undefined;
            optional?: boolean | undefined;
            weight?: number | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        }>]>, "many">>;
        after: z.ZodOptional<z.ZodObject<{
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
        }>>;
        between_iterations: z.ZodOptional<z.ZodObject<{
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
        }>>;
        pm_team: z.ZodOptional<z.ZodEnum<["auto", "always", "never"]>>;
        specialist_spawns: z.ZodOptional<z.ZodArray<z.ZodObject<{
            role: z.ZodString;
            count: z.ZodOptional<z.ZodNumber>;
            primary: z.ZodOptional<z.ZodBoolean>;
            prompt_template: z.ZodOptional<z.ZodString>;
            conditions: z.ZodOptional<z.ZodObject<{
                iteration_min: z.ZodOptional<z.ZodNumber>;
                iteration_max: z.ZodOptional<z.ZodNumber>;
                retry_min: z.ZodOptional<z.ZodNumber>;
                first_iteration_only: z.ZodOptional<z.ZodBoolean>;
                after_first_iteration: z.ZodOptional<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            }, {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            }>>;
            optional: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            role: string;
            optional?: boolean | undefined;
            count?: number | undefined;
            primary?: boolean | undefined;
            prompt_template?: string | undefined;
            conditions?: {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            } | undefined;
        }, {
            role: string;
            optional?: boolean | undefined;
            count?: number | undefined;
            primary?: boolean | undefined;
            prompt_template?: string | undefined;
            conditions?: {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            } | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        phase: Phase;
        agent?: string | undefined;
        optional?: boolean | undefined;
        between_iterations?: {
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
        verification?: ("unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck" | {
            type: "unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck";
            command?: string | undefined;
            optional?: boolean | undefined;
            weight?: number | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        })[] | undefined;
        label?: string | undefined;
        after?: {
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
        pm_team?: "never" | "auto" | "always" | undefined;
        specialist_spawns?: {
            role: string;
            optional?: boolean | undefined;
            count?: number | undefined;
            primary?: boolean | undefined;
            prompt_template?: string | undefined;
            conditions?: {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            } | undefined;
        }[] | undefined;
    }, {
        phase: string;
        agent?: string | undefined;
        optional?: boolean | undefined;
        between_iterations?: {
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
        verification?: ("unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck" | {
            type: "unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck";
            command?: string | undefined;
            optional?: boolean | undefined;
            weight?: number | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        })[] | undefined;
        label?: string | undefined;
        after?: {
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
        pm_team?: "never" | "auto" | "always" | undefined;
        specialist_spawns?: {
            role: string;
            optional?: boolean | undefined;
            count?: number | undefined;
            primary?: boolean | undefined;
            prompt_template?: string | undefined;
            conditions?: {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            } | undefined;
        }[] | undefined;
    }>, "many">;
    maxIterations: z.ZodOptional<z.ZodNumber>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    escalationThreshold: z.ZodOptional<z.ZodNumber>;
    testModeMaxRetries: z.ZodOptional<z.ZodNumber>;
    testModeEscalationThreshold: z.ZodOptional<z.ZodNumber>;
    timeout_ms: z.ZodOptional<z.ZodNumber>;
    exponential_backoff: z.ZodOptional<z.ZodBoolean>;
    kickoff: z.ZodOptional<z.ZodString>;
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
    reflection: z.ZodOptional<z.ZodBoolean>;
    min_confidence: z.ZodOptional<z.ZodNumber>;
    exit_conditions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["all_gates_pass", "confidence_streak", "command_success"]>;
        description: z.ZodOptional<z.ZodString>;
        minConfidence: z.ZodOptional<z.ZodNumber>;
        consecutiveIterations: z.ZodOptional<z.ZodNumber>;
        command: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "all_gates_pass" | "confidence_streak" | "command_success";
        id?: string | undefined;
        description?: string | undefined;
        command?: string | undefined;
        minConfidence?: number | undefined;
        consecutiveIterations?: number | undefined;
    }, {
        type: "all_gates_pass" | "confidence_streak" | "command_success";
        id?: string | undefined;
        description?: string | undefined;
        command?: string | undefined;
        minConfidence?: number | undefined;
        consecutiveIterations?: number | undefined;
    }>, "many">>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    pm_plan: z.ZodOptional<z.ZodEnum<["auto", "always", "never"]>>;
    pm_act: z.ZodOptional<z.ZodEnum<["auto", "always", "never"]>>;
    use_pm_team: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    description: string;
    name: string;
    phases: {
        phase: Phase;
        agent?: string | undefined;
        optional?: boolean | undefined;
        between_iterations?: {
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
        verification?: ("unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck" | {
            type: "unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck";
            command?: string | undefined;
            optional?: boolean | undefined;
            weight?: number | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        })[] | undefined;
        label?: string | undefined;
        after?: {
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
        pm_team?: "never" | "auto" | "always" | undefined;
        specialist_spawns?: {
            role: string;
            optional?: boolean | undefined;
            count?: number | undefined;
            primary?: boolean | undefined;
            prompt_template?: string | undefined;
            conditions?: {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            } | undefined;
        }[] | undefined;
    }[];
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
    min_confidence?: number | undefined;
    exponential_backoff?: boolean | undefined;
    use_pm_team?: boolean | undefined;
    maxRetries?: number | undefined;
    escalationThreshold?: number | undefined;
    deprecated?: boolean | undefined;
    alias_of?: string | undefined;
    maxIterations?: number | undefined;
    testModeMaxRetries?: number | undefined;
    testModeEscalationThreshold?: number | undefined;
    kickoff?: string | undefined;
    reflection?: boolean | undefined;
    exit_conditions?: {
        type: "all_gates_pass" | "confidence_streak" | "command_success";
        id?: string | undefined;
        description?: string | undefined;
        command?: string | undefined;
        minConfidence?: number | undefined;
        consecutiveIterations?: number | undefined;
    }[] | undefined;
    parameters?: Record<string, unknown> | undefined;
    pm_plan?: "never" | "auto" | "always" | undefined;
    pm_act?: "never" | "auto" | "always" | undefined;
}, {
    name: string;
    phases: {
        phase: string;
        agent?: string | undefined;
        optional?: boolean | undefined;
        between_iterations?: {
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
        verification?: ("unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck" | {
            type: "unit" | "integration" | "smoke" | "e2e" | "lint" | "typecheck";
            command?: string | undefined;
            optional?: boolean | undefined;
            weight?: number | undefined;
            timeout_ms?: number | undefined;
            dry_run?: boolean | undefined;
            min_confidence?: number | undefined;
            success_threshold?: number | undefined;
        })[] | undefined;
        label?: string | undefined;
        after?: {
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
        pm_team?: "never" | "auto" | "always" | undefined;
        specialist_spawns?: {
            role: string;
            optional?: boolean | undefined;
            count?: number | undefined;
            primary?: boolean | undefined;
            prompt_template?: string | undefined;
            conditions?: {
                iteration_min?: number | undefined;
                iteration_max?: number | undefined;
                retry_min?: number | undefined;
                first_iteration_only?: boolean | undefined;
                after_first_iteration?: boolean | undefined;
            } | undefined;
        }[] | undefined;
    }[];
    description?: string | undefined;
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
    min_confidence?: number | undefined;
    exponential_backoff?: boolean | undefined;
    use_pm_team?: boolean | undefined;
    maxRetries?: number | undefined;
    escalationThreshold?: number | undefined;
    deprecated?: boolean | undefined;
    alias_of?: string | undefined;
    maxIterations?: number | undefined;
    testModeMaxRetries?: number | undefined;
    testModeEscalationThreshold?: number | undefined;
    kickoff?: string | undefined;
    reflection?: boolean | undefined;
    exit_conditions?: {
        type: "all_gates_pass" | "confidence_streak" | "command_success";
        id?: string | undefined;
        description?: string | undefined;
        command?: string | undefined;
        minConfidence?: number | undefined;
        consecutiveIterations?: number | undefined;
    }[] | undefined;
    parameters?: Record<string, unknown> | undefined;
    pm_plan?: "never" | "auto" | "always" | undefined;
    pm_act?: "never" | "auto" | "always" | undefined;
}>;
export type TemplateLintSeverity = 'error' | 'warn';
export interface TemplateLintIssue {
    template: string;
    file?: string;
    severity: TemplateLintSeverity;
    code: string;
    message: string;
}
export interface TemplateLoadError {
    file: string;
    message: string;
}
/** Lint a single template for generic-first best practices. */
export declare function lintLoopTemplate(template: LoopTemplate): TemplateLintIssue[];
/** Lint all loaded templates. */
export declare function lintAllLoopTemplates(templates: LoopTemplates): TemplateLintIssue[];
export interface LoopTemplateListEntry {
    name: string;
    description: string;
    phaseCount: number;
    deprecated?: boolean;
    aliasOf?: string;
    isCoreGeneric: boolean;
    phases: Array<{
        phase: string;
        label?: string;
        agent?: string;
    }>;
    executionModes: {
        usePmTeam: boolean;
        pmPlan?: string;
        pmAct?: string;
    };
    hasCustomSpawns: boolean;
    spawnSummary: string | null;
    verificationSummary: string | null;
    betweenIterationsSummary: string | null;
    phaseAfterHooks: string[];
}
/** Summarize non-default specialist spawns for logs and dashboard. */
export declare function summarizeTemplateSpawns(template: LoopTemplate): string | null;
export declare class LoopTemplates {
    private readonly dir;
    private cache;
    private loadErrors;
    constructor(dir?: string);
    list(): Array<{
        name: string;
        description: string;
        phaseCount: number;
        deprecated?: boolean;
    }>;
    /** Rich catalog for dashboard /api/loop-templates — metadata, phases, execution modes, spawns. */
    listDetailed(): LoopTemplateListEntry[];
    /** All templates including deprecated (for lint). */
    listAll(): LoopTemplate[];
    getLoadErrors(): TemplateLoadError[];
    get(name: string): LoopTemplate | undefined;
    /** Resolve template name through alias_of chains (max depth 4). */
    resolveName(name: string): string;
    getDefault(): LoopTemplate | undefined;
    private load;
    static resolveLoopsDir(): string;
}
/** Catalog payload for GET /api/loop-templates. */
export declare function buildLoopTemplateCatalog(): {
    templates: LoopTemplateListEntry[];
    defaultTemplate: string;
    coreGeneric: readonly string[];
    loadErrors: TemplateLoadError[];
};
/**
 * ## Verification Strategies + Between-Iterations Hooks Complete
 *
 * **Example YAML:**
 * ```yaml
 * between_iterations:
 *   action: run-tests
 *   optional: true
 * phases:
 *   - phase: verify
 *     verification:
 *       - type: unit
 *       - type: smoke
 *         optional: true
 * ```
 *
 * **Dashboard API:** `GET /api/loop-templates` includes verificationSummary + betweenIterationsSummary
 */
//# sourceMappingURL=loop-templates.d.ts.map