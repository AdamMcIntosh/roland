/**
 * Loop engine configuration — loaded from config.yaml `loop_engine` section.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { z } from 'zod';

export const LoopEngineConfigSchema = z.object({
  default_template: z.string().optional(),
  templates_dir: z.string().optional(),
});

export type LoopEngineConfig = z.infer<typeof LoopEngineConfigSchema>;

const DEFAULT_CONFIG: LoopEngineConfig = {
  default_template: 'standard-code-loop',
  templates_dir: 'recipes/loops',
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
    cached = parsed.success ? { ...DEFAULT_CONFIG, ...parsed.data } : DEFAULT_CONFIG;
    return cached;
  } catch {
    cached = DEFAULT_CONFIG;
    return cached;
  }
}

export function clearLoopEngineConfigCache(): void {
  cached = null;
}
