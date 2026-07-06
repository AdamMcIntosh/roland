/**
 * ## Assumptions
 * - Loop templates are generic-first YAML under recipes/loops/ (or templates_dir override).
 * - Deprecated names resolve via alias_of or TEMPLATE_ALIASES for backward compatibility.
 * - Project-specific commands belong in config.yaml, not template YAML.
 * - Malformed templates surface as load errors; lint runs in loop:ready-check.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { z } from 'zod';
import type {
  LoopTemplate,
  SpawnConditions,
  SpecialistSpawnDefinition,
  BetweenIterationsHookConfig,
  PhaseVerificationEntry,
  VerificationStrategyDefinition,
} from './loop-phases.js';
import { Phase, isPhase } from './loop-phases.js';
import { loadLoopEngineConfig } from './loop-config.js';
import {
  summarizeVerificationConfig,
  summarizeBetweenIterationsConfig,
  listPhaseAfterHooks,
} from './loop-template-resolution.js';

/** Canonical generic templates — readiness gate expects these to exist (7 templates). */
export const CORE_GENERIC_TEMPLATES = [
  'small-fix-loop',
  'standard-code-loop',
  'feature-implementation-loop',
  'refactor-and-modernize-loop',
  'research-and-plan-loop',
  'full-cycle-verified-loop',
  'maintenance-loop',
] as const;

/** Backward-compatible aliases when alias_of is not in YAML. */
export const TEMPLATE_ALIASES: Record<string, string> = {
  'closed-loop-harness': 'full-cycle-verified-loop',
  'code-quality-loop': 'refactor-and-modernize-loop',
  'research-synthesis-loop': 'research-and-plan-loop',
  'research-and-spec-loop': 'research-and-plan-loop',
  'mcp-extension-loop': 'feature-implementation-loop',
  'minimal-3-phase': 'small-fix-loop',
  'research-loop': 'research-and-plan-loop',
};

const LEGACY_AGENT_NAMES = new Set([
  'lead-pm',
  'lead_pm',
  'executor',
  'test-executor',
  'test_author',
  'sparrow',
  'sentinel',
  'oracle',
]);

const PROJECT_SPECIFIC_PATTERNS = [
  /\blumina\b/i,
  /\bechoes\b/i,
  /\bperchwatch\b/i,
  /\bicaria\b/i,
  /\babw\b/i,
  /\bgodot\b/i,
];

const HARDCODED_CMD_PATTERN = /\b(npm|pnpm|yarn|dotnet|cargo|pytest|make)\b/i;

const SpawnConditionsSchema = z.object({
  iteration_min: z.number().int().positive().optional(),
  iteration_max: z.number().int().positive().optional(),
  retry_min: z.number().int().nonnegative().optional(),
  first_iteration_only: z.boolean().optional(),
  after_first_iteration: z.boolean().optional(),
});

const SpecialistSpawnSchema = z.object({
  role: z.string().min(1),
  count: z.number().int().positive().optional(),
  primary: z.boolean().optional(),
  prompt_template: z.string().optional(),
  conditions: SpawnConditionsSchema.optional(),
  optional: z.boolean().optional(),
});

const VerificationTypeEnum = z.enum(['unit', 'integration', 'smoke', 'e2e', 'lint', 'typecheck']);

const VerificationStrategyDefSchema = z.object({
  type: VerificationTypeEnum,
  command: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
  optional: z.boolean().optional(),
  weight: z.number().min(0).max(2).optional(),
  success_threshold: z.number().min(0).max(1).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  dry_run: z.boolean().optional(),
});

const VerificationStepSchema = z.union([VerificationTypeEnum, VerificationStrategyDefSchema]);

const BetweenIterationsHookSchema = z.object({
  action: z.enum(['run-tests', 'git-commit', 'critique-only']).optional(),
  command: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
  optional: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  exit_on_failure: z.boolean().optional(),
  message_template: z.string().optional(),
  include_files: z.array(z.string()).optional(),
  auto_stage: z.boolean().optional(),
  require_approval: z.boolean().optional(),
  approval_timeout_ms: z.number().int().positive().optional(),
  auto_reject_on_timeout: z.boolean().optional(),
});

