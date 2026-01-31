/**
 * Model Router - Ecomode Simple Model Selection
 * 
 * MVP Version: Always selects the cheapest model for a given complexity level
 * Routes queries to the most cost-effective LLM based on task complexity
 */

import { getConfig, ConfigLoader } from '../config/config-loader.js';
import { ModelSelection, RoutingContext } from '../utils/types.js';
import { RoutingError } from '../utils/errors.js';

/**
 * Model pricing (input/output tokens per million)
 * Used to estimate cheapest option per complexity level
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'grok-3-mini': { input: 0.5, output: 1.5 },
  'grok-3': { input: 2, output: 10 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-4-sonnet': { input: 3, output: 15 },
  'gpt-4o': { input: 5, output: 15 },
  'gemini-2.5-pro': { input: 2.5, output: 10 },
  'claude-4.5-sonnet': { input: 3, output: 15 },
};

export class ModelRouter {
  /**
   * Select the cheapest model for Ecomode
   * MVP: Always use the first (cheapest) model from the configured complexity level
   * 
   * @param context - Routing context (complexity level, etc.)
   * @returns Selected model info
   */
  static selectCheapestModel(context: RoutingContext): ModelSelection {
    const config = getConfig();
    if (!config) {
      throw new RoutingError('Configuration not loaded. Call loadConfig() first.');
    }

    // Determine complexity level (default to 'simple' for Ecomode)
    const complexity = context.complexity || 'simple';

    // Get models for this complexity level
    const models = config.routing[complexity as keyof typeof config.routing];
    
    if (!models || models.length === 0) {
      throw new RoutingError(
        `No models configured for complexity level: ${complexity}`
      );
    }

    // Get the first model (cheapest for this level)
    const selectedModel = models[0];

    // Get pricing info
    const pricing = MODEL_PRICING[selectedModel];
    if (!pricing) {
      throw new RoutingError(`Unknown model pricing for: ${selectedModel}`);
    }

    return {
      model: selectedModel,
      provider: this.getProvider(selectedModel),
      costPer1kTokens: (pricing.input + pricing.output) / 1000,
    };
  }

  /**
   * Select a model with fallback options
   * Prefers models that have configured API keys when required
   */
  static selectModelWithFallback(
    context: RoutingContext,
    options?: { requireApiKey?: boolean }
  ): { selected: ModelSelection; fallbacks: ModelSelection[] } {
    const config = getConfig();
    if (!config) {
      throw new RoutingError('Configuration not loaded. Call loadConfig() first.');
    }

    const complexity = context.complexity || 'simple';
    const models = config.routing[complexity as keyof typeof config.routing];

    if (!models || models.length === 0) {
      throw new RoutingError(`No models configured for complexity level: ${complexity}`);
    }

    const selections = models.map((model) => {
      const pricing = MODEL_PRICING[model];
      if (!pricing) {
        throw new RoutingError(`Unknown model pricing for: ${model}`);
      }
      return {
        model,
        provider: this.getProvider(model),
        costPer1kTokens: (pricing.input + pricing.output) / 1000,
      } as ModelSelection;
    });

    const requireApiKey = options?.requireApiKey ?? false;

    let selected: ModelSelection | undefined;
    if (requireApiKey) {
      selected = selections.find((s) => ConfigLoader.hasApiKey(config, s.provider));
      if (!selected) {
        throw new RoutingError(
          `No API keys configured for any models in complexity: ${complexity}`
        );
      }
    } else {
      selected = selections[0];
    }

    const fallbacks = selections.filter((s) => s.model !== selected!.model);

    return { selected, fallbacks };
  }

  /**
   * Get all available models for a complexity level
   * Useful for fallback selection
   * 
   * @param complexity - Complexity level
   * @returns Array of available models
   */
  static getModelsForComplexity(
    complexity: 'simple' | 'medium' | 'explain' | 'complex'
  ): string[] {
    const config = getConfig();
    if (!config) return [];
    return config.routing[complexity] || [];
  }

  /**
   * Estimate query cost based on model and token count
   * 
   * @param model - Model name
   * @param inputTokens - Input token count
   * @param outputTokens - Output token count
   * @returns Estimated cost in USD
   */
  static estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
      throw new RoutingError(`Unknown model: ${model}`);
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Generate a basic cost report for a model and token estimate
   */
  static generateCostReport(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): {
    model: string;
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
  } {
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
      throw new RoutingError(`Unknown model: ${model}`);
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    return {
      model,
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost,
    };
  }

  /**
   * Get the provider for a model
   * 
   * @param model - Model name
   * @returns Provider name
   */
  static getProvider(
    model: string
  ): 'anthropic' | 'openai' | 'google' | 'xai' {
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('gpt-')) return 'openai';
    if (model.startsWith('gemini-')) return 'google';
    if (model.startsWith('grok-')) return 'xai';
    throw new RoutingError(`Unknown provider for model: ${model}`);
  }

  /**
   * Compare cost between two models for the same task
   * Useful for showing cost savings
   * 
   * @param cheapModel - Cheaper model
   * @param expensiveModel - More expensive model
   * @param tokens - Estimated token count
   * @returns Cost comparison data
   */
  static compareCosts(
    cheapModel: string,
    expensiveModel: string,
    tokens: number
  ): { cheapCost: number; expensiveCost: number; savings: number } {
    const cheapCost = this.estimateCost(cheapModel, tokens, tokens);
    const expensiveCost = this.estimateCost(expensiveModel, tokens, tokens);

    return {
      cheapCost,
      expensiveCost,
      savings: expensiveCost - cheapCost,
    };
  }
}
