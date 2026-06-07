/**
 * Loop engine configuration — loaded from config.yaml `loop_engine` section.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { z } from 'zod';
import { isVerificationStrategyType } from './verification/verification-strategies.js';

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
    })
    .optional(),
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
  };
};

const DEFAULT_CONFIG: LoopEngineConfig = {
  default_template: 'standard-code-loop',
  templates_dir: 'recipes/loops',
  verification: {
    require_pass_before_critique: false,
  },
  critique: {
    maxRetries: 3,
  },
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
    maxRetries: raw.max_retries ?? DEFAULT_CONFIG.critique?.maxRetries ?? 3,
  };
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