const PhaseConfigSchema = z.object({
  phase: z.string().refine(isPhase, { message: 'Invalid loop phase' }),
  label: z.string().optional(),
  agent: z.string().optional(),
  optional: z.boolean().optional(),
  verification: z.array(VerificationStepSchema).optional(),
  after: BetweenIterationsHookSchema.optional(),
  between_iterations: BetweenIterationsHookSchema.optional(),
  pm_team: z.enum(['auto', 'always', 'never']).optional(),
  specialist_spawns: z.array(SpecialistSpawnSchema).optional(),
});

const ExitConditionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['all_gates_pass', 'confidence_streak', 'command_success']),
  description: z.string().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  consecutiveIterations: z.number().int().positive().optional(),
  command: z.string().optional(),
});

export const LoopTemplateSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  deprecated: z.boolean().optional(),
  alias_of: z.string().optional(),
  phases: z.array(PhaseConfigSchema).min(1),
  maxIterations: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  escalationThreshold: z.number().int().positive().optional(),
  testModeMaxRetries: z.number().int().nonnegative().optional(),
  testModeEscalationThreshold: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().optional(),
  exponential_backoff: z.boolean().optional(),
  kickoff: z.string().optional(),
  between_iterations: z.union([z.string(), BetweenIterationsHookSchema]).optional(),
  reflection: z.boolean().optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  exit_conditions: z.array(ExitConditionSchema).optional(),
  pm_plan: z.enum(['auto', 'always', 'never']).optional(), // [DEPRECATED] legacy PM Team
  pm_act: z.enum(['auto', 'always', 'never']).optional(),   // [DEPRECATED] legacy PM Team
  use_pm_team: z.boolean().optional(),                      // [DEPRECATED] advanced/legacy opt-in
});

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

function mapSpawnConditions(raw?: z.infer<typeof SpawnConditionsSchema>): SpawnConditions | undefined {
  if (!raw) return undefined;
  return {
    iterationMin: raw.iteration_min,
    iterationMax: raw.iteration_max,
    retryMin: raw.retry_min,
    firstIterationOnly: raw.first_iteration_only,
    afterFirstIteration: raw.after_first_iteration,
  };
}

function mapSpecialistSpawns(
  raw?: z.infer<typeof SpecialistSpawnSchema>[],
): SpecialistSpawnDefinition[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map((s) => ({
    role: s.role,
    count: s.count,
    primary: s.primary,
    promptTemplate: s.prompt_template,
    conditions: mapSpawnConditions(s.conditions),
    optional: s.optional,
  }));
}

function mapBetweenHook(
  raw?: z.infer<typeof BetweenIterationsHookSchema>,
): BetweenIterationsHookConfig | undefined {
  if (!raw) return undefined;
  return {
    action: raw.action,
    command: raw.command,
    timeoutMs: raw.timeout_ms,
    optional: raw.optional,
    dryRun: raw.dry_run,
    exitOnFailure: raw.exit_on_failure,
    messageTemplate: raw.message_template,
    includeFiles: raw.include_files,
    autoStage: raw.auto_stage,
    requireApproval: raw.require_approval,
    approvalTimeoutMs: raw.approval_timeout_ms,
    autoRejectOnTimeout: raw.auto_reject_on_timeout,
  };
}

function mapVerification(raw?: z.infer<typeof VerificationStepSchema>[]): PhaseVerificationEntry[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map((entry) => {
    if (typeof entry === 'string') return entry;
    return {
      type: entry.type,
      command: entry.command,
      timeoutMs: entry.timeout_ms,
      optional: entry.optional,
      weight: entry.weight,
      successThreshold: entry.success_threshold,
      minConfidence: entry.min_confidence,
      dryRun: entry.dry_run,
    } satisfies VerificationStrategyDefinition;
  });
}

function rawToTemplate(parsed: z.infer<typeof LoopTemplateSchema>): LoopTemplate {
  return {
    name: parsed.name,
    description: parsed.description,
    deprecated: parsed.deprecated,
    aliasOf: parsed.alias_of,
    phases: parsed.phases.map((p) => ({
      phase: p.phase as typeof Phase[keyof typeof Phase],
      label: p.label,
      agent: p.agent,
      optional: p.optional,
      verification: mapVerification(p.verification),
      after: mapBetweenHook(p.after),
      betweenIterations: mapBetweenHook(p.between_iterations),
      pmTeam: p.pm_team,
      specialistSpawns: mapSpecialistSpawns(p.specialist_spawns),
    })),
    maxIterations: parsed.maxIterations,
    maxRetries: parsed.maxRetries,
    escalationThreshold: parsed.escalationThreshold,
    testModeMaxRetries: parsed.testModeMaxRetries,
    testModeEscalationThreshold: parsed.testModeEscalationThreshold,
    timeoutMs: parsed.timeout_ms,
    exponentialBackoff: parsed.exponential_backoff,
    kickoff: parsed.kickoff,
    betweenIterations: parsed.between_iterations,
    reflection: parsed.reflection,
    minConfidence: parsed.min_confidence,
    exitConditions: parsed.exit_conditions?.map((c) => ({
      id: c.id,
      type: c.type,
      description: c.description,
      minConfidence: c.minConfidence,
      consecutiveIterations: c.consecutiveIterations,
      command: c.command,
    })),
    pmPlan: parsed.pm_plan,
    pmAct: parsed.pm_act,
    usePmTeam: parsed.use_pm_team,
  };
}

