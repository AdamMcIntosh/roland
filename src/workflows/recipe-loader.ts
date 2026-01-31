/**
 * Recipe Loader
 * 
 * Loads and parses YAML recipe files from the recipes/ directory
 * and registers them with the workflow engine.
 */

import fs from 'fs';
import path from 'path';
import { Recipe, Workflow } from './types.js';
import { WorkflowEngine } from './engine.js';
import { logger } from '../utils/logger.js';

/**
 * Simple YAML parser (subset of YAML for our use case)
 * For production, would use full js-yaml library
 */
function parseYAML(content: string): Record<string, any> {
  // This is a simplified parser for basic YAML structure
  // In production, integrate full js-yaml library
  const result: Record<string, any> = {};
  let currentKey: string | null = null;
  let currentValue: string = '';
  let inArray: boolean = false;
  let arrayItems: string[] = [];

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.endsWith(':')) {
      // Key without value
      const key = trimmed.slice(0, -1).trim();
      if (inArray) {
        arrayItems.push(key);
      } else {
        if (currentKey && currentValue) {
          result[currentKey] = currentValue;
        }
        currentKey = key;
        currentValue = '';
      }
    } else if (trimmed.includes(':')) {
      // Key-value pair
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        result[key.trim()] = value.slice(1, -1).split(',').map((s) => s.trim());
      } else if (value === 'true') {
        result[key.trim()] = true;
      } else if (value === 'false') {
        result[key.trim()] = false;
      } else if (!isNaN(Number(value))) {
        result[key.trim()] = Number(value);
      } else {
        result[key.trim()] = value;
      }
    } else if (trimmed.startsWith('- ')) {
      // Array item
      inArray = true;
      arrayItems.push(trimmed.slice(2));
    } else if (inArray && !trimmed.startsWith('-')) {
      inArray = false;
      if (currentKey) {
        result[currentKey] = arrayItems;
        arrayItems = [];
      }
    }
  }

  if (inArray && arrayItems.length > 0 && currentKey) {
    result[currentKey] = arrayItems;
  } else if (currentKey && currentValue) {
    result[currentKey] = currentValue;
  }

  return result;
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
      const parsed = parseYAML(content) as Record<string, any>;

      if (!parsed) {
        throw new Error('Empty recipe file');
      }

      // Validate recipe structure
      const recipe = this.validateRecipe(parsed);
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
  private validateRecipe(data: Record<string, any>): Recipe {
    const recipe: Recipe = {
      name: data.name || 'untitled',
      recipe: data.recipe || data.name,
      description: data.description,
      version: data.version || '1.0.0',
      author: data.author,
      agents: data.agents || [],
      modes: data.modes,
      steps: data.steps || [],
      variables: data.variables,
      input_variables: data.input_variables,
      outputs: data.outputs,
      max_total_cost: data.max_total_cost,
      max_duration_seconds: data.max_duration_seconds,
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
