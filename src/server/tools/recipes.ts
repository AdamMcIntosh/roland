/**
 * ## P1 Honesty & Consolidation
 *
 * Recipe catalog (filesystem-driven) and recipe session tools.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { McpToolError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { ParsedRecipe, SubagentDef, RecipeStepDef } from '../recipe-session.js';
import type { McpToolContext, McpToolRegistrar, RecipeCatalogEntry } from './types.js';

/** Fallback triggers for enterprise recipes that omit triggers in YAML. */
const DEFAULT_RECIPE_TRIGGERS: Record<string, string[]> = {
  PlanExecRevEx: ['build', 'implement', 'create', 'develop', 'feature', 'full', 'complete', 'end to end', 'end-to-end'],
  BugFix: ['bug', 'fix', 'broken', 'not working', 'error', 'crash', 'fails', 'issue', 'defect', 'regression'],
  SecurityAudit: ['security audit', 'vulnerability', 'penetration', 'owasp', 'secure', 'hardening', 'threat model'],
  RESTfulAPI: ['api', 'rest', 'endpoint', 'restful', 'crud', 'route', 'controller'],
  WebAppFullStack: ['web app', 'full stack', 'fullstack', 'frontend', 'backend', 'full-stack', 'application', 'webapp'],
  MicroservicesArchitecture: ['microservice', 'service decomposition', 'distributed', 'event driven', 'message queue', 'kafka'],
  DocumentationRefactor: ['documentation', 'docs refactor', 'readme', 'api docs', 'document everything', 'doc update'],
  DesktopApp: ['desktop', 'electron', 'tauri', 'native app', 'gui', 'desktop app', 'cross-platform', 'maui', 'installable', 'offline app'],
  VB6Migration: ['vb6', 'visual basic', 'vb 6', 'migrate', 'migration', 'legacy', 'vb6 to c#', 'vb to csharp', 'modernize', 'rewrite'],
  CodeReviewCompliance: ['compliance', 'code review', 'audit', 'standards'],
  Refactor: ['refactor', 'clean up', 'restructure', 'reorganize'],
};

/** Resolve the recipes directory relative to the server install location. */
export function resolveRecipesDir(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const toolsDir = path.dirname(thisFile);
    const serverDir = path.resolve(toolsDir, '..');
    const installDir = path.resolve(serverDir, '..');
    const rootDir = path.resolve(installDir, '..');

    const distRecipes = path.join(installDir, 'recipes');
    if (fs.existsSync(distRecipes)) return distRecipes;

    const srcRecipes = path.join(rootDir, 'recipes');
    if (fs.existsSync(srcRecipes)) return srcRecipes;
  } catch {
    // fall through
  }

  return path.join(process.cwd(), 'recipes');
}