/** Lint a single template for generic-first best practices. */
export function lintLoopTemplate(template: LoopTemplate): TemplateLintIssue[] {
  const issues: TemplateLintIssue[] = [];
  const blob = JSON.stringify(template).toLowerCase();

  for (const pattern of PROJECT_SPECIFIC_PATTERNS) {
    if (pattern.test(blob)) {
      issues.push({
        template: template.name,
        severity: 'error',
        code: 'project_specific',
        message: `Template references project-specific content (${pattern.source}) — use config overrides instead`,
      });
    }
  }

  if (template.betweenIterations) {
    const betweenBlob =
      typeof template.betweenIterations === 'string'
        ? template.betweenIterations
        : JSON.stringify(template.betweenIterations);
    if (HARDCODED_CMD_PATTERN.test(betweenBlob)) {
      issues.push({
        template: template.name,
        severity: 'warn',
        code: 'hardcoded_between_iterations',
        message: 'between_iterations uses hardcoded shell command — prefer loop_engine.between_iterations or action: run-tests in config.yaml',
      });
    }
    if (
      typeof template.betweenIterations === 'object' &&
      !template.betweenIterations.command &&
      !template.betweenIterations.action
    ) {
      issues.push({
        template: template.name,
        severity: 'error',
        code: 'between_iterations_empty',
        message: 'between_iterations hook object requires command or action',
      });
    }
    if (
      typeof template.betweenIterations === 'object' &&
      template.betweenIterations.requireApproval &&
      template.betweenIterations.dryRun !== false
    ) {
      issues.push({
        template: template.name,
        severity: 'warn',
        code: 'hitl_approval_with_dry_run',
        message: 'require_approval has no effect while dry_run is true — set dry_run: false for real commits',
      });
    }
    if (
      typeof template.betweenIterations === 'object' &&
      template.betweenIterations.action === 'git-commit' &&
      template.betweenIterations.requireApproval &&
      template.betweenIterations.dryRun === false &&
      !template.betweenIterations.autoStage &&
      !(template.betweenIterations.includeFiles?.length)
    ) {
      issues.push({
        template: template.name,
        severity: 'error',
        code: 'hitl_commit_no_stage',
        message: 'git-commit with require_approval and dry_run: false needs auto_stage: true or include_files',
      });
    }
  }

  for (const ec of template.exitConditions ?? []) {
    if (ec.command && HARDCODED_CMD_PATTERN.test(ec.command)) {
      issues.push({
        template: template.name,
        severity: 'warn',
        code: 'hardcoded_exit_command',
        message: 'exit condition command uses hardcoded shell — prefer config-driven verification',
      });
    }
  }

  for (const phase of template.phases) {
    if (phase.agent && LEGACY_AGENT_NAMES.has(phase.agent.toLowerCase())) {
      issues.push({
        template: template.name,
        severity: 'warn',
        code: 'legacy_agent_name',
        message: `Phase "${phase.phase}" uses legacy agent "${phase.agent}" — prefer generic roles (pm, coding, verifier, critic, researcher)`,
      });
    }

    for (const v of phase.verification ?? []) {
      if (typeof v === 'object' && v.command && HARDCODED_CMD_PATTERN.test(v.command)) {
        issues.push({
          template: template.name,
          severity: 'warn',
          code: 'hardcoded_verification_command',
          message: `Phase "${phase.phase}" verification command is hardcoded — prefer config loop_engine.verification.strategies`,
        });
      }
    }

    for (const hook of [phase.after, phase.betweenIterations]) {
      if (!hook) continue;
      if (!hook.command && !hook.action && !hook.dryRun) {
        issues.push({
          template: template.name,
          severity: 'error',
          code: 'phase_hook_empty',
          message: `Phase "${phase.phase}" after/between_iterations hook requires command, action, or dry_run`,
        });
      }
      if (hook.command && hook.action) {
        issues.push({
          template: template.name,
          severity: 'warn',
          code: 'phase_hook_redundant',
          message: `Phase "${phase.phase}" hook sets both command and action — action expands unless command overrides`,
        });
      }
    }

    if (phase.specialistSpawns?.length) {
      let primaryCount = 0;
      for (const spawn of phase.specialistSpawns) {
        if (!spawn.role.trim()) {
          issues.push({
            template: template.name,
            severity: 'error',
            code: 'spawn_empty_role',
            message: `Phase "${phase.phase}" has specialist_spawns entry with empty role`,
          });
        }
        if (spawn.primary) primaryCount++;
        if ((spawn.count ?? 1) > 8) {
          issues.push({
            template: template.name,
            severity: 'warn',
            code: 'spawn_high_count',
            message: `Phase "${phase.phase}" spawn for "${spawn.role}" has count ${spawn.count} — consider lowering`,
          });
        }
        const c = spawn.conditions;
        if (c?.iterationMin && c?.iterationMax && c.iterationMin > c.iterationMax) {
          issues.push({
            template: template.name,
            severity: 'error',
            code: 'spawn_invalid_conditions',
            message: `Phase "${phase.phase}" spawn "${spawn.role}" has iteration_min > iteration_max`,
          });
        }
        if (c?.firstIterationOnly && c?.afterFirstIteration) {
          issues.push({
            template: template.name,
            severity: 'error',
            code: 'spawn_conflicting_conditions',
            message: `Phase "${phase.phase}" spawn "${spawn.role}" cannot set both first_iteration_only and after_first_iteration`,
          });
        }
      }
      if (primaryCount > 1) {
        issues.push({
          template: template.name,
          severity: 'warn',
          code: 'spawn_multiple_primary',
          message: `Phase "${phase.phase}" has ${primaryCount} primary specialist_spawns — only one should be primary`,
        });
      }
    }
  }

  if (template.deprecated && !template.aliasOf && !TEMPLATE_ALIASES[template.name]) {
    issues.push({
      template: template.name,
      severity: 'warn',
      code: 'deprecated_no_alias',
      message: 'Deprecated template has no alias_of — in-flight runs may break when removed',
    });
  }

  return issues;
}

