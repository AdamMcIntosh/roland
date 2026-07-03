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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { DEFAULT_ENGINEER_MODEL, DEFAULT_PM_MODEL, isValidCursorModel, } from '../rco/cursor-models.js';
import { loadDefaultDispatchPolicy } from '../loop-engine/loop-config.js';
export class ModelRouterError extends Error {
    role;
    constructor(message, role) {
        super(message);
        this.name = 'ModelRouterError';
        this.role = role;
    }
}
// ============================================================================
// Defaults — OpenRouter-first, easy Ollama switch via config.yaml
// ============================================================================
export const DEFAULT_MODELS_CONFIG = {
    pm: {
        provider: 'openrouter',
        model: 'grok-4.3',
        fallback: { provider: 'openrouter', model: 'gpt-5.4-nano' },
    },
    coding: {
        provider: 'openrouter',
        model: 'qwen/qwen3-coder-next',
        fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3-0324' },
    },
    critic: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        fallback: { provider: 'openrouter', model: 'minimax/minimax-m2.5' },
    },
    verifier: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-v3-0324',
        fallback: { provider: 'openrouter', model: 'qwen/qwen3-coder-next' },
    },
    researcher: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-v3-0324',
        fallback: { provider: 'openrouter', model: 'qwen/qwen3-coder-next' },
    },
    planner: {
        provider: 'openrouter',
        model: 'minimax/minimax-m2.5',
        fallback: { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    },
    executor: {
        provider: 'openrouter',
        model: 'qwen/qwen3-coder-next',
        fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3-0324' },
    },
    reviewer: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        fallback: { provider: 'openrouter', model: 'minimax/minimax-m2.5' },
    },
    reasoning: {
        provider: 'openrouter',
        model: 'minimax/minimax-m2.5',
        fallback: { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    },
    light: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-v3-0324',
        fallback: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
    },
};
const REQUIRED_LOOP_ROLES = ['pm', 'coding', 'critic', 'verifier'];
function resolveSpecToModel(role, spec, isFallback) {
    return {
        role,
        provider: spec.provider,
        model: spec.model,
        isFallback,
        displayLabel: `${spec.model}@${spec.provider}`,
    };
}
const ALL_ROLES = [
    'pm', 'coding', 'critic', 'verifier', 'researcher',
    'planner', 'executor', 'reviewer', 'reasoning', 'light',
];
const ROLE_ALIASES = {
    pm: 'pm',
    'lead-pm': 'pm',
    'lead_pm': 'pm',
    coding: 'coding',
    executor: 'coding',
    sparrow: 'coding',
    coder: 'coding',
    critic: 'critic',
    sentinel: 'critic',
    'code-reviewer': 'critic',
    verifier: 'verifier',
    'test-executor': 'verifier',
    'test-author': 'verifier',
    researcher: 'researcher',
    oracle: 'researcher',
    planner: 'planner',
    reviewer: 'reviewer',
    reasoning: 'reasoning',
    architect: 'reasoning',
    light: 'light',
    writer: 'light',
    // Legacy critique lane names
    grok: 'critic',
    composer: 'coding',
    high_level: 'critic',
    'high-level': 'critic',
    code_specific: 'coding',
    'code-specific': 'coding',
};
const PHASE_ROLE_MAP = {
    plan: 'pm',
    act: 'coding',
    verify: 'verifier',
    critique: 'critic',
    retry: 'coding',
    escalate: 'pm',
    observe: 'researcher',
    reflect: 'researcher',
};
const RATE_LIMIT_PATTERNS = [
    /rate.?limit/i,
    /429/,
    /too many requests/i,
    /quota exceeded/i,
    /model.*unavailable/i,
    /overloaded/i,
    /capacity/i,
];
/** SDK-specific failure patterns — trigger SDK→direct circuit. */
const SDK_FAILURE_PATTERNS = [
    ...RATE_LIMIT_PATTERNS,
    /401/,
    /403/,
    /unauthorized/i,
    /invalid.*api.*key/i,
    /CURSOR_API_KEY/i,
    /authentication/i,
    /sdk.*error/i,
    /agent.*failed/i,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
];
// ============================================================================
// Config loading
// ============================================================================
function parseProvider(raw) {
    const p = String(raw ?? 'openrouter').toLowerCase().trim();
    if (p === 'ollama' || p === 'cursor' || p === 'groq' || p === 'openai' || p === 'openrouter') {
        return p;
    }
    return 'openrouter';
}
function parseRoleSpec(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const obj = raw;
    const model = String(obj.model ?? '').trim();
    if (!model)
        return undefined;
    const spec = {
        provider: parseProvider(obj.provider),
        model,
    };
    if (obj.fallback && typeof obj.fallback === 'object') {
        const fb = parseRoleSpec(obj.fallback);
        if (fb)
            spec.fallback = fb;
    }
    if (typeof obj.use_cursor_sdk === 'boolean') {
        spec.use_cursor_sdk = obj.use_cursor_sdk;
    }
    return spec;
}
function resolveConfigPath() {
    const candidates = [path.join(process.cwd(), 'config.yaml')];
    try {
        const thisFile = fileURLToPath(import.meta.url);
        const installDir = path.resolve(path.dirname(thisFile), '..');
        candidates.push(path.join(installDir, 'config.yaml'));
        candidates.push(path.join(installDir, '..', 'config.yaml'));
    }
    catch {
        // fall through
    }
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
/** Load `models` section from config.yaml, with backward compat from `pm` section. */
export function loadModelsConfigFromYaml(configPath) {
    const resolved = configPath ?? resolveConfigPath();
    if (!resolved || !fs.existsSync(resolved)) {
        return { ...DEFAULT_MODELS_CONFIG };
    }
    try {
        const doc = yaml.load(fs.readFileSync(resolved, 'utf-8'));
        const modelsSection = doc?.models;
        const pmSection = doc?.pm;
        const ollamaSection = doc?.ollama;
        const merged = { ...DEFAULT_MODELS_CONFIG };
        if (modelsSection && typeof modelsSection === 'object') {
            for (const role of ALL_ROLES) {
                const spec = parseRoleSpec(modelsSection[role]);
                if (spec)
                    merged[role] = spec;
            }
        }
        // Backward compat: derive cursor-native roles from pm section when models.pm absent
        if (!modelsSection && pmSection) {
            const lead = String(pmSection.lead_model ?? DEFAULT_PM_MODEL).trim();
            const standard = String(pmSection.standard_model ?? DEFAULT_ENGINEER_MODEL).trim();
            merged.pm = { provider: 'cursor', model: lead, fallback: merged.pm?.fallback };
            merged.coding = { provider: 'cursor', model: standard, fallback: merged.coding?.fallback };
            merged.executor = { provider: 'cursor', model: standard, fallback: merged.executor?.fallback };
        }
        // When ollama.enabled and no explicit models.coding, optional local override hint
        if (ollamaSection?.enabled && ollamaSection.model) {
            const ollamaModel = String(ollamaSection.model).trim();
            const hasExplicitCoding = modelsSection &&
                typeof modelsSection === 'object' &&
                modelsSection.coding;
            if (!hasExplicitCoding) {
                merged.coding = {
                    provider: 'ollama',
                    model: ollamaModel,
                    fallback: merged.coding?.fallback ?? { provider: 'openrouter', model: 'qwen/qwen3-coder-next' },
                };
            }
        }
        return merged;
    }
    catch {
        return { ...DEFAULT_MODELS_CONFIG };
    }
}
function applyEnvOverrides(config) {
    const result = { ...config };
    for (const role of ALL_ROLES) {
        const envModel = process.env[`ROLAND_MODEL_${role.toUpperCase()}`]?.trim();
        const envProvider = process.env[`ROLAND_MODEL_${role.toUpperCase()}_PROVIDER`]?.trim();
        const envFallbackModel = process.env[`ROLAND_MODEL_${role.toUpperCase()}_FALLBACK`]?.trim();
        const envFallbackProvider = process.env[`ROLAND_MODEL_${role.toUpperCase()}_FALLBACK_PROVIDER`]?.trim();
        if (!envModel && !envProvider)
            continue;
        const base = result[role] ?? DEFAULT_MODELS_CONFIG[role];
        if (!base)
            continue;
        const updated = {
            provider: envProvider ? parseProvider(envProvider) : base.provider,
            model: envModel ?? base.model,
            fallback: base.fallback,
        };
        if (envFallbackModel) {
            updated.fallback = {
                provider: envFallbackProvider ? parseProvider(envFallbackProvider) : (base.fallback?.provider ?? 'openrouter'),
                model: envFallbackModel,
            };
        }
        result[role] = updated;
    }
    return result;
}
// ============================================================================
// ModelRouter
// ============================================================================
let _instance = null;
export function getModelRouter() {
    if (!_instance) {
        _instance = ModelRouter.fromConfig();
    }
    return _instance;
}
export function initModelRouter(config, defaultDispatch) {
    _instance = new ModelRouter(config ?? applyEnvOverrides(loadModelsConfigFromYaml()), defaultDispatch);
    return _instance;
}
export function resetModelRouter() {
    _instance = null;
}
export class ModelRouter {
    roleConfigs;
    defaultDispatch;
    degradedRoles = new Set();
    sdkDisabledRoles = new Set();
    lastDegradeReason;
    lastSdkDisableReason;
    constructor(config = DEFAULT_MODELS_CONFIG, defaultDispatch) {
        this.roleConfigs = new Map();
        for (const role of ALL_ROLES) {
            const spec = config[role] ?? DEFAULT_MODELS_CONFIG[role];
            if (spec)
                this.roleConfigs.set(role, spec);
        }
        this.defaultDispatch = defaultDispatch ?? loadDefaultDispatchPolicy();
    }
    static fromConfig(configPath) {
        try {
            const yamlConfig = loadModelsConfigFromYaml(configPath);
            return new ModelRouter(applyEnvOverrides(yamlConfig));
        }
        catch (err) {
            const hint = err instanceof Error ? err.message : String(err);
            const configHint = resolveConfigPath() ?? '(config.yaml not found in cwd or package dir)';
            throw new ModelRouterError(`Failed to load model routing from ${configHint}. ${hint} ` +
                'Fix config.yaml `models` section or set ROLAND_MODEL_<ROLE> env vars. ' +
                'See config.yaml comments for OpenRouter vs Ollama examples.');
        }
    }
    /** Normalize arbitrary role / agent / phase / lane string to a canonical ModelRole. */
    static normalizeRole(input) {
        const key = input.toLowerCase().trim().replace(/\s+/g, '-');
        return ROLE_ALIASES[key] ?? ROLE_ALIASES[key.replace(/_/g, '-')] ?? 'coding';
    }
    static roleForPhase(phase) {
        return PHASE_ROLE_MAP[phase.toLowerCase()] ?? 'coding';
    }
    static roleForAgent(agentName) {
        return ModelRouter.normalizeRole(agentName);
    }
    /** Primary entry — resolve model + provider for a role (with degradation fallback). */
    getModel(role) {
        const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
        const spec = this.getRoleSpec(canonical);
        const useFallback = Boolean(this.degradedRoles.has(canonical) && spec.fallback);
        const active = useFallback ? spec.fallback : spec;
        return resolveSpecToModel(canonical, active, useFallback);
    }
    /**
     * Full fallback chain for a role — primary, optional configured fallback, and active selection.
     * Use when displaying routing or wiring provider clients that need explicit fallbacks.
     */
    getModelWithFallback(role) {
        const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
        const spec = this.getRoleSpec(canonical);
        const primary = resolveSpecToModel(canonical, spec, false);
        const chain = [primary];
        if (spec.fallback) {
            chain.push(resolveSpecToModel(canonical, spec.fallback, true));
        }
        const active = this.degradedRoles.has(canonical) && chain.length > 1 ? chain[1] : chain[0];
        return {
            role: canonical,
            primary,
            fallback: chain[1],
            active,
            chain,
        };
    }
    /** Validate required loop roles — call at ClosedLoop / loop mission startup. */
    static validateOnStartup(router) {
        const r = router ?? ModelRouter.fromConfig();
        const missing = [];
        const warnings = [];
        const dispatchWarnings = [];
        for (const role of REQUIRED_LOOP_ROLES) {
            try {
                const m = r.getModel(role);
                if (!m.model?.trim())
                    missing.push(role);
            }
            catch {
                missing.push(role);
            }
        }
        for (const role of ALL_ROLES) {
            const chain = r.getModelWithFallback(role);
            if (!chain.fallback) {
                warnings.push(`Role "${role}" has no fallback — rate limits will not auto-degrade`);
            }
        }
        const sdkAvailable = r.isCursorSdkAvailable();
        if (r.getDefaultDispatch() === 'cursor_sdk' && !sdkAvailable) {
            dispatchWarnings.push('default_dispatch=cursor_sdk but CURSOR_API_KEY is not set — runtime will use direct provider fallback');
        }
        for (const role of REQUIRED_LOOP_ROLES) {
            const envP = process.env[`ROLAND_MODEL_${role.toUpperCase()}_PROVIDER`]?.trim();
            if (envP && parseProvider(envP) !== 'cursor') {
                dispatchWarnings.push(`Role "${role}" forced direct via ROLAND_MODEL_${role.toUpperCase()}_PROVIDER=${envP}`);
            }
        }
        if (r.getSdkDisabledRoles().size > 0) {
            dispatchWarnings.push(`SDK circuit open for: ${[...r.getSdkDisabledRoles()].join(', ')} — using direct provider`);
        }
        return {
            ok: missing.length === 0,
            missing,
            warnings,
            dispatchWarnings,
            defaultDispatch: r.getDefaultDispatch(),
            cursorSdkAvailable: sdkAvailable,
        };
    }
    getRoleSpec(canonical) {
        const spec = this.roleConfigs.get(canonical) ?? DEFAULT_MODELS_CONFIG[canonical];
        if (!spec?.model?.trim()) {
            throw new ModelRouterError(`No model configured for role "${canonical}". Add models.${canonical} to config.yaml or set ROLAND_MODEL_${canonical.toUpperCase()}.`, canonical);
        }
        return spec;
    }
    getModelForPhase(phase) {
        return this.getModel(ModelRouter.roleForPhase(phase));
    }
    getModelForAgent(agentName) {
        return this.getModel(ModelRouter.roleForAgent(agentName));
    }
    getDefaultDispatch() {
        return this.defaultDispatch;
    }
    /** True when CURSOR_API_KEY is set (SDK dispatch can run). */
    isCursorSdkAvailable() {
        return Boolean(process.env.CURSOR_API_KEY?.trim());
    }
    getSdkDisabledRoles() {
        return new Set(this.sdkDisabledRoles);
    }
    /**
     * Resolve dispatch method + effective model for a role.
     * Cursor SDK is attempted first unless disabled by config/env/circuit.
     */
    resolveDispatch(role, opts = {}) {
        const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
        const directModel = this.getModel(canonical);
        const method = this.pickDispatchMethod(canonical);
        const yaml = opts.yamlModel?.trim() ?? '';
        if (method === 'cursor_sdk') {
            let sdkId;
            if (yaml && yaml !== 'auto' && isValidCursorModel(yaml)) {
                sdkId = yaml;
            }
            else if (directModel.provider === 'cursor' && isValidCursorModel(directModel.model)) {
                sdkId = directModel.model;
            }
            else {
                sdkId = mapProviderModelToCursorSdk(directModel.model, canonical);
            }
            const dispatch = {
                role: canonical,
                method: 'cursor_sdk',
                model: sdkId,
                provider: 'cursor',
                sdkModelId: sdkId,
                directModel,
                displayLabel: `${sdkId}@cursor_sdk`,
                isFallback: directModel.isFallback,
                reason: this.buildDispatchReason(canonical, 'cursor_sdk'),
            };
            if (opts.log !== false)
                this.logDispatch(dispatch, opts.phase);
            return dispatch;
        }
        const dispatch = {
            role: canonical,
            method: 'direct',
            model: directModel.model,
            provider: directModel.provider,
            directModel,
            displayLabel: `${directModel.displayLabel} (direct)`,
            isFallback: directModel.isFallback,
            reason: this.buildDispatchReason(canonical, 'direct'),
        };
        if (opts.log !== false)
            this.logDispatch(dispatch, opts.phase);
        return dispatch;
    }
    resolveDispatchForPhase(phase, opts = {}) {
        return this.resolveDispatch(ModelRouter.roleForPhase(phase), { ...opts, phase });
    }
    /** Log dispatch decision — call once per phase transition or agent spawn. */
    logDispatch(dispatch, phase) {
        const phaseTag = phase ? ` phase=${phase}` : '';
        const fb = dispatch.isFallback ? ' fallback=active' : '';
        const sdkCircuit = this.sdkDisabledRoles.has(dispatch.role) ? ' sdk_circuit=open' : '';
        const methodLabel = dispatch.method === 'cursor_sdk'
            ? 'Dispatching via Cursor SDK'
            : `Direct provider (${dispatch.provider})`;
        console.error(`[ModelRouter] role=${dispatch.role}${phaseTag} ${methodLabel} → ${dispatch.displayLabel}${fb}${sdkCircuit} (${dispatch.reason})`);
    }
    /**
     * Record SDK dispatch failure — opens SDK circuit for role and returns direct dispatch.
     * Chain: SDK failure → direct primary → recordFailure() for provider fallback.
     */
    recordSdkFailure(role, errorMessage) {
        const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
        if (!this.isSdkFailure(errorMessage)) {
            return this.resolveDispatch(canonical, { log: false });
        }
        this.sdkDisabledRoles.add(canonical);
        this.lastSdkDisableReason = errorMessage.slice(0, 200);
        console.error(`[ModelRouter] role=${canonical} SDK circuit OPEN — switching to direct provider: "${this.lastSdkDisableReason}"`);
        const direct = this.resolveDispatch(canonical, { log: false });
        if (this.isRateLimitOrUnavailable(errorMessage)) {
            this.recordFailure(canonical, errorMessage);
        }
        return this.resolveDispatch(canonical);
    }
    isSdkFailure(message) {
        if (!message)
            return false;
        return SDK_FAILURE_PATTERNS.some((re) => re.test(message));
    }
    pickDispatchMethod(canonical) {
        const spec = this.getRoleSpec(canonical);
        if (this.sdkDisabledRoles.has(canonical))
            return 'direct';
        if (spec.use_cursor_sdk === false)
            return 'direct';
        const envProvider = process.env[`ROLAND_MODEL_${canonical.toUpperCase()}_PROVIDER`]?.trim();
        if (envProvider && parseProvider(envProvider) !== 'cursor')
            return 'direct';
        if (spec.use_cursor_sdk === true) {
            return this.isCursorSdkAvailable() ? 'cursor_sdk' : 'direct';
        }
        if (this.defaultDispatch === 'direct')
            return 'direct';
        if (!this.isCursorSdkAvailable())
            return 'direct';
        return 'cursor_sdk';
    }
    buildDispatchReason(role, method) {
        const spec = this.getRoleSpec(role);
        if (this.sdkDisabledRoles.has(role)) {
            return `SDK circuit open${this.lastSdkDisableReason ? ` — ${this.lastSdkDisableReason}` : ''}`;
        }
        if (spec.use_cursor_sdk === false)
            return 'models.' + role + '.use_cursor_sdk=false';
        if (spec.use_cursor_sdk === true) {
            return this.isCursorSdkAvailable()
                ? 'models.' + role + '.use_cursor_sdk=true'
                : 'use_cursor_sdk=true but CURSOR_API_KEY missing';
        }
        const envProvider = process.env[`ROLAND_MODEL_${role.toUpperCase()}_PROVIDER`]?.trim();
        if (envProvider && parseProvider(envProvider) !== 'cursor') {
            return `ROLAND_MODEL_${role.toUpperCase()}_PROVIDER=${envProvider}`;
        }
        if (this.defaultDispatch === 'direct')
            return 'loop_engine.default_dispatch=direct';
        if (!this.isCursorSdkAvailable())
            return 'default cursor_sdk but CURSOR_API_KEY missing';
        return 'loop_engine.default_dispatch=cursor_sdk (default)';
    }
    /**
     * Record a failure for a role; returns the model to use after degradation.
     * Only triggers fallback on rate-limit / unavailable errors.
     */
    recordFailure(role, errorMessage) {
        const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
        if (!this.isRateLimitOrUnavailable(errorMessage)) {
            return this.getModel(canonical);
        }
        const chain = this.getModelWithFallback(canonical);
        if (!chain.fallback) {
            console.error(`[ModelRouter] role=${canonical} rate-limited but no fallback configured — retrying primary ${chain.primary.displayLabel}`);
            return chain.primary;
        }
        this.degradedRoles.add(canonical);
        this.lastDegradeReason = errorMessage.slice(0, 200);
        const resolved = this.getModel(canonical);
        console.error(`[ModelRouter] role=${canonical} degraded — fallback ${resolved.displayLabel}: "${this.lastDegradeReason}"`);
        return resolved;
    }
    isRateLimitOrUnavailable(message) {
        if (!message)
            return false;
        return RATE_LIMIT_PATTERNS.some((re) => re.test(message));
    }
    /** Active routing table for all roles (primary or degraded). */
    getActiveRouting() {
        const out = {};
        for (const role of ALL_ROLES) {
            out[role] = this.getModel(role);
        }
        return out;
    }
    /** One-line summary for CLI banners. */
    formatRoutingSummary() {
        const keys = ['pm', 'coding', 'critic', 'verifier', 'researcher'];
        return keys
            .map((r) => {
            const d = this.resolveDispatch(r, { log: false });
            const tag = d.method === 'cursor_sdk' ? 'sdk' : d.provider;
            return `${r}=${d.model}@${tag}`;
        })
            .join(' · ');
    }
    /** Multi-line table for logs and Mission Objectives. */
    formatRoutingBanner() {
        const lines = ['[ModelRouter] Active role routing:'];
        for (const role of ALL_ROLES) {
            const m = this.getModel(role);
            const tag = m.isFallback ? ' (fallback)' : '';
            lines.push(`  ${role.padEnd(12)} ${m.displayLabel}${tag}`);
        }
        return lines;
    }
    /**
     * Beautiful startup banner — printed at the start of every loop-template mission.
     */
    formatStartupBanner(templateId, executionMode) {
        const width = 58;
        const border = '═'.repeat(width);
        const lines = [
            `[Loop] ╔${border}╗`,
            `[Loop] ║${' Loop Engineering — Model Router'.padEnd(width)}║`,
        ];
        if (templateId) {
            lines.push(`[Loop] ║${` Template: ${templateId}`.slice(0, width).padEnd(width)}║`);
        }
        if (executionMode) {
            lines.push(`[Loop] ║${` Mode: ${executionMode}`.slice(0, width).padEnd(width)}║`);
        }
        lines.push(`[Loop] ╠${border}╣`);
        for (const role of ['pm', 'coding', 'critic', 'verifier', 'researcher']) {
            const dispatch = this.resolveDispatch(role, { log: false });
            const fb = dispatch.isFallback ? ' ← provider fallback' : '';
            const sdkCircuit = this.sdkDisabledRoles.has(role) ? ' [SDK circuit open]' : '';
            const method = dispatch.method === 'cursor_sdk' ? 'SDK' : `Direct/${dispatch.provider}`;
            const row = ` ${role.padEnd(11)} ${dispatch.model} (${method})${fb}${sdkCircuit}`;
            lines.push(`[Loop] ║${row.slice(0, width).padEnd(width)}║`);
        }
        const dispatchBackend = this.defaultDispatch === 'cursor_sdk'
            ? (this.isCursorSdkAvailable() ? 'Cursor SDK (default)' : 'Cursor SDK (no API key → direct)')
            : 'Direct provider (configured)';
        lines.push(`[Loop] ╠${border}╣`);
        lines.push(`[Loop] ║${` Dispatch: ${dispatchBackend}`.slice(0, width).padEnd(width)}║`);
        lines.push(`[Loop] ╚${border}╝`);
        return lines;
    }
    /** Full config summary for loop mission startup (banner + PM mode + routing). */
    formatLoopRunConfigSummary(ctx) {
        const mode = ctx.pmEnabled
            ? 'PM-Enhanced [DEPRECATED] — use Pure ClosedLoop'
            : 'Pure ClosedLoop — @roland + Roland Loop Engine';
        const canonical = ctx.canonicalTemplateId && ctx.canonicalTemplateId !== ctx.templateId
            ? `${ctx.templateId} → ${ctx.canonicalTemplateId}`
            : ctx.templateId;
        const lines = this.formatStartupBanner(canonical, mode);
        lines.push('[Loop] ── Mission Config ──');
        lines.push(`[Loop]   Template: ${ctx.templateId}`);
        if (ctx.canonicalTemplateId && ctx.canonicalTemplateId !== ctx.templateId) {
            lines.push(`[Loop]   Canonical: ${ctx.canonicalTemplateId} (deprecated alias)`);
        }
        lines.push(`[Loop]   Execution: ${mode}`);
        lines.push(`[Loop]   Dispatch default: ${ctx.defaultDispatch ?? this.defaultDispatch}`);
        lines.push(`[Loop]   Cursor SDK: ${this.isCursorSdkAvailable() ? 'available (CURSOR_API_KEY set)' : 'unavailable — direct fallback active'}`);
        lines.push(`[Loop]   PM policy: ${ctx.pmReason}`);
        if (ctx.usePmTeam !== undefined) {
            lines.push(`[Loop]   loop_engine.use_pm_team: ${ctx.usePmTeam}`);
        }
        if (ctx.spawnSummary) {
            lines.push(`[Loop]   Specialist spawns (template): ${ctx.spawnSummary}`);
        }
        if (ctx.verificationSummary) {
            lines.push(`[Loop]   Verification strategies: ${ctx.verificationSummary}`);
        }
        if (ctx.minConfidence !== undefined) {
            lines.push(`[Loop]   min_confidence: ${ctx.minConfidence}`);
        }
        if (ctx.betweenIterSummary) {
            lines.push(`[Loop]   Between-iterations hook: ${ctx.betweenIterSummary}`);
        }
        if (ctx.hitlGitCommitEnabled) {
            lines.push('[Loop]   HITL git-commit approval: enabled (dashboard or `roland approve-commit`)');
        }
        lines.push(`[Loop]   Effective routing: ${this.formatRoutingSummary()}`);
        const degraded = this.getDegradedRoles();
        if (degraded.size > 0) {
            lines.push(`[Loop]   ⚠ Provider fallback active: ${[...degraded].join(', ')} — direct dispatch uses secondary models`);
        }
        const sdkDisabled = this.getSdkDisabledRoles();
        if (sdkDisabled.size > 0) {
            lines.push(`[Loop]   ⚠ SDK circuit open: ${[...sdkDisabled].join(', ')} — forced direct provider dispatch`);
        }
        if (ctx.pmEnabled) {
            lines.push('[Loop]   [DEPRECATED] Legacy PM Team delegates Plan/Act to team-orchestrator — ' +
                'Prefer Pure ClosedLoop (use_pm_team: false)');
        }
        else {
            lines.push('[Loop]   @roland / Pure ClosedLoop — lightweight Plan/Act · PACVRE harness');
        }
        return lines;
    }
    /** JSON-safe snapshot for run-state.json and dashboard. */
    serializeRoutingForState() {
        const routing = this.getActiveRouting();
        return {
            summary: this.formatRoutingSummary(),
            defaultDispatch: this.defaultDispatch,
            cursorSdkAvailable: this.isCursorSdkAvailable(),
            roles: Object.fromEntries(ALL_ROLES.map((role) => {
                const dispatch = this.resolveDispatch(role, { log: false });
                const direct = routing[role];
                return [
                    role,
                    {
                        provider: dispatch.provider,
                        model: dispatch.model,
                        displayLabel: dispatch.displayLabel,
                        isFallback: dispatch.isFallback,
                        dispatchMethod: dispatch.method,
                        sdkModelId: dispatch.sdkModelId,
                        directProvider: direct.provider,
                        directModel: direct.model,
                    },
                ];
            })),
            phaseModels: Object.fromEntries(['plan', 'act', 'verify', 'critique', 'retry', 'observe', 'reflect'].map((phase) => {
                const d = this.resolveDispatchForPhase(phase, { log: false });
                return [phase, d.displayLabel];
            })),
            phaseDispatch: Object.fromEntries(['plan', 'act', 'verify', 'critique', 'retry', 'observe', 'reflect'].map((phase) => {
                const d = this.resolveDispatchForPhase(phase, { log: false });
                return [phase, d.method];
            })),
        };
    }
    /**
     * Resolve a Cursor SDK model id — delegates to resolveDispatch().
     * Returns SDK id when dispatch method is cursor_sdk; direct model string otherwise.
     */
    resolveSdkModelId(agentName, yamlModel) {
        const dispatch = this.resolveDispatch(ModelRouter.roleForAgent(agentName), {
            agentName,
            yamlModel,
            log: false,
        });
        return dispatch.method === 'cursor_sdk' ? (dispatch.sdkModelId ?? dispatch.model) : dispatch.model;
    }
    logRoutingBanner() {
        for (const line of this.formatStartupBanner()) {
            console.error(line);
        }
    }
    logStartupBanner(templateId, executionMode) {
        for (const line of this.formatStartupBanner(templateId, executionMode)) {
            console.error(line);
        }
    }
    logLoopRunConfigSummary(ctx) {
        for (const line of this.formatLoopRunConfigSummary(ctx)) {
            console.error(line);
        }
    }
    getDegradedRoles() {
        return new Set(this.degradedRoles);
    }
    resetDegradation() {
        this.degradedRoles.clear();
        this.sdkDisabledRoles.clear();
        this.lastDegradeReason = undefined;
        this.lastSdkDisableReason = undefined;
    }
}
/** Map OpenRouter/Ollama model strings to Cursor SDK ids for legacy PM Team dispatch. */
function mapProviderModelToCursorSdk(model, role) {
    const m = model.toLowerCase();
    if (role === 'pm') {
        if (m.includes('grok'))
            return 'grok-4.3';
        if (m.includes('nano'))
            return DEFAULT_PM_MODEL;
        return DEFAULT_PM_MODEL;
    }
    if (m.includes('opus'))
        return 'claude-opus-4-7';
    if (m.includes('sonnet'))
        return 'claude-sonnet-4-6';
    if (m.includes('haiku'))
        return 'claude-haiku-4-5';
    if (m.includes('gemini') && m.includes('pro'))
        return 'gemini-2.5-pro';
    if (m.includes('gemini'))
        return 'gemini-2.5-flash';
    if (m.includes('composer'))
        return DEFAULT_ENGINEER_MODEL;
    return DEFAULT_ENGINEER_MODEL;
}
//# sourceMappingURL=model-router.js.map