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
  // xAI Grok models
  'grok-code-fast-1': { input: 0.5, output: 1.5 },
  'grok-3-mini': { input: 1, output: 3 },
  'grok-3': { input: 5, output: 15 },
  'grok-4-1-fast-non-reasoning': { input: 2, output: 6 },
  'grok-4-1-fast-reasoning': { input: 5, output: 15 },
  'grok-4-fast-non-reasoning': { input: 2, output: 6 },
  'grok-4-fast-reasoning': { input: 5, output: 15 },
  'grok-4-0709': { input: 5, output: 15 },
  'grok-2-vision-1212': { input: 2, output: 6 },
  // Google Gemini models
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.5-pro': { input: 1.5, output: 6 },
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash-001': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash-lite': { input: 0.05, output: 0.2 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-flash-latest': { input: 0.075, output: 0.3 },
  'gemini-pro-latest': { input: 1.25, output: 5 },
  // OpenAI models
  'gpt-5-pro': { input: 4, output: 16 },
  'gpt-5': { input: 2, output: 8 },
  'gpt-4o-2024-11-20': { input: 2.5, output: 10 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo-2024-04-09': { input: 10, output: 30 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // Anthropic Claude models (latest)
  'claude-opus-4-5-20251101': { input: 15, output: 60 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-opus-4-1-20250805': { input: 15, output: 60 },
  'claude-opus-4-20250514': { input: 15, output: 60 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-7-sonnet-20250219': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  // Legacy Claude models
  'claude-3-5-sonnet-20240620': { input: 3, output: 15 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
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
    if (apiKeys.xai) providers.add('xai');
    if (apiKeys.anthropic) providers.add('anthropic');
    if (apiKeys.openai) providers.add('openai');
    if (apiKeys.google) providers.add('google');

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
        `Please configure at least one API key (xAI, Anthropic, OpenAI, or Google).`
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
        `Please configure at least one API key (xAI, Anthropic, OpenAI, or Google).`
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
