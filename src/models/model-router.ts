/**
 * ## Assumptions
 * - Role-based routing for Loop Engineering — independent of orchestrator/model-router.ts (complexity tiers).
 * - Default provider is OpenRouter; switch to full Ollama by changing config.yaml `models` section only.
 * - `provider: cursor` uses Cursor SDK model IDs (backward compat with pm.* config).
 * - Env vars ROLAND_MODEL_<ROLE> and ROLAND_MODEL_<ROLE>_PROVIDER override per-role YAML.
 * - Fallback activates on rate-limit / model-unavailable errors via recordFailure().
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import {
  DEFAULT_ENGINEER_MODEL,
  DEFAULT_PM_MODEL,
  VALID_CURSOR_MODELS,
  isValidCursorModel,
} from '../rco/cursor-models.js';

// ============================================================================
// Types
// ============================================================================

export type ModelProvider = 'openrouter' | 'ollama' | 'cursor' | 'groq' | 'openai';

export type ModelRole =
  | 'pm'
  | 'coding'
  | 'critic'
  | 'verifier'
  | 'researcher'
  | 'planner'
  | 'executor'
  | 'reviewer'
  | 'reasoning'
  | 'light';

export interface RoleModelSpec {
  provider: ModelProvider;
  model: string;
  fallback?: RoleModelSpec;
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

export interface ResolvedModel {
  role: ModelRole;
  provider: ModelProvider;
  model: string;
  isFallback: boolean;
  /** Human-readable label for logs, dashboard, and PR metadata. */
  displayLabel: string;
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
}

export class ModelRouterError extends Error {
  readonly role?: string;
  constructor(message: string, role?: string) {
    super(message);
    this.name = 'ModelRouterError';
    this.role = role;
  }
}

// ============================================================================
// Defaults — OpenRouter-first, easy Ollama switch via config.yaml
// ============================================================================

