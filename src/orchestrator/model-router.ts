/**
 * Model Router - Enhanced Model Selection with Complexity Classification
 * 
 * Phase 4 Enhanced: Intelligently routes queries based on complexity analysis
 * Supports: complexity classification, provider abstraction, advanced fallback
 */

import { getConfig, ConfigLoader } from '../config/config-loader.js';
import { ModelSelection, RoutingContext } from '../utils/types.js';
import { RoutingError } from '../utils/errors.js';
import { ComplexityClassifier } from './complexity-classifier.js';
import { ProviderAbstraction, LLMProvider } from './provider-abstraction.js';

/**
 * Model pricing (input/output tokens per million)
 * Used to estimate cheapest option per complexity level
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenRouter Free models (all $0)
  'meta-llama/llama-3.2-3b-instruct:free': { input: 0, output: 0 },
  'openrouter/pony-alpha': { input: 0, output: 0 },
  'nousresearch/hermes-3-llama-3.1-405b:free': { input: 0, output: 0 },
  'stepfun/step-3.5-flash:free': { input: 0, output: 0 },
  'arcee-ai/trinity-large-preview:free': { input: 0, output: 0 },
  'tngtech/deepseek-r1t2-chimera:free': { input: 0, output: 0 },
  'deepseek/deepseek-r1-0528:free': { input: 0, output: 0 },
  'nvidia/nemotron-3-nano-30b-a3b:free': { input: 0, output: 0 },
  'z-ai/glm-4.5-air:free': { input: 0, output: 0 },
};

export class ModelRouter {
  /**
   * Analyze query complexity and suggest model (Phase 4 Enhanced)
   * 
   * @param query - Raw query string
   * @returns Complexity analysis with suggested model
   */
  static analyzeQueryComplexity(query: string) {
    const analysis = ComplexityClassifier.getDetailedAnalysis(query);
    return {
      complexity: analysis.complexity,
      score: analysis.score,
      tokenEstimate: analysis.tokenEstimate,
      suggestedModel: analysis.suggestedModel,
      factors: analysis.factors,
    };
  }

  /**
   * Route query based on automatic complexity detection (Phase 4 Enhanced)
   * 
   * @param query - Query to analyze
   * @param options - Routing options
   * @returns Selected model with fallbacks
   */
  static routeByComplexity(
    query: string,
    options?: { requireApiKey?: boolean; preferredProvider?: LLMProvider }
  ): { selected: ModelSelection; fallbacks: ModelSelection[]; analysis: ReturnType<typeof ComplexityClassifier.getDetailedAnalysis> } {
    // Analyze query complexity
    const analysis = ComplexityClassifier.getDetailedAnalysis(query);

    // Route based on detected complexity
    const context: RoutingContext = {
      queryLength: query.length,
      complexity: analysis.complexity,
    };

    const routing = this.selectModelWithFallback(context, options);

    return {
      ...routing,
      analysis,
    };
  }

  /**
   * Select model from a specific provider (Phase 4 Enhanced)
   * 
   * @param provider - Provider to select from
   * @param complexity - Complexity level
   * @returns Selected model info
   */
  static selectFromProvider(
    provider: LLMProvider,
    complexity: 'simple' | 'medium' | 'complex'
  ): ModelSelection {
    const models = ProviderAbstraction.getModelsForProvider(provider);
    if (models.length === 0) {
      throw new RoutingError(`No models available for provider: ${provider}`);
    }

    // Prefer the first model from the provider
    const model = models[0];

    return {
      model,
      provider,
      costPer1kTokens: ProviderAbstraction.estimateCost(model, 1000, 1000) / 1000,
    };
  }

  /**
   * Compare multiple models for a query (Phase 4 Enhanced)
   * Useful for showing cost/performance tradeoffs
   */
  static compareModels(
    query: string,
    models: string[]
  ): Array<{
    model: string;
    provider: LLMProvider;
    estimatedCost: number;
    supportsStreaming: boolean;
    supportsTools: boolean;
  }> {
    const analysis = ComplexityClassifier.getDetailedAnalysis(query);
    const tokens = analysis.tokenEstimate;

    return models.map((model) => {
      const provider = ProviderAbstraction.getProvider(model);
      const cost = ProviderAbstraction.estimateCost(model, tokens, tokens * 2); // Assume 2x output

      return {
        model,
        provider,
        estimatedCost: cost,
        supportsStreaming: ProviderAbstraction.supportsFeature(
          provider,
          'streaming'
        ),
        supportsTools: ProviderAbstraction.supportsFeature(provider, 'tools'),
      };
    });
  }

  /**
   * Find best model for specific requirements (Phase 4 Enhanced)
   */
  static findBestModelForUseCase(options: {
    query?: string;
    needsStreaming?: boolean;
    needsTools?: boolean;
    needsVision?: boolean;
    maxCostPerQuery?: number;
    preferredProvider?: LLMProvider;
  }): ModelSelection {
    let candidates: string[] = [];

    if (options.query) {
      const analysis = ComplexityClassifier.getDetailedAnalysis(options.query);
      const routingContext: RoutingContext = {
        queryLength: options.query.length,
        complexity: analysis.complexity,
      };
      const config = getConfig();
      if (config) {
        candidates = config.routing[analysis.complexity] || [];
      }
    } else {
      candidates = ProviderAbstraction.getSupportedModels();
    }

    // Filter by feature requirements
    for (const model of candidates) {
      const provider = ProviderAbstraction.getProvider(model);

      if (
        options.needsStreaming &&
        !ProviderAbstraction.supportsFeature(provider, 'streaming')
      ) {
        continue;
      }
      if (
        options.needsTools &&
        !ProviderAbstraction.supportsFeature(provider, 'tools')
      ) {
        continue;
      }
      if (
        options.needsVision &&
        !ProviderAbstraction.supportsFeature(provider, 'vision')
      ) {
        continue;
      }
      if (
        options.preferredProvider &&
        provider !== options.preferredProvider
      ) {
        continue;
      }

      return {
        model,
        provider,
        costPer1kTokens:
          ProviderAbstraction.estimateCost(model, 1000, 1000) / 1000,
      };
    }

    // Fallback to cheapest
    return this.selectCheapestModel({ queryLength: 1, complexity: 'simple' });
  }
  /**
   * Get which providers have API keys configured
   */
  static getConfiguredProviders(): Set<string> {
    const config = getConfig();
    if (!config) {
      return new Set();
    }

    const providers = new Set<string>();
    
    // Check if each provider has an API key
    const apiKeys = config.samwise.api_keys as Record<string, string>;
    // Only OpenRouter is supported

    return providers;
  }

  /**
   * Filter models to only include those from configured providers
   */
  static filterModelsByConfiguredProviders(models: string[]): string[] {
    const configuredProviders = this.getConfiguredProviders();
    
    // If no providers configured, return all models (will fail with clear error later)
    if (configuredProviders.size === 0) {
      return models;
    }

    return models.filter(model => {
      const provider = this.getProvider(model);
      return configuredProviders.has(provider);
    });
  }

  /**
   * Select the cheapest model for Ecomode
   * MVP: Always use the first (cheapest) model from the configured complexity level
   * Filters to only use models from providers with API keys configured
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
    let models = config.routing[complexity as keyof typeof config.routing];
    
    if (!models || models.length === 0) {
      throw new RoutingError(
        `No models configured for complexity level: ${complexity}`
      );
    }

    // Filter to only use providers with API keys
    models = this.filterModelsByConfiguredProviders(models);

    if (models.length === 0) {
      throw new RoutingError(
        `No models available for complexity level "${complexity}" from configured providers. ` +
        `Please configure at least one API key (OpenRouter, xAI, Anthropic, OpenAI, or Google).`
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
   * Filters to only use models from providers with configured API keys
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
    let models = config.routing[complexity as keyof typeof config.routing];

    if (!models || models.length === 0) {
      throw new RoutingError(`No models configured for complexity level: ${complexity}`);
    }

    // Filter to only use providers with API keys
    models = this.filterModelsByConfiguredProviders(models);

    if (models.length === 0) {
      throw new RoutingError(
        `No models available for complexity level "${complexity}" from configured providers. ` +
        `Please configure at least one API key (OpenRouter, xAI, Anthropic, OpenAI, or Google).`
      );
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
  ): 'openrouter' {
    // OpenRouter models use provider/model format or have ':free' suffix
    if (model.includes('/') || model.includes(':free')) return 'openrouter';
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
