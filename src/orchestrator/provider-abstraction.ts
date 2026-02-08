/**
 * Provider Abstraction Layer
 * 
 * Abstracts differences between LLM providers (Anthropic, OpenAI, Google, XAI, OpenRouter)
 * Provides unified interface for provider capabilities and constraints
 */

export type LLMProvider = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'xai';

export interface ProviderCapabilities {
  name: string;
  models: string[];
  maxTokens: number;
  supportStreaming: boolean;
  supportTools: boolean;
  supportVision: boolean;
  rateLimitPerMinute: number;
  costPerMillionInputTokens: Record<string, number>;
  costPerMillionOutputTokens: Record<string, number>;
}

export interface ProviderConstraints {
  maxContextLength: number;
  maxRequestsPerMinute: number;
  supportedParameters: string[];
}

/**
 * Provider configurations
 */
const PROVIDER_CONFIGS: Record<LLMProvider, ProviderCapabilities> = {
  anthropic: {
    name: 'Anthropic',
    models: ['claude-4-sonnet', 'claude-3-sonnet', 'claude-3-opus'],
    maxTokens: 200000,
    supportStreaming: true,
    supportTools: true,
    supportVision: true,
    rateLimitPerMinute: 60,
    costPerMillionInputTokens: {
      'claude-4-sonnet': 3,
      'claude-3-sonnet': 3,
      'claude-3-opus': 15,
    },
    costPerMillionOutputTokens: {
      'claude-4-sonnet': 15,
      'claude-3-sonnet': 15,
      'claude-3-opus': 75,
    },
  },
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    maxTokens: 128000,
    supportStreaming: true,
    supportTools: true,
    supportVision: true,
    rateLimitPerMinute: 3500, // Depends on quota tier
    costPerMillionInputTokens: {
      'gpt-4o': 5,
      'gpt-4o-mini': 0.15,
      'gpt-4-turbo': 10,
      'gpt-3.5-turbo': 0.5,
    },
    costPerMillionOutputTokens: {
      'gpt-4o': 15,
      'gpt-4o-mini': 0.6,
      'gpt-4-turbo': 30,
      'gpt-3.5-turbo': 1.5,
    },
  },
  google: {
    name: 'Google',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-pro'],
    maxTokens: 1000000,
    supportStreaming: true,
    supportTools: true,
    supportVision: true,
    rateLimitPerMinute: 60,
    costPerMillionInputTokens: {
      'gemini-2.5-pro': 2.5,
      'gemini-2.5-flash': 0.075,
      'gemini-pro': 0.5,
    },
    costPerMillionOutputTokens: {
      'gemini-2.5-pro': 10,
      'gemini-2.5-flash': 0.3,
      'gemini-pro': 1.5,
    },
  },
  xai: {
    name: 'XAI',
    models: ['grok-3', 'grok-3-mini'],
    maxTokens: 131072,
    supportStreaming: true,
    supportTools: true,
    supportVision: false,
    rateLimitPerMinute: 100,
    costPerMillionInputTokens: {
      'grok-3': 2,
      'grok-3-mini': 0.5,
    },
    costPerMillionOutputTokens: {
      'grok-3': 10,
      'grok-3-mini': 1.5,
    },
  },
  openrouter: {
    name: 'OpenRouter',
    models: [
      'meta-llama/llama-3.2-3b-instruct:free',
      'openrouter/pony-alpha',
      'nousresearch/hermes-3-llama-3.1-405b:free',
      'stepfun/step-3.5-flash:free',
      'arcee-ai/trinity-large-preview:free',
    ],
    maxTokens: 131072,
    supportStreaming: true,
    supportTools: true,
    supportVision: false,
    rateLimitPerMinute: 200,
    costPerMillionInputTokens: {
      'meta-llama/llama-3.2-3b-instruct:free': 0,
      'openrouter/pony-alpha': 0,
      'nousresearch/hermes-3-llama-3.1-405b:free': 0,
      'stepfun/step-3.5-flash:free': 0,
      'arcee-ai/trinity-large-preview:free': 0,
    },
    costPerMillionOutputTokens: {
      'meta-llama/llama-3.2-3b-instruct:free': 0,
      'openrouter/pony-alpha': 0,
      'nousresearch/hermes-3-llama-3.1-405b:free': 0,
      'stepfun/step-3.5-flash:free': 0,
      'arcee-ai/trinity-large-preview:free': 0,
    },
  },
};

/**
 * Provider abstraction layer
 */
export class ProviderAbstraction {
  /**
   * Get capabilities for a provider
   */
  static getCapabilities(provider: LLMProvider): ProviderCapabilities {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return config;
  }

