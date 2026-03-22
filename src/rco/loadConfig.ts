/**
 * RCO config and YAML loading (agents + recipes)
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { RcoConfigSchema, RcoRecipeSchema, AgentYamlSchema, type RcoConfig, type RcoRecipe, type AgentYaml } from './types.js';

const DEFAULT_AGENTS_DIR = 'agents';
const DEFAULT_RECIPES_DIR = 'recipes';
const RCO_RECIPES_SUBDIR = 'rco';

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

export function loadAllAgents(agentsDir: string = DEFAULT_AGENTS_DIR): Map<string, AgentYaml> {
  const map = new Map<string, AgentYaml>();
  const dir = path.isAbsolute(agentsDir) ? agentsDir : path.join(process.cwd(), agentsDir);
  if (!fs.existsSync(dir)) return map;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const f of files) {
    try {
      const agent = loadAgentYaml(path.join(dir, f));
      const name = (agent.name ?? path.basename(f, path.extname(f))).toLowerCase();
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

/** Dynamic agent selection: match task string against config task_routing patterns. */
export function getPreferredAgentsForTask(task: string, rcoConfig: { task_routing?: Array<{ pattern: string; agents: string[] }> }): string[] {
  const routing = rcoConfig.task_routing ?? [];
  const taskLower = task.toLowerCase();
  for (const { pattern, agents } of routing) {
    try {
      const re = new RegExp(pattern, 'i');
      if (re.test(taskLower)) return agents;
    } catch {
      if (taskLower.includes(pattern.toLowerCase())) return agents;
    }
  }
  return [];
}
