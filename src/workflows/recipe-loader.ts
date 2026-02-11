/**
 * Recipe Loader
 * 
 * Loads and parses YAML recipe files from the recipes/ directory
 * and registers them with the workflow engine.
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { Recipe, WorkflowStep } from './types.js';
import { WorkflowEngine } from './engine.js';
import { logger } from '../utils/logger.js';

function normalizeAgentName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Recipe Loader - manages loading recipes from YAML files
 */
export class RecipeLoader {
  private recipesDir: string;
  private engine: WorkflowEngine;
  private loadedRecipes: Map<string, Recipe> = new Map();

  constructor(engine: WorkflowEngine, recipesDir?: string) {
    this.engine = engine;
    this.recipesDir = recipesDir || path.join(process.cwd(), 'recipes');
  }

  /**
   * Load all recipes from recipes directory
   */
  async loadAllRecipes(): Promise<Recipe[]> {
    try {
      if (!fs.existsSync(this.recipesDir)) {
        logger.warn(`[RecipeLoader] Recipes directory not found: ${this.recipesDir}`);
        return [];
      }

      const files = fs.readdirSync(this.recipesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
      const recipes: Recipe[] = [];

      for (const file of files) {
        try {
          const recipe = await this.loadRecipe(file);
          if (recipe) {
            recipes.push(recipe);
            this.engine.registerWorkflow(recipe);
            this.loadedRecipes.set(`${recipe.name}:${recipe.version || '1.0.0'}`, recipe);
          }
        } catch (error) {
          logger.error(`[RecipeLoader] Error loading recipe ${file}:`, error);
        }
      }

      logger.info(`[RecipeLoader] Loaded ${recipes.length} recipes`);
      return recipes;
    } catch (error) {
      logger.error(`[RecipeLoader] Error loading recipes:`, error);
      return [];
    }
  }

  /**
   * Load a single recipe file
   */
  async loadRecipe(filename: string): Promise<Recipe | null> {
    try {
      const filePath = path.join(this.recipesDir, filename);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Recipe file not found: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = YAML.parse(content) as Record<string, any>;

      if (!parsed) {
        throw new Error('Empty recipe file');
      }

      // Validate recipe structure
      const defaultName = path.basename(filename, path.extname(filename));
      const recipe = this.validateRecipe(parsed, defaultName);
      logger.debug(`[RecipeLoader] Loaded recipe: ${recipe.name} v${recipe.version || '1.0.0'}`);

      return recipe;
    } catch (error) {
      logger.error(`[RecipeLoader] Error loading recipe file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Get a loaded recipe
   */
  getRecipe(name: string, version?: string): Recipe | undefined {
    const key = `${name}:${version || '1.0.0'}`;
    return this.loadedRecipes.get(key);
  }

  /**
   * List all loaded recipes
   */
  listRecipes(): Array<{
    name: string;
    recipe: string;
    version: string;
    description?: string;
    tags?: string[];
  }> {
    return Array.from(this.loadedRecipes.values()).map((r) => ({
      name: r.name,
      recipe: r.recipe || 'custom',
      version: r.version || '1.0.0',
      description: r.description,
      tags: r.tags,
    }));
  }

  /**
   * Validate and normalize recipe structure
   */
  private validateRecipe(data: Record<string, any>, defaultName?: string): Recipe {
    const workflowSteps = data.steps || data.workflow?.steps || [];
    const normalizedSteps: WorkflowStep[] = workflowSteps.map((step: any, index: number) => {
      const agentName = typeof step.agent === 'string' ? normalizeAgentName(step.agent) : undefined;
      const loopIf =
        typeof step.loop_if === 'string'
          ? { condition: step.loop_if }
          : step.loop_if;

      return {
        name: step.name || step.id || agentName || `step-${index + 1}`,
        description: step.description,
        agent: agentName,
        action: step.action,
        input: step.input,
        output_to: step.output_to,
        skip_if: step.skip_if,
        loop_if: loopIf,
        mode: step.mode,
        max_cost: step.max_cost,
        timeout_seconds: step.timeout_seconds,
        retry: step.retry,
        allow_file_writes: step.allow_file_writes === true,
        max_output_chars: step.max_output_chars,
      };
    });

    const derivedAgents = (data.subagents || [])
      .map((a: any) => (typeof a?.name === 'string' ? normalizeAgentName(a.name) : undefined))
      .filter(Boolean) as string[];

    const agentsFromSteps = normalizedSteps
      .map((s) => s.agent)
      .filter((s): s is string => Boolean(s));

    const agents = data.agents || derivedAgents || agentsFromSteps;

    const hasUserTask = normalizedSteps.some(
      (step) => typeof step.input === 'string' && step.input.includes('{{user_task}}')
    );

    const recipeName = defaultName || data.name || 'untitled';

    const recipe: Recipe = {
      name: recipeName,
      recipe: data.recipe || data.name || recipeName,
      description: data.description,
      version: data.version || '1.0.0',
      author: data.author,
      agents: agents || [],
      modes: data.modes,
      steps: normalizedSteps,
      variables: data.variables,
      input_variables: data.input_variables || (hasUserTask ? ['user_task'] : undefined),
      outputs: data.outputs,
      max_total_cost: data.max_total_cost,
      max_duration_seconds: data.max_duration_seconds,
      max_output_chars: data.max_output_chars,
      parallel_steps: data.parallel_steps,
      checkpoint_at: data.checkpoint_at,
      tags: data.tags,
      template_variables: data.template_variables,
    };

    // Ensure required fields
    if (!recipe.name) {
      throw new Error('Recipe must have a name');
    }

    if (!recipe.agents || recipe.agents.length === 0) {
      throw new Error(`Recipe "${recipe.name}" must specify agents`);
    }

    if (!recipe.steps || recipe.steps.length === 0) {
      throw new Error(`Recipe "${recipe.name}" must have steps`);
    }

    return recipe;
  }

  /**
   * Create a new recipe from template
   */
  createRecipeFromTemplate(
    name: string,
    template: Partial<Recipe> = {}
  ): Recipe {
    return {
      name,
      recipe: template.recipe || name,
      description: template.description || `Recipe: ${name}`,
      version: template.version || '1.0.0',
      author: template.author,
      agents: template.agents || [],
      steps: template.steps || [],
      modes: template.modes,
      variables: template.variables,
      input_variables: template.input_variables,
      outputs: template.outputs,
      max_total_cost: template.max_total_cost,
      max_duration_seconds: template.max_duration_seconds,
      max_output_chars: template.max_output_chars,
      tags: template.tags,
      template_variables: template.template_variables,
    };
  }

  /**
   * Save recipe to file
   */
  saveRecipe(recipe: Recipe, filename?: string): string {
    try {
      if (!fs.existsSync(this.recipesDir)) {
        fs.mkdirSync(this.recipesDir, { recursive: true });
      }

      const file = filename || `${recipe.name.toLowerCase().replace(/\s+/g, '-')}.yaml`;
      const filePath = path.join(this.recipesDir, file);

      const yamlContent = `# ${recipe.name}
# Version: ${recipe.version || '1.0.0'}
name: ${recipe.name}
recipe: ${recipe.recipe || recipe.name}
version: ${recipe.version || '1.0.0'}
description: ${recipe.description || ''}
agents:
${(recipe.agents || []).map((a) => `  - ${a}`).join('\n')}
`;

      fs.writeFileSync(filePath, yamlContent, 'utf-8');
      logger.info(`[RecipeLoader] Saved recipe: ${filePath}`);

      return filePath;
    } catch (error) {
      logger.error(`[RecipeLoader] Error saving recipe:`, error);
      throw error;
    }
  }
}

/**
 * Create a recipe loader with the given engine
 */
export function createRecipeLoader(engine: WorkflowEngine, recipesDir?: string): RecipeLoader {
  return new RecipeLoader(engine, recipesDir);
}