/** Build triage recipe catalog from recipes/*.yaml on disk. */
export function buildRecipeCatalog(recipesDir: string): RecipeCatalogEntry[] {
  if (!fs.existsSync(recipesDir)) return [];

  const files = fs.readdirSync(recipesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const catalog: RecipeCatalogEntry[] = [];

  for (const file of files) {
    try {
      const fileKey = path.basename(file, path.extname(file));
      const raw = YAML.parse(fs.readFileSync(path.join(recipesDir, file), 'utf-8'));
      if (!raw) continue;

      const agents = (raw.subagents || []).map((s: { name?: string }) =>
        (s.name || 'unknown').toLowerCase().replace(/\s+/g, '-'),
      );
      const yamlTriggers = Array.isArray(raw.triggers)
        ? raw.triggers.filter((t: unknown): t is string => typeof t === 'string')
        : undefined;

      catalog.push({
        name: raw.name || fileKey,
        fileKey,
        description: raw.description || '',
        triggers: yamlTriggers ?? DEFAULT_RECIPE_TRIGGERS[fileKey] ?? [fileKey.toLowerCase()],
        agents,
        category: raw.category === 'solo' ? 'solo' : raw.category === 'enterprise' ? 'enterprise' : undefined,
      });
    } catch {
      logger.warn(`[recipes] Skipping malformed recipe for catalog: ${file}`);
    }
  }

  return catalog;
}

export function scanRecipeFiles(recipesDir: string): Array<{ name: string; description: string; agents: string[] }> {
  if (!fs.existsSync(recipesDir)) return [];
  const files = fs.readdirSync(recipesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const results: Array<{ name: string; description: string; agents: string[] }> = [];

  for (const file of files) {
    try {
      const raw = YAML.parse(fs.readFileSync(path.join(recipesDir, file), 'utf-8'));
      if (!raw) continue;
      const agents = (raw.subagents || []).map((s: { name?: string }) => s.name || 'unknown');
      results.push({
        name: raw.name || path.basename(file, path.extname(file)),
        description: raw.description || '',
        agents,
      });
    } catch {
      logger.warn(`[recipes] Skipping malformed recipe: ${file}`);
    }
  }
  return results;
}

export function parseRecipeForSession(recipeData: Record<string, unknown>): ParsedRecipe {
  const rawSubagents = (recipeData.subagents || recipeData.agents_config || []) as Array<Record<string, unknown>>;
  const rawSteps = (recipeData.steps || (recipeData.workflow as { steps?: unknown[] } | undefined)?.steps || []) as Array<Record<string, unknown>>;

  const subagents: SubagentDef[] = rawSubagents.map(sa => ({
    name: (sa.name as string) || 'unknown',
    prompt: (sa.prompt as string) || (sa.system_prompt as string) || `You are the ${sa.name} agent.`,
    model: sa.model as string | undefined,
    provider: sa.provider as string | undefined,
  }));

  const steps: RecipeStepDef[] = rawSteps.map(step => ({
    agent: (step.agent as string) || (step.name as string) || 'unknown',
    input: step.input as string | undefined,
    output_to: step.output_to as string | undefined,
    loop_if: typeof step.loop_if === 'string' ? step.loop_if : (step.loop_if as { condition?: string } | undefined)?.condition,
    loop_to: step.loop_to as string | undefined,
    final_output: step.final_output === true,
    condition: step.condition as string | undefined,
  }));

  return {
    name: (recipeData.name as string) || 'unknown',
    description: (recipeData.description as string) || '',
    subagents,
    steps,
    options: recipeData.options as ParsedRecipe['options'],
    settings: recipeData.settings as ParsedRecipe['settings'],
  };
}

export function registerRecipeTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'list_recipes',
    'List all available multi-agent workflow recipes with their descriptions and agent chains',
    async () => {
      const recipes = scanRecipeFiles(ctx.recipesDir);
      return { count: recipes.length, recipes };
    },
    { type: 'object', properties: {}, required: [] },
  );

  registrar.registerTool(
    'start_recipe',
    'Start a multi-agent recipe session. Returns the first step\'s system prompt and user prompt for you to execute. Then call advance_recipe with your output to get the next step. Available recipes are listed by list_recipes.',
    async (args: Record<string, unknown>) => {
      const recipeName = args.recipe_name as string;
      const userTask = args.task as string;

      if (!recipeName) throw new McpToolError('start_recipe', 'recipe_name is required');
      if (!userTask) throw new McpToolError('start_recipe', 'task is required — describe what you want to accomplish');

      try {
        const recipePath = path.join(ctx.recipesDir, `${recipeName}.yaml`);
        if (!fs.existsSync(recipePath)) {
          throw new McpToolError('start_recipe', `Recipe not found: ${recipeName}`);
        }

        const rawYaml = YAML.parse(fs.readFileSync(recipePath, 'utf-8'));
        if (!rawYaml) throw new McpToolError('start_recipe', `Failed to parse recipe: ${recipeName}`);

        const parsed = parseRecipeForSession(rawYaml);
        const stepPrompt = ctx.recipeSessionManager.startSession(parsed, userTask);

        return {
          instructions: 'Execute this step using the system_prompt as your persona and user_prompt as the task. ' +
                        'When done, call advance_recipe with session_id and your complete output.',
          ...stepPrompt,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new McpToolError('start_recipe', `Failed to start recipe: ${message}`);
      }
    },
    {
      type: 'object',
      properties: {
        recipe_name: { type: 'string', description: 'Name of the recipe (e.g., "BugFix", "PlanExecRevEx", "SecurityAudit")' },
        task: { type: 'string', description: 'The task to accomplish (e.g., "Create a hello world Express app with tests")' },
      },
      required: ['recipe_name', 'task'],
    },
  );

  registrar.registerTool(
    'advance_recipe',
    'Submit the output from the current recipe step and get the next step\'s prompt. When all steps are complete, returns a summary. Pass cost data if available for budget tracking.',
    async (args: Record<string, unknown>) => {
      const sessionId = args.session_id as string;
      const stepOutput = args.step_output as string;

      if (!sessionId) throw new McpToolError('advance_recipe', 'session_id is required');
      if (!stepOutput) throw new McpToolError('advance_recipe', 'step_output is required — provide your complete output for this step');

      const costData = args.cost ? args.cost as {
        input_tokens?: number;
        output_tokens?: number;
        cost?: number;
        model?: string;
      } : undefined;

      try {
        const result = ctx.recipeSessionManager.advanceSession(sessionId, stepOutput, costData);

        if ('status' in result && (result.status === 'completed' || result.status === 'failed')) {
          return { type: 'summary', ...result };
        }

        return {
          type: 'next_step',
          instructions: 'Execute this step using the system_prompt as your persona and user_prompt as the task. ' +
                        'When done, call advance_recipe again with session_id and your complete output.',
          ...result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new McpToolError('advance_recipe', message);
      }
    },
    {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The session ID returned by start_recipe' },
        step_output: { type: 'string', description: 'Your complete output for the current step' },
        cost: {
          type: 'object',
          description: 'Optional cost data for budget tracking',
          properties: {
            input_tokens: { type: 'number', description: 'Input tokens used' },
            output_tokens: { type: 'number', description: 'Output tokens used' },
            cost: { type: 'number', description: 'Cost in USD' },
            model: { type: 'string', description: 'Model used' },
          },
        },
      },
      required: ['session_id', 'step_output'],
    },
  );
}
