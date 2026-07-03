/**
 * ## Assumptions
 * - Role-based routing for Loop Engineering — independent of orchestrator/model-router.ts (complexity tiers).
 * - Default dispatch is Cursor SDK (`loop_engine.default_dispatch: cursor_sdk`); direct OpenRouter/Ollama when disabled.
 * - Dispatch decision tree (per role):
 *     1. SDK circuit open after SDK failures → direct provider chain
 *     2. models.<role>.use_cursor_sdk: false → direct
 *     3. ROLAND_MODEL_<ROLE>_PROVIDER set to non-cursor → direct (e.g. ollama)
 *     4. loop_engine.default_dispatch: direct → direct
 *     5. Otherwise → Cursor SDK (maps configured model → SDK id)
 * - Provider fallback (recordFailure) applies to direct dispatch; SDK failures use recordSdkFailure().
 * - Env vars ROLAND_MODEL_<ROLE> and ROLAND_MODEL_<ROLE>_PROVIDER override per-role YAML.
 */
export type ModelProvider = 'openrouter' | 'ollama' | 'cursor' | 'groq' | 'openai';
/** How a role's model call is executed at runtime. */
export type DispatchMethod = 'cursor_sdk' | 'direct';
/** Global default dispatch backend from loop_engine.default_dispatch. */
export type DefaultDispatchPolicy = DispatchMethod;
export interface RoleModelSpec {
    provider: ModelProvider;
    model: string;
    fallback?: RoleModelSpec;
    /** Per-role override: false forces direct; true forces SDK when available. */
    use_cursor_sdk?: boolean;
}
export interface ModelsConfig {
    pm?: RoleModelSpec;
    coding?: RoleModelSpec;
    critic?: RoleModelSpec;
    verifier?: RoleModelSpec;
    researcher?: RoleModelSpec;
    planner?: RoleModelSpec;
    executor?: RoleModelSpec;
    reviewer?: RoleModelSpec;
    reasoning?: RoleModelSpec;
    light?: RoleModelSpec;
}
export type ModelRole = 'pm' | 'coding' | 'critic' | 'verifier' | 'researcher' | 'planner' | 'executor' | 'reviewer' | 'reasoning' | 'light';
export interface ResolvedModel {
    role: ModelRole;
    provider: ModelProvider;
    model: string;
    isFallback: boolean;
    /** Human-readable label for logs, dashboard, and PR metadata. */
    displayLabel: string;
}
/** Full dispatch resolution — SDK id or direct provider model. */
export interface ResolvedDispatch {
    role: ModelRole;
    method: DispatchMethod;
    /** Effective model id/string for the active backend. */
    model: string;
    provider: ModelProvider;
    sdkModelId?: string;
    /** Underlying direct provider config (always populated for fallback chain). */
    directModel: ResolvedModel;
    displayLabel: string;
    isFallback: boolean;
    /** Human-readable explanation of dispatch method selection. */
    reason: string;
}
export interface ModelWithFallbackChain {
    role: ModelRole;
    primary: ResolvedModel;
    fallback?: ResolvedModel;
    /** Active model after degradation (primary or fallback). */
    active: ResolvedModel;
    chain: ResolvedModel[];
}
export interface ModelRouterValidation {
    ok: boolean;
    missing: ModelRole[];
    warnings: string[];
    /** Dispatch-specific startup warnings (SDK context, circuit state). */
    dispatchWarnings: string[];
    defaultDispatch: DefaultDispatchPolicy;
    cursorSdkAvailable: boolean;
}
export declare class ModelRouterError extends Error {
    readonly role?: string;
    constructor(message: string, role?: string);
}
export declare const DEFAULT_MODELS_CONFIG: ModelsConfig;
/** Load `models` section from config.yaml, with backward compat from `pm` section. */
export declare function loadModelsConfigFromYaml(configPath?: string): ModelsConfig;
export declare function getModelRouter(): ModelRouter;
export declare function initModelRouter(config?: ModelsConfig, defaultDispatch?: DefaultDispatchPolicy): ModelRouter;
export declare function resetModelRouter(): void;
export declare class ModelRouter {
    private readonly roleConfigs;
    private readonly defaultDispatch;
    private readonly degradedRoles;
    private readonly sdkDisabledRoles;
    private lastDegradeReason?;
    private lastSdkDisableReason?;
    constructor(config?: ModelsConfig, defaultDispatch?: DefaultDispatchPolicy);
    static fromConfig(configPath?: string): ModelRouter;
    /** Normalize arbitrary role / agent / phase / lane string to a canonical ModelRole. */
    static normalizeRole(input: string): ModelRole;
    static roleForPhase(phase: string): ModelRole;
    static roleForAgent(agentName: string): ModelRole;
    /** Primary entry — resolve model + provider for a role (with degradation fallback). */
    getModel(role: ModelRole | string): ResolvedModel;
    /**
     * Full fallback chain for a role — primary, optional configured fallback, and active selection.
     * Use when displaying routing or wiring provider clients that need explicit fallbacks.
     */
    getModelWithFallback(role: ModelRole | string): ModelWithFallbackChain;
    /** Validate required loop roles — call at ClosedLoop / loop mission startup. */
    static validateOnStartup(router?: ModelRouter): ModelRouterValidation;
    private getRoleSpec;
    getModelForPhase(phase: string): ResolvedModel;
    getModelForAgent(agentName: string): ResolvedModel;
    getDefaultDispatch(): DefaultDispatchPolicy;
    /** True when CURSOR_API_KEY is set (SDK dispatch can run). */
    isCursorSdkAvailable(): boolean;
    getSdkDisabledRoles(): ReadonlySet<ModelRole>;
    /**
     * Resolve dispatch method + effective model for a role.
     * Cursor SDK is attempted first unless disabled by config/env/circuit.
     */
    resolveDispatch(role: ModelRole | string, opts?: {
        agentName?: string;
        yamlModel?: string;
        phase?: string;
        log?: boolean;
    }): ResolvedDispatch;
    resolveDispatchForPhase(phase: string, opts?: {
        agentName?: string;
        yamlModel?: string;
        log?: boolean;
    }): ResolvedDispatch;
    /** Log dispatch decision — call once per phase transition or agent spawn. */
    logDispatch(dispatch: ResolvedDispatch, phase?: string): void;
    /**
     * Record SDK dispatch failure — opens SDK circuit for role and returns direct dispatch.
     * Chain: SDK failure → direct primary → recordFailure() for provider fallback.
     */
    recordSdkFailure(role: ModelRole | string, errorMessage: string): ResolvedDispatch;
    isSdkFailure(message: string): boolean;
    private pickDispatchMethod;
    private buildDispatchReason;
    /**
     * Record a failure for a role; returns the model to use after degradation.
     * Only triggers fallback on rate-limit / unavailable errors.
     */
    recordFailure(role: ModelRole | string, errorMessage: string): ResolvedModel;
    isRateLimitOrUnavailable(message: string): boolean;
    /** Active routing table for all roles (primary or degraded). */
    getActiveRouting(): Record<ModelRole, ResolvedModel>;
    /** One-line summary for CLI banners. */
    formatRoutingSummary(): string;
    /** Multi-line table for logs and Mission Objectives. */
    formatRoutingBanner(): string[];
    /**
     * Beautiful startup banner — printed at the start of every loop-template mission.
     */
    formatStartupBanner(templateId?: string, executionMode?: string): string[];
    /** Full config summary for loop mission startup (banner + PM mode + routing). */
    formatLoopRunConfigSummary(ctx: {
        templateId: string;
        canonicalTemplateId?: string;
        pmEnabled: boolean;
        pmReason: string;
        usePmTeam?: boolean;
        defaultDispatch?: DefaultDispatchPolicy;
        spawnSummary?: string | null;
        verificationSummary?: string | null;
        betweenIterSummary?: string | null;
        minConfidence?: number;
        hitlGitCommitEnabled?: boolean;
    }): string[];
    /** JSON-safe snapshot for run-state.json and dashboard. */
    serializeRoutingForState(): {
        summary: string;
        defaultDispatch: DefaultDispatchPolicy;
        cursorSdkAvailable: boolean;
        roles: Record<string, {
            provider: string;
            model: string;
            displayLabel: string;
            isFallback: boolean;
            dispatchMethod: DispatchMethod;
            sdkModelId?: string;
            directProvider: string;
            directModel: string;
        }>;
        phaseModels: Record<string, string>;
        phaseDispatch: Record<string, DispatchMethod>;
    };
    /**
     * Resolve a Cursor SDK model id — delegates to resolveDispatch().
     * Returns SDK id when dispatch method is cursor_sdk; direct model string otherwise.
     */
    resolveSdkModelId(agentName: string, yamlModel?: string): string;
    logRoutingBanner(): void;
    logStartupBanner(templateId?: string, executionMode?: string): void;
    logLoopRunConfigSummary(ctx: {
        templateId: string;
        canonicalTemplateId?: string;
        pmEnabled: boolean;
        pmReason: string;
        usePmTeam?: boolean;
        defaultDispatch?: DefaultDispatchPolicy;
        spawnSummary?: string | null;
        verificationSummary?: string | null;
        betweenIterSummary?: string | null;
        minConfidence?: number;
        hitlGitCommitEnabled?: boolean;
    }): void;
    getDegradedRoles(): ReadonlySet<ModelRole>;
    resetDegradation(): void;
}
/**
 * ## Cursor SDK Default Confirmed + Loop Engineering Readiness
 *
 * Dispatch decision tree lives in `resolveDispatch()` / `recordSdkFailure()`.
 * Default: Cursor SDK for all roles unless disabled via config/env/circuit.
 *
 * ```yaml
 * loop_engine:
 *   default_dispatch: cursor_sdk   # default
 *   use_pm_team: false
 * models:
 *   pm: { provider: openrouter, model: grok-4.3, use_cursor_sdk: true }
 *   coding: { provider: openrouter, model: qwen/qwen3-coder-next, use_cursor_sdk: false }  # force direct
 * ```
 *
 * Env: `ROLAND_DEFAULT_DISPATCH=direct` · `ROLAND_MODEL_CODING_PROVIDER=ollama` forces direct for coding.
 */
export {};
//# sourceMappingURL=model-router.d.ts.map