/** Lint all loaded templates. */
export function lintAllLoopTemplates(templates: LoopTemplates): TemplateLintIssue[] {
  const issues: TemplateLintIssue[] = [];
  for (const t of templates.listAll()) {
    issues.push(...lintLoopTemplate(t));
  }
  for (const name of CORE_GENERIC_TEMPLATES) {
    if (!templates.get(name)) {
      issues.push({
        template: name,
        severity: 'error',
        code: 'missing_core_template',
        message: `Core generic template "${name}" is missing from recipes/loops/`,
      });
    }
  }
  return issues;
}

export interface LoopTemplateListEntry {
  name: string;
  description: string;
  phaseCount: number;
  deprecated?: boolean;
  aliasOf?: string;
  isCoreGeneric: boolean;
  phases: Array<{ phase: string; label?: string; agent?: string }>;
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
export function summarizeTemplateSpawns(template: LoopTemplate): string | null {
  const parts: string[] = [];
  for (const phase of template.phases) {
    if (!phase.specialistSpawns?.length) continue;
    const roles = phase.specialistSpawns.map((s) => {
      const count = s.count && s.count > 1 ? `×${s.count}` : '';
      return `${s.role}${count}`;
    });
    parts.push(`${phase.phase}: ${roles.join('+')}`);
  }
  return parts.length ? parts.join('; ') : null;
}

function toListEntry(template: LoopTemplate): LoopTemplateListEntry {
  return {
    name: template.name,
    description: template.description,
    phaseCount: template.phases.length,
    deprecated: template.deprecated,
    aliasOf: template.aliasOf,
    isCoreGeneric: (CORE_GENERIC_TEMPLATES as readonly string[]).includes(template.name),
    phases: template.phases.map((p) => ({
      phase: p.phase,
      label: p.label,
      agent: p.agent,
    })),
    executionModes: {
      usePmTeam: template.usePmTeam ?? false,
      pmPlan: template.pmPlan,
      pmAct: template.pmAct,
    },
    hasCustomSpawns: template.phases.some((p) => (p.specialistSpawns?.length ?? 0) > 0),
    spawnSummary: summarizeTemplateSpawns(template),
    verificationSummary: summarizeVerificationConfig(template),
    betweenIterationsSummary: summarizeBetweenIterationsConfig(template),
    phaseAfterHooks: listPhaseAfterHooks(template),
  };
}

export class LoopTemplates {
  private cache: Map<string, LoopTemplate> | null = null;
  private loadErrors: TemplateLoadError[] = [];

