/**
 * ## Assumptions
 * - Loaded from config.yaml `loop_engine` section only.
 * - `default_dispatch: cursor_sdk` is the Loop Engineering default unless overridden.
 * - Env `ROLAND_DEFAULT_DISPATCH=direct` overrides YAML.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { z } from 'zod';
import { isVerificationStrategyType, DEFAULT_VERIFICATION_STRATEGIES } from './verification/verification-strategies.js';
import {
  DEFAULT_ESCALATION_THRESHOLD,
  DEFAULT_MAX_RETRIES,
} from './self-improvement/escalation.js';
import type { LoopTemplate } from './loop-phases.js';
import { resolveBetweenIterationsCommand } from './loop-template-resolution.js';

const VerificationStrategySchema = z.object({
  type: z.string().refine(isVerificationStrategyType, { message: 'Invalid verification strategy type' }),
  command: z.string().min(1).optional(),
  timeout_ms: z.number().int().positive().optional(),
  optional: z.boolean().optional(),
  weight: z.number().min(0).max(2).optional(),
  success_threshold: z.number().min(0).max(1).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  dry_run: z.boolean().optional(),
});

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

export const LoopEngineConfigSchema = z.object({
  default_template: z.string().optional(),
  templates_dir: z.string().optional(),
  /** Default between-iteration shell command when template omits between_iterations. */
  between_iterations: z.union([z.string(), BetweenIterationsHookSchema]).optional(),
  verification: z
    .object({
      require_pass_before_critique: z.boolean().optional(),
      min_confidence: z.number().min(0).max(1).optional(),
      strategies: z.array(VerificationStrategySchema).optional(),
    })
    .optional(),
  critique: z
    .object({
      max_retries: z.number().int().nonnegative().optional(),
      escalation_threshold: z.number().int().positive().optional(),
      test_mode: z
        .object({
          max_retries: z.number().int().nonnegative().optional(),
          escalation_threshold: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .optional(),
  retry: z
    .object({
      exponential_backoff: z
        .object({
          enabled: z.boolean().optional(),
          base_ms: z.number().int().nonnegative().optional(),
          max_ms: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .optional(),
  timeout_ms: z.number().int().positive().optional(),
  use_pm_team: z.boolean().optional(),
  default_dispatch: z.enum(['cursor_sdk', 'direct']).optional(),
});

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
  /** When true, templates with pm_plan/pm_act: auto may invoke legacy PM Team (default false). */
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

const DEFAULT_CONFIG: LoopEngineConfig = {
  default_template: 'standard-code-loop',
  templates_dir: 'recipes/loops',
  verification: {
    require_pass_before_critique: false,
  },
  critique: {
    maxRetries: DEFAULT_MAX_RETRIES,
    escalationThreshold: DEFAULT_ESCALATION_THRESHOLD,
  },
  retry: {
    exponentialBackoff: {
      enabled: false,
      baseMs: 2000,
      maxMs: 60_000,
    },
  },
  timeoutMs: 1_800_000,
  usePmTeam: false,
  defaultDispatch: 'cursor_sdk',
};

let cached: LoopEngineConfig | null = null;

function resolveConfigPath(): string | null {
  const candidates: string[] = [];
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const installDir = path.resolve(path.dirname(thisFile), '..');
    const rootDir = path.resolve(installDir, '..');
    candidates.push(path.join(installDir, 'config.yaml'));
    candidates.push(path.join(rootDir, 'config.yaml'));
  } catch {
    // fall through
  }
  candidates.push(path.join(process.cwd(), 'config.yaml'));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function commandForStrategyType(type: string): string {
  const hit = DEFAULT_VERIFICATION_STRATEGIES.find((s) => s.type === type);
  return hit?.command ?? 'npm test';
}

function normaliseVerification(
  raw: z.infer<typeof LoopEngineConfigSchema>['verification'],
): LoopEngineConfig['verification'] {
  if (!raw) return DEFAULT_CONFIG.verification;
  return {
    require_pass_before_critique: raw.require_pass_before_critique ?? false,
    minConfidence: raw.min_confidence,
    strategies: raw.strategies?.map((s) => ({
      type: s.type,
      command: s.command ?? commandForStrategyType(s.type),
      timeoutMs: s.timeout_ms,
      optional: s.optional,
      weight: s.weight,
      successThreshold: s.success_threshold,
      minConfidence: s.min_confidence,
      dryRun: s.dry_run,
    })),
  };
}

function normaliseCritique(
  raw: z.infer<typeof LoopEngineConfigSchema>['critique'],
): LoopEngineConfig['critique'] {
  if (!raw) return DEFAULT_CONFIG.critique;
  return {
    maxRetries: raw.max_retries ?? DEFAULT_CONFIG.critique?.maxRetries ?? DEFAULT_MAX_RETRIES,
    escalationThreshold:
      raw.escalation_threshold ??
      DEFAULT_CONFIG.critique?.escalationThreshold ??
      DEFAULT_ESCALATION_THRESHOLD,
    testMode: raw.test_mode
      ? {
          maxRetries: raw.test_mode.max_retries,
          escalationThreshold: raw.test_mode.escalation_threshold,
        }
      : undefined,
  };
}

function normaliseRetry(
  raw: z.infer<typeof LoopEngineConfigSchema>['retry'],
): LoopEngineConfig['retry'] {
  if (!raw?.exponential_backoff) return DEFAULT_CONFIG.retry;
  return {
    exponentialBackoff: {
      enabled: raw.exponential_backoff.enabled ?? false,
      baseMs: raw.exponential_backoff.base_ms ?? DEFAULT_CONFIG.retry?.exponentialBackoff?.baseMs ?? 2000,
      maxMs: raw.exponential_backoff.max_ms ?? DEFAULT_CONFIG.retry?.exponentialBackoff?.maxMs ?? 60_000,
    },
  };
}

/** Resolve retry + escalation thresholds from template, base config, and optional test mode. */
export function resolveCritiqueThresholds(
  template: LoopTemplate,
  opts: { isTestMode?: boolean } = {},
): CritiqueThresholds {
  const cfg = loadLoopEngineConfig();
  const envTestMode = process.env.ROLAND_LOOP_TEST_MODE === '1';
  const testMode = Boolean(opts.isTestMode || envTestMode);

  const baseMaxRetries = template.maxRetries ?? cfg.critique?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseEscalation =
    template.escalationThreshold ??
    cfg.critique?.escalationThreshold ??
    DEFAULT_ESCALATION_THRESHOLD;

  if (testMode) {
    return {
      maxRetries:
        template.testModeMaxRetries ??
        cfg.critique?.testMode?.maxRetries ??
        baseMaxRetries + 2,
      escalationThreshold:
        template.testModeEscalationThreshold ??
        cfg.critique?.testMode?.escalationThreshold ??
        baseEscalation + 2,
    };
  }

  return { maxRetries: baseMaxRetries, escalationThreshold: baseEscalation };
}

export function loadLoopEngineConfig(): LoopEngineConfig {
  if (cached) return cached;
  const configPath = resolveConfigPath();
  if (!configPath) {
    cached = DEFAULT_CONFIG;
    return cached;
  }
  try {
    const doc = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const section = doc?.loop_engine;
    if (!section || typeof section !== 'object') {
      cached = DEFAULT_CONFIG;
      return cached;
    }
    const parsed = LoopEngineConfigSchema.safeParse(section);
    if (!parsed.success) {
      cached = DEFAULT_CONFIG;
      return cached;
    }
    cached = {
      ...DEFAULT_CONFIG,
      ...parsed.data,
      verification: normaliseVerification(parsed.data.verification),
      critique: normaliseCritique(parsed.data.critique),
      retry: normaliseRetry(parsed.data.retry),
      timeoutMs: parsed.data.timeout_ms ?? DEFAULT_CONFIG.timeoutMs,
      usePmTeam: parsed.data.use_pm_team ?? false,
      defaultDispatch: parsed.data.default_dispatch ?? DEFAULT_CONFIG.defaultDispatch,
      betweenIterations: parsed.data.between_iterations,
    };
    return cached;
  } catch {
    cached = DEFAULT_CONFIG;
    return cached;
  }
}

/** Resolve default dispatch policy — env overrides YAML. */
export function loadDefaultDispatchPolicy(): 'cursor_sdk' | 'direct' {
  const env = process.env.ROLAND_DEFAULT_DISPATCH?.trim().toLowerCase();
  if (env === 'direct' || env === 'cursor_sdk') return env;
  return loadLoopEngineConfig().defaultDispatch ?? 'cursor_sdk';
}

export function clearLoopEngineConfigCache(): void {
  cached = null;
}

/** Resolve between-iteration command: template override → config → undefined. */
export function resolveBetweenIterations(template: LoopTemplate): string | undefined {
  return resolveBetweenIterationsCommand(template);
}

export { resolveBetweenIterationsCommand } from './loop-template-resolution.js';
export type { ResolvedBetweenIterationsHook } from './loop-template-resolution.js';
