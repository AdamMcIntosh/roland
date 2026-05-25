/**
 * RCO config and YAML loading (agents + recipes)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { RcoConfigSchema, RcoRecipeSchema, AgentYamlSchema, type RcoConfig, type RcoRecipe, type AgentYaml } from './types.js';

const DEFAULT_AGENTS_DIR = 'agents';
const DEFAULT_RECIPES_DIR = 'recipes';
const RCO_RECIPES_SUBDIR = 'rco';

/**
 * Regex matching agent name suffixes used for cost-tier variants.
 * e.g. "executor-low", "architect-high", "designer-medium"
 */
const VARIANT_SUFFIX_RE = /-(low|medium|high)$/i;

/**
 * Canonical agents-directory resolver — single source of truth.
 *
 * Resolution order:
 *   1. `override` (e.g. from CLI --agents-dir flag)
 *   2. `installDir/agents`  — dist/agents when compiled, src/agents in dev
 *   3. `rootDir/agents`     — project root agents/ (e.g. when running from dist/server/)
 *   4. `cwd/agents`         — last resort
 *
 * Pass `referenceUrl = import.meta.url` from any call site to anchor resolution
 * to that file's install directory rather than loadConfig's own location.
 */
export function resolveAgentsDir(referenceUrl?: string, override?: string): string {
  if (override) return override;
  try {
    const ref = referenceUrl ?? import.meta.url;
    const refDir = path.dirname(fileURLToPath(ref));
    const installDir = path.resolve(refDir, '..'); // dist/rco → dist  (or dist/server → dist, dist/pm → dist)
    const rootDir = path.resolve(installDir, '..'); // dist → project root
    const distAgents = path.join(installDir, 'agents');
    if (fs.existsSync(distAgents)) return distAgents;
    const srcAgents = path.join(rootDir, 'agents');
    if (fs.existsSync(srcAgents)) return srcAgents;
  } catch { /* fall through to cwd fallback */ }
  return path.join(process.cwd(), 'agents');
}

export function loadRcoConfig(configPath: string = 'config.yaml'): RcoConfig {
  const content = fs.readFileSync(configPath, 'utf-8');
  const doc = yaml.load(content) as Record<string, unknown>;
  const rco = doc?.rco;
  if (!rco || typeof rco !== 'object') {
    return {};
  }
  const parsed = RcoConfigSchema.safeParse(rco);
  return parsed.success ? parsed.data : {};
}

export function loadAgentYaml(filePath: string): AgentYaml {
  const content = fs.readFileSync(filePath, 'utf-8');
  const doc = yaml.load(content) as Record<string, unknown>;
  const parsed = AgentYamlSchema.safeParse(doc);
  if (!parsed.success) throw new Error(`Invalid agent YAML ${filePath}: ${parsed.error.message}`);
  return parsed.data;
}

export interface LoadAllAgentsOptions {
  /**
   * When true, skips agents whose names end in -low, -medium, or -high.
   * Use for the PM team roster so the Lead PM only sees primary personas.
   */
  excludeVariants?: boolean;
}

export function loadAllAgents(agentsDir: string = DEFAULT_AGENTS_DIR, opts: LoadAllAgentsOptions = {}): Map<string, AgentYaml> {
  const map = new Map<string, AgentYaml>();
  const dir = path.isAbsolute(agentsDir) ? agentsDir : path.join(process.cwd(), agentsDir);
  if (!fs.existsSync(dir)) return map;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const f of files) {
    const baseName = path.basename(f, path.extname(f));
    if (opts.excludeVariants && VARIANT_SUFFIX_RE.test(baseName)) continue;
    try {
      const agent = loadAgentYaml(path.join(dir, f));
      const name = (agent.name ?? baseName).toLowerCase();
      map.set(name, agent);
    } catch (e) {
      console.error(`[RCO] Skip agent ${f}:`, e);
    }
  }
  return map;
}

export function loadRecipe(recipeName: string, recipesDir: string = DEFAULT_RECIPES_DIR): RcoRecipe {
  const base = path.isAbsolute(recipesDir) ? recipesDir : path.join(process.cwd(), recipesDir);
  const rcoPath = path.join(base, RCO_RECIPES_SUBDIR, `${recipeName}.yaml`);
  const fallbackPath = path.join(base, `${recipeName}.yaml`);
  const pathToLoad = fs.existsSync(rcoPath) ? rcoPath : fallbackPath;
  if (!fs.existsSync(pathToLoad)) {
    throw new Error(`Recipe not found: ${recipeName} (tried ${rcoPath}, ${fallbackPath})`);
  }
  const content = fs.readFileSync(pathToLoad, 'utf-8');
  const doc = yaml.load(content) as Record<string, unknown>;
  const parsed = RcoRecipeSchema.safeParse(doc);
  if (!parsed.success) {
    throw new Error(`Invalid recipe ${pathToLoad}: ${parsed.error.message}`);
  }
  return parsed.data;
}

