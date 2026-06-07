/**
 * Loop engine configuration — loaded from config.yaml `loop_engine` section.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { z } from 'zod';
import { isVerificationStrategyType } from './verification/verification-strategies.js';
import {
  DEFAULT_ESCALATION_THRESHOLD,
  DEFAULT_MAX_RETRIES,
} from './self-improvement/escalation.js';
import type { LoopTemplate } from './loop-phases.js';

const VerificationStrategySchema = z.object({
  type: z.string().refine(isVerificationStrategyType, { message: 'Invalid verification strategy type' }),
  command: z.string().min(1),
  timeout_ms: z.number().int().positive().optional(),
  optional: z.boolean().optional(),
});

export const LoopEngineConfigSchema = z.object({
  default_template: z.string().optional(),
  templates_dir: z.string().optional(),
  verification: z
    .object({
      require_pass_before_critique: z.boolean().optional(),
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
});

export type LoopEngineConfig = z.infer<typeof LoopEngineConfigSchema> & {
  verification?: {
    require_pass_before_critique?: boolean;
    strategies?: Array<{
      type: string;
      command: string;
      timeoutMs?: number;
      optional?: boolean;
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

function normaliseVerification(
  raw: z.infer<typeof LoopEngineConfigSchema>['verification'],
): LoopEngineConfig['verification'] {
  if (!raw) return DEFAULT_CONFIG.verification;
  return {
    require_pass_before_critique: raw.require_pass_before_critique ?? false,
    strategies: raw.strategies?.map((s) => ({
      type: s.type,
      command: s.command,
      timeoutMs: s.timeout_ms,
      optional: s.optional,
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
    };
    return cached;
  } catch {
    cached = DEFAULT_CONFIG;
    return cached;
  }
}

export function clearLoopEngineConfigCache(): void {
  cached = null;
}