export const DEFAULT_MODELS_CONFIG: ModelsConfig = {
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

const REQUIRED_LOOP_ROLES: ModelRole[] = ['pm', 'coding', 'critic', 'verifier'];

function resolveSpecToModel(role: ModelRole, spec: RoleModelSpec, isFallback: boolean): ResolvedModel {
  return {
    role,
    provider: spec.provider,
    model: spec.model,
    isFallback,
    displayLabel: `${spec.model}@${spec.provider}`,
  };
}
const ALL_ROLES: ModelRole[] = [
  'pm', 'coding', 'critic', 'verifier', 'researcher',
  'planner', 'executor', 'reviewer', 'reasoning', 'light',
];

const ROLE_ALIASES: Record<string, ModelRole> = {
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

const PHASE_ROLE_MAP: Record<string, ModelRole> = {
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

// ============================================================================
// Config loading
// ============================================================================

function parseProvider(raw: unknown): ModelProvider {
  const p = String(raw ?? 'openrouter').toLowerCase().trim();
  if (p === 'ollama' || p === 'cursor' || p === 'groq' || p === 'openai' || p === 'openrouter') {
    return p;
  }
  return 'openrouter';
}

function parseRoleSpec(raw: unknown): RoleModelSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const model = String(obj.model ?? '').trim();
  if (!model) return undefined;
  const spec: RoleModelSpec = {
    provider: parseProvider(obj.provider),
    model,
  };
  if (obj.fallback && typeof obj.fallback === 'object') {
    const fb = parseRoleSpec(obj.fallback);
    if (fb) spec.fallback = fb;
  }
  return spec;
}

function resolveConfigPath(): string | null {
  const candidates: string[] = [path.join(process.cwd(), 'config.yaml')];
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const installDir = path.resolve(path.dirname(thisFile), '..');
    candidates.push(path.join(installDir, 'config.yaml'));
    candidates.push(path.join(installDir, '..', 'config.yaml'));
  } catch {
    // fall through
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Load `models` section from config.yaml, with backward compat from `pm` section. */
export function loadModelsConfigFromYaml(configPath?: string): ModelsConfig {
  const resolved = configPath ?? resolveConfigPath();
  if (!resolved || !fs.existsSync(resolved)) {
    return { ...DEFAULT_MODELS_CONFIG };
  }

  try {
    const doc = yaml.load(fs.readFileSync(resolved, 'utf-8')) as Record<string, unknown>;
    const modelsSection = doc?.models;
    const pmSection = doc?.pm as Record<string, unknown> | undefined;
    const ollamaSection = doc?.ollama as Record<string, unknown> | undefined;

    const merged: ModelsConfig = { ...DEFAULT_MODELS_CONFIG };

    if (modelsSection && typeof modelsSection === 'object') {
      for (const role of ALL_ROLES) {
        const spec = parseRoleSpec((modelsSection as Record<string, unknown>)[role]);
        if (spec) merged[role] = spec;
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
      const hasExplicitCoding =
        modelsSection &&
        typeof modelsSection === 'object' &&
        (modelsSection as Record<string, unknown>).coding;
      if (!hasExplicitCoding) {
        merged.coding = {
          provider: 'ollama',
          model: ollamaModel,
          fallback: merged.coding?.fallback ?? { provider: 'openrouter', model: 'qwen/qwen3-coder-next' },
        };
      }
    }

    return merged;
  } catch {
    return { ...DEFAULT_MODELS_CONFIG };
  }
}

function applyEnvOverrides(config: ModelsConfig): ModelsConfig {
  const result: ModelsConfig = { ...config };
  for (const role of ALL_ROLES) {
    const envModel = process.env[`ROLAND_MODEL_${role.toUpperCase()}`]?.trim();
    const envProvider = process.env[`ROLAND_MODEL_${role.toUpperCase()}_PROVIDER`]?.trim();
    const envFallbackModel = process.env[`ROLAND_MODEL_${role.toUpperCase()}_FALLBACK`]?.trim();
    const envFallbackProvider = process.env[`ROLAND_MODEL_${role.toUpperCase()}_FALLBACK_PROVIDER`]?.trim();

    if (!envModel && !envProvider) continue;

    const base = result[role] ?? DEFAULT_MODELS_CONFIG[role];
    if (!base) continue;

    const updated: RoleModelSpec = {
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

let _instance: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!_instance) {
    _instance = ModelRouter.fromConfig();
  }
  return _instance;
}

export function initModelRouter(config?: ModelsConfig): ModelRouter {
  _instance = new ModelRouter(config ?? applyEnvOverrides(loadModelsConfigFromYaml()));
  return _instance;
}

export function resetModelRouter(): void {
  _instance = null;
}

export class ModelRouter {
  private readonly roleConfigs: Map<ModelRole, RoleModelSpec>;
  private readonly degradedRoles = new Set<ModelRole>();
  private lastDegradeReason?: string;

  constructor(config: ModelsConfig = DEFAULT_MODELS_CONFIG) {
    this.roleConfigs = new Map();
    for (const role of ALL_ROLES) {
      const spec = config[role] ?? DEFAULT_MODELS_CONFIG[role];
      if (spec) this.roleConfigs.set(role, spec);
    }
  }

  static fromConfig(configPath?: string): ModelRouter {
    try {
      const yamlConfig = loadModelsConfigFromYaml(configPath);
      return new ModelRouter(applyEnvOverrides(yamlConfig));
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      const configHint = resolveConfigPath() ?? '(config.yaml not found in cwd or package dir)';
      throw new ModelRouterError(
        `Failed to load model routing from ${configHint}. ${hint} ` +
          'Fix config.yaml `models` section or set ROLAND_MODEL_<ROLE> env vars. ' +
          'See config.yaml comments for OpenRouter vs Ollama examples.',
      );
    }
  }

  /** Normalize arbitrary role / agent / phase / lane string to a canonical ModelRole. */
  static normalizeRole(input: string): ModelRole {
    const key = input.toLowerCase().trim().replace(/\s+/g, '-');
    return ROLE_ALIASES[key] ?? ROLE_ALIASES[key.replace(/_/g, '-')] ?? 'coding';
  }

  static roleForPhase(phase: string): ModelRole {
    return PHASE_ROLE_MAP[phase.toLowerCase()] ?? 'coding';
  }

  static roleForAgent(agentName: string): ModelRole {
    return ModelRouter.normalizeRole(agentName);
  }

  /** Primary entry — resolve model + provider for a role (with degradation fallback). */
  getModel(role: ModelRole | string): ResolvedModel {
    const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
    const spec = this.getRoleSpec(canonical);
    const useFallback = Boolean(this.degradedRoles.has(canonical) && spec.fallback);
    const active = useFallback ? spec.fallback! : spec;
    return resolveSpecToModel(canonical, active, useFallback);
  }

  /**
   * Full fallback chain for a role — primary, optional configured fallback, and active selection.
   * Use when displaying routing or wiring provider clients that need explicit fallbacks.
   */
  getModelWithFallback(role: ModelRole | string): ModelWithFallbackChain {
    const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
    const spec = this.getRoleSpec(canonical);
    const primary = resolveSpecToModel(canonical, spec, false);
    const chain: ResolvedModel[] = [primary];
    if (spec.fallback) {
      chain.push(resolveSpecToModel(canonical, spec.fallback, true));
    }
    const active =
      this.degradedRoles.has(canonical) && chain.length > 1 ? chain[1]! : chain[0]!;
    return {
      role: canonical,
      primary,
      fallback: chain[1],
      active,
      chain,
    };
  }

  /** Validate required loop roles — call at ClosedLoop / loop mission startup. */
  static validateOnStartup(router?: ModelRouter): ModelRouterValidation {
    const r = router ?? ModelRouter.fromConfig();
    const missing: ModelRole[] = [];
    const warnings: string[] = [];

    for (const role of REQUIRED_LOOP_ROLES) {
      try {
        const m = r.getModel(role);
        if (!m.model?.trim()) missing.push(role);
      } catch {
        missing.push(role);
      }
    }

    for (const role of ALL_ROLES) {
      const chain = r.getModelWithFallback(role);
      if (!chain.fallback) {
        warnings.push(`Role "${role}" has no fallback — rate limits will not auto-degrade`);
      }
    }

    return { ok: missing.length === 0, missing, warnings };
  }

  private getRoleSpec(canonical: ModelRole): RoleModelSpec {
    const spec = this.roleConfigs.get(canonical) ?? DEFAULT_MODELS_CONFIG[canonical];
    if (!spec?.model?.trim()) {
      throw new ModelRouterError(
        `No model configured for role "${canonical}". Add models.${canonical} to config.yaml or set ROLAND_MODEL_${canonical.toUpperCase()}.`,
        canonical,
      );
    }
    return spec;
  }

  getModelForPhase(phase: string): ResolvedModel {
    return this.getModel(ModelRouter.roleForPhase(phase));
  }

  getModelForAgent(agentName: string): ResolvedModel {
    return this.getModel(ModelRouter.roleForAgent(agentName));
  }

  /**
   * Record a failure for a role; returns the model to use after degradation.
   * Only triggers fallback on rate-limit / unavailable errors.
   */
  recordFailure(role: ModelRole | string, errorMessage: string): ResolvedModel {
    const canonical = typeof role === 'string' ? ModelRouter.normalizeRole(role) : role;
    if (!this.isRateLimitOrUnavailable(errorMessage)) {
      return this.getModel(canonical);
    }

    const chain = this.getModelWithFallback(canonical);
    if (!chain.fallback) {
      console.error(
        `[ModelRouter] role=${canonical} rate-limited but no fallback configured — retrying primary ${chain.primary.displayLabel}`,
      );
      return chain.primary;
    }

    this.degradedRoles.add(canonical);
    this.lastDegradeReason = errorMessage.slice(0, 200);
    const resolved = this.getModel(canonical);

    console.error(
      `[ModelRouter] role=${canonical} degraded — fallback ${resolved.displayLabel}: "${this.lastDegradeReason}"`,
    );
    return resolved;
  }

  isRateLimitOrUnavailable(message: string): boolean {
    if (!message) return false;
    return RATE_LIMIT_PATTERNS.some((re) => re.test(message));
  }

  /** Active routing table for all roles (primary or degraded). */
  getActiveRouting(): Record<ModelRole, ResolvedModel> {
    const out = {} as Record<ModelRole, ResolvedModel>;
    for (const role of ALL_ROLES) {
      out[role] = this.getModel(role);
    }
    return out;
  }

  /** One-line summary for CLI banners. */
  formatRoutingSummary(): string {
    const keys: ModelRole[] = ['pm', 'coding', 'critic', 'verifier', 'researcher'];
    return keys.map((r) => `${r}=${this.getModel(r).displayLabel}`).join(' · ');
  }

  /** Multi-line table for logs and Mission Objectives. */
  formatRoutingBanner(): string[] {
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
  formatStartupBanner(templateId?: string): string[] {
    const width = 58;
    const border = '═'.repeat(width);
    const lines: string[] = [
      `[Loop] ╔${border}╗`,
      `[Loop] ║${' Loop Engineering — Model Router'.padEnd(width)}║`,
    ];
    if (templateId) {
      lines.push(`[Loop] ║${` Template: ${templateId}`.slice(0, width).padEnd(width)}║`);
    }
    lines.push(`[Loop] ╠${border}╣`);
    for (const role of ['pm', 'coding', 'critic', 'verifier', 'researcher'] as ModelRole[]) {
      const chain = this.getModelWithFallback(role);
      const active = chain.active;
      const fb = active.isFallback ? ' ← fallback active' : '';
      const row = ` ${role.padEnd(11)} ${active.displayLabel}${fb}`;
      lines.push(`[Loop] ║${row.slice(0, width).padEnd(width)}║`);
    }
    lines.push(`[Loop] ╚${border}╝`);
    return lines;
  }

  /** JSON-safe snapshot for run-state.json and dashboard. */
  serializeRoutingForState(): {
    summary: string;
    roles: Record<string, { provider: string; model: string; displayLabel: string; isFallback: boolean }>;
    phaseModels: Record<string, string>;
  } {
    const routing = this.getActiveRouting();
    return {
      summary: this.formatRoutingSummary(),
      roles: Object.fromEntries(
        Object.entries(routing).map(([role, m]) => [
          role,
          {
            provider: m.provider,
            model: m.model,
            displayLabel: m.displayLabel,
            isFallback: m.isFallback,
          },
        ]),
      ),
      phaseModels: Object.fromEntries(
        ['plan', 'act', 'verify', 'critique', 'retry', 'observe', 'reflect'].map((phase) => [
          phase,
          this.getModelForPhase(phase).displayLabel,
        ]),
      ),
    };
  }

  /**
   * Resolve a Cursor SDK model id for legacy PM Team agent dispatch.
   * Uses role routing from config; falls back to keyword mapping for non-cursor providers.
   */
  resolveSdkModelId(agentName: string, yamlModel?: string): string {
    const yaml = yamlModel?.toLowerCase().trim() ?? '';
    if (yaml && yaml !== 'auto' && isValidCursorModel(yaml)) return yaml;

    const role = ModelRouter.roleForAgent(agentName);
    const resolved = this.getModel(role);

    if (resolved.provider === 'cursor' && isValidCursorModel(resolved.model)) {
      return resolved.model;
    }

    return mapProviderModelToCursorSdk(resolved.model, role);
  }

  logRoutingBanner(): void {
    for (const line of this.formatStartupBanner()) {
      console.error(line);
    }
  }

  logStartupBanner(templateId?: string): void {
    for (const line of this.formatStartupBanner(templateId)) {
      console.error(line);
    }
  }

  getDegradedRoles(): ReadonlySet<ModelRole> {
    return new Set(this.degradedRoles);
  }

  resetDegradation(): void {
    this.degradedRoles.clear();
    this.lastDegradeReason = undefined;
  }
}

/** Map OpenRouter/Ollama model strings to Cursor SDK ids for legacy PM Team dispatch. */
function mapProviderModelToCursorSdk(model: string, role: ModelRole): string {
  const m = model.toLowerCase();
  if (role === 'pm') {
    if (m.includes('grok')) return 'grok-4.3';
    if (m.includes('nano')) return DEFAULT_PM_MODEL;
    return DEFAULT_PM_MODEL;
  }
  if (m.includes('opus')) return 'claude-opus-4-7';
  if (m.includes('sonnet')) return 'claude-sonnet-4-6';
  if (m.includes('haiku')) return 'claude-haiku-4-5';
  if (m.includes('gemini') && m.includes('pro')) return 'gemini-2.5-pro';
  if (m.includes('gemini')) return 'gemini-2.5-flash';
  if (m.includes('composer')) return DEFAULT_ENGINEER_MODEL;
  return DEFAULT_ENGINEER_MODEL;
}

/**
 * ## Final Legacy Cleanup + Model Router Integration Complete
 *
 * Loop Engineering routes all roles via `getModel()` / `getModelWithFallback()`.
 * Legacy PM Team (`team-orchestrator.ts`) bridges through `resolveSdkModelId()` for Cursor SDK dispatch.
 *
 * **OpenRouter (default)** — `config.yaml`:
 * ```yaml
 * models:
 *   pm:     { provider: openrouter, model: grok-4.3, fallback: { provider: openrouter, model: gpt-5.4-nano } }
 *   coding: { provider: openrouter, model: qwen/qwen3-coder-next }
 *   critic: { provider: openrouter, model: deepseek/deepseek-chat }
 *   verifier: { provider: openrouter, model: deepseek/deepseek-v3-0324 }
 * ```
 *
 * **Full Ollama (local)** — change provider per role only:
 * ```yaml
 * models:
 *   pm:     { provider: ollama, model: llama3.2:latest }
 *   coding: { provider: ollama, model: qwen3.5-coder:14b }
 *   critic: { provider: ollama, model: deepseek-r1:7b }
 *   verifier: { provider: ollama, model: qwen3.5-coder:14b }
 * ollama:
 *   enabled: true
 *   base_url: http://localhost:11434
 * ```
 *
 * Env overrides: `ROLAND_MODEL_CODING=qwen3.5-coder:14b` + `ROLAND_MODEL_CODING_PROVIDER=ollama`
 */
export {};