  constructor(private readonly dir: string = LoopTemplates.resolveLoopsDir()) {}

  list(): Array<{ name: string; description: string; phaseCount: number; deprecated?: boolean }> {
    return Array.from(this.load().values()).map((t) => ({
      name: t.name,
      description: t.description,
      phaseCount: t.phases.length,
      deprecated: t.deprecated,
    }));
  }

  /** Rich catalog for dashboard /api/loop-templates — metadata, phases, execution modes, spawns. */
  listDetailed(): LoopTemplateListEntry[] {
    return Array.from(this.load().values())
      .map(toListEntry)
      .sort((a, b) => {
        if (a.isCoreGeneric !== b.isCoreGeneric) return a.isCoreGeneric ? -1 : 1;
        if (Boolean(a.deprecated) !== Boolean(b.deprecated)) return a.deprecated ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }

  /** All templates including deprecated (for lint). */
  listAll(): LoopTemplate[] {
    return Array.from(this.load().values());
  }

  getLoadErrors(): TemplateLoadError[] {
    this.load();
    return [...this.loadErrors];
  }

  get(name: string): LoopTemplate | undefined {
    const map = this.load();
    const direct = map.get(name);
    if (direct) return direct;

    const aliasTarget = TEMPLATE_ALIASES[name];
    if (aliasTarget) return map.get(aliasTarget);

    return undefined;
  }

  /** Resolve template name through alias_of chains (max depth 4). */
  resolveName(name: string): string {
    const map = this.load();
    let current = name;
    for (let depth = 0; depth < 4; depth++) {
      const tpl = map.get(current);
      const next = tpl?.aliasOf ?? TEMPLATE_ALIASES[current];
      if (!next || next === current) return current;
      current = next;
    }
    return current;
  }

  getDefault(): LoopTemplate | undefined {
    const cfg = loadLoopEngineConfig();
    const name = cfg.default_template ?? 'standard-code-loop';
    return this.get(name);
  }

  private load(): Map<string, LoopTemplate> {
    if (this.cache) return this.cache;
    const map = new Map<string, LoopTemplate>();
    this.loadErrors = [];
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    } catch {
      // No loops dir — empty set.
    }
    for (const file of files) {
      const filePath = path.join(this.dir, file);
      try {
        const raw = YAML.parse(fs.readFileSync(filePath, 'utf-8'));
        const parsed = LoopTemplateSchema.parse(raw);
        const template = rawToTemplate(parsed);
        map.set(template.name, template);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.loadErrors.push({ file, message: msg });
        console.error(`[LoopTemplates] Skipped malformed template ${file}: ${msg}`);
      }
    }
    this.cache = map;
    return map;
  }

  static resolveLoopsDir(): string {
    const cfg = loadLoopEngineConfig();
    const configured = cfg.templates_dir;
    if (configured && path.isAbsolute(configured) && fs.existsSync(configured)) {
      return configured;
    }
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const installDir = path.resolve(path.dirname(thisFile), '..');
      const rootDir = path.resolve(installDir, '..');
      const distLoops = path.join(installDir, 'recipes', 'loops');
      if (fs.existsSync(distLoops)) return distLoops;
      const srcLoops = path.join(rootDir, 'recipes', 'loops');
      if (fs.existsSync(srcLoops)) return srcLoops;
    } catch {
      // fall through
    }
    return path.join(process.cwd(), configured ?? 'recipes/loops');
  }
}

/** Catalog payload for GET /api/loop-templates. */
export function buildLoopTemplateCatalog(): {
  templates: LoopTemplateListEntry[];
  defaultTemplate: string;
  coreGeneric: readonly string[];
  loadErrors: TemplateLoadError[];
} {
  const loader = new LoopTemplates();
  const cfg = loadLoopEngineConfig();
  return {
    templates: loader.listDetailed(),
    defaultTemplate: cfg.default_template ?? 'standard-code-loop',
    coreGeneric: CORE_GENERIC_TEMPLATES,
    loadErrors: loader.getLoadErrors(),
  };
}

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