  /**
   * Get all supported models
   */
  static getSupportedModels(): string[] {
    const models: string[] = [];
    for (const config of Object.values(PROVIDER_CONFIGS)) {
      models.push(...config.models);
    }
    return models;
  }

  /**
   * Get models for a specific provider
   */
  static getModelsForProvider(provider: LLMProvider): string[] {
    return PROVIDER_CONFIGS[provider]?.models || [];
  }

  /**
   * Get provider for a model
   */
  static getProvider(model: string): LLMProvider {
    for (const [provider, config] of Object.entries(PROVIDER_CONFIGS)) {
      if (config.models.includes(model)) {
        return provider as LLMProvider;
      }
    }
    throw new Error(`Unknown model: ${model}`);
  }

  /**
   * Get constraints for a provider
   */
  static getConstraints(provider: LLMProvider): ProviderConstraints {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return {
      maxContextLength: config.maxTokens,
      maxRequestsPerMinute: config.rateLimitPerMinute,
      supportedParameters: this.getSupportedParameters(provider),
    };
  }

  /**
   * Get supported parameters for a provider
   */
  private static getSupportedParameters(provider: LLMProvider): string[] {
    const commonParams = ['temperature', 'top_p', 'max_tokens', 'timeout'];
    const providerSpecific: Record<LLMProvider, string[]> = {
      anthropic: [...commonParams, 'top_k', 'system'],
      openai: [...commonParams, 'frequency_penalty', 'presence_penalty'],
      google: [...commonParams, 'top_k'],
      xai: [...commonParams, 'top_k'],
      openrouter: [...commonParams, 'frequency_penalty', 'presence_penalty', 'top_k'],
    };
    return providerSpecific[provider] || commonParams;
  }

  /**
   * Check if provider supports a feature
   */
  static supportsFeature(
    provider: LLMProvider,
    feature: 'streaming' | 'tools' | 'vision'
  ): boolean {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) return false;

    switch (feature) {
      case 'streaming':
        return config.supportStreaming;
      case 'tools':
        return config.supportTools;
      case 'vision':
        return config.supportVision;
      default:
        return false;
    }
  }

  /**
   * Get cost estimate for a model
   */
  static estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const provider = this.getProvider(model);
    const config = PROVIDER_CONFIGS[provider];

    const inputCost =
      ((config.costPerMillionInputTokens[model] || 0) / 1_000_000) *
      inputTokens;
    const outputCost =
      ((config.costPerMillionOutputTokens[model] || 0) / 1_000_000) *
      outputTokens;

    return inputCost + outputCost;
  }

  /**
   * Rank providers by cost (cheapest first)
   */
  static rankProvidersBySpeed(
    models: string[]
  ): Array<{ model: string; provider: LLMProvider; rank: number }> {
    const rankings = models.map((model) => {
      const provider = this.getProvider(model);
      const config = PROVIDER_CONFIGS[provider];
      
      // Simple speed heuristic: context length / processing overhead
      // Larger context = typically faster for same query
      const speedRank = config.maxTokens / 100000;

      return { model, provider, rank: speedRank };
    });

    return rankings.sort((a, b) => b.rank - a.rank);
  }

  /**
   * Find best model for use case
   */
  static findBestModel(options: {
    provider?: LLMProvider;
    needsStreaming?: boolean;
    needsTools?: boolean;
    needsVision?: boolean;
    maxCost?: number;
    minContextLength?: number;
  }): string | null {
    let candidates = Object.entries(PROVIDER_CONFIGS);

    // Filter by provider if specified
    if (options.provider) {
      candidates = candidates.filter(([p]) => p === options.provider);
    }

    // Filter by features
    for (const [provider, config] of candidates) {
      if (
        options.needsStreaming &&
        !config.supportStreaming
      )
        continue;
      if (options.needsTools && !config.supportTools) continue;
      if (options.needsVision && !config.supportVision) continue;

      // Return first model from matching provider
      return config.models[0];
    }

    return null;
  }

  /**
   * Get provider health status (placeholder for monitoring)
   */
  static getProviderStatus(provider: LLMProvider): {
    status: 'operational' | 'degraded' | 'down';
    latency: number;
  } {
    // In production, this would check actual API status
    return {
      status: 'operational',
      latency: 100,
    };
  }
}

/**
 * Convenience function for provider lookup
 */
export function getProvider(model: string): LLMProvider {
  return ProviderAbstraction.getProvider(model);
}

/**
 * Convenience function for provider capabilities
 */
export function getProviderCapabilities(provider: LLMProvider): ProviderCapabilities {
  return ProviderAbstraction.getCapabilities(provider);
}
