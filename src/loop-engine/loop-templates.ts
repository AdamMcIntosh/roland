/**
 * Loop template loader — YAML files under recipes/loops/.
 *
 * Mirrors the TeamRecipes pattern in src/pm/team-recipes.ts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { z } from 'zod';
import type { LoopTemplate } from './loop-phases.js';
import { Phase, isPhase } from './loop-phases.js';
import { loadLoopEngineConfig } from './loop-config.js';

const PhaseConfigSchema = z.object({
  phase: z.string().refine(isPhase, { message: 'Invalid loop phase' }),
  label: z.string().optional(),
  agent: z.string().optional(),
  optional: z.boolean().optional(),
  verification: z
    .array(z.enum(['unit', 'integration', 'smoke', 'e2e', 'lint', 'typecheck']))
    .optional(),
});

export const LoopTemplateSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  phases: z.array(PhaseConfigSchema).min(1),
  maxIterations: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  escalationThreshold: z.number().int().positive().optional(),
  testModeMaxRetries: z.number().int().nonnegative().optional(),
  testModeEscalationThreshold: z.number().int().positive().optional(),
});

export class LoopTemplates {
  private cache: Map<string, LoopTemplate> | null = null;

  constructor(private readonly dir: string = LoopTemplates.resolveLoopsDir()) {}

  list(): Array<{ name: string; description: string; phaseCount: number }> {
    return Array.from(this.load().values()).map((t) => ({
      name: t.name,
      description: t.description,
      phaseCount: t.phases.length,
    }));
  }

  get(name: string): LoopTemplate | undefined {
    return this.load().get(name);
  }

  getDefault(): LoopTemplate | undefined {
    const cfg = loadLoopEngineConfig();
    if (cfg.default_template) return this.get(cfg.default_template);
    return undefined;
  }

  private load(): Map<string, LoopTemplate> {
    if (this.cache) return this.cache;
    const map = new Map<string, LoopTemplate>();
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    } catch {
      // No loops dir — empty set.
    }
    for (const file of files) {
      try {
        const raw = YAML.parse(fs.readFileSync(path.join(this.dir, file), 'utf-8'));
        const parsed = LoopTemplateSchema.parse(raw);
        const template: LoopTemplate = {
          name: parsed.name,
          description: parsed.description,
          phases: parsed.phases.map((p) => ({
            phase: p.phase as typeof Phase[keyof typeof Phase],
            label: p.label,
            agent: p.agent,
            optional: p.optional,
            verification: p.verification,
          })),
          maxIterations: parsed.maxIterations,
          maxRetries: parsed.maxRetries,
          escalationThreshold: parsed.escalationThreshold,
          testModeMaxRetries: parsed.testModeMaxRetries,
          testModeEscalationThreshold: parsed.testModeEscalationThreshold,
        };
        map.set(template.name, template);
      } catch {
        // Skip malformed template files.
      }
    }
    this.cache = map;
    return map;
  }

  /** dist/recipes/loops → <root>/recipes/loops → cwd/recipes/loops. */
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
