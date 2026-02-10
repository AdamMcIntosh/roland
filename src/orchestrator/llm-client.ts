/**
 * LLM Client - Unified API for calling LLM models
 * 
 * Phase 8: Real API integration via OpenRouter
 * Supports automatic fallback, retry logic, error handling, and tool calling
 */

import { getConfig } from '../config/config-loader.js';
import { logger } from '../utils/logger.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { rateLimitHandler } from '../utils/rate-limit-handler.js';
import {
  ApiError,
  ApiAuthenticationError,
  ApiRateLimitError,
} from '../utils/errors.js';
import type { ToolDefinition, Message, LLMToolResponse, ContentBlock } from '../agent-loop/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

export interface LLMCallOptions {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  retries?: number;
  fallbackModels?: string[];
  _isRetry?: boolean; // Internal flag to prevent infinite recursion
}

export interface LLMResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cached: boolean;
}

/**
 * Unified LLM Client for all providers
 */
export class LLMClient {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_RETRIES = 2;
  private static readonly BASE_RETRY_DELAY = 1000; // 1 second

  /**
   * Determine the complexity tier of a model
   */
  private static getModelTier(model: string): 'simple' | 'medium' | 'complex' {
    // Simple tier: fast, cheap models
    if (model.includes('mini') || model.includes('flash') || model.includes('fast-non-reasoning')) {
      return 'simple';
    }
    // Complex tier: powerful reasoning models
    if (model.includes('opus') || model.includes('reasoning') || model.includes('pro') || model.includes('5')) {
      return 'complex';
    }
    // Medium tier: balanced models
    return 'medium';
  }

  /**
   * Get available models for a tier from all providers
   */
  private static getModelsForTier(tier: 'simple' | 'medium' | 'complex', apiKeys: Record<string, string>): Map<string, string> {
    const tierModels = new Map<string, string>(); // model -> provider

    // Define tier-specific models for each provider
    const tierMapping: Record<string, Record<'simple' | 'medium' | 'complex', string[]>> = {
      openrouter: {
        simple: ['meta-llama/llama-3.2-3b-instruct:free', 'openrouter/pony-alpha'],
        medium: ['stepfun/step-3.5-flash:free', 'arcee-ai/trinity-large-preview:free'],
        complex: ['nousresearch/hermes-3-llama-3.1-405b:free', 'deepseek/deepseek-r1-0528:free'],
      },
    };

    // Collect models from available providers
    for (const [provider, models] of Object.entries(tierMapping)) {
      if (apiKeys[provider]) {
        const tierModelsForProvider = models[tier];
        for (const model of tierModelsForProvider) {
          tierModels.set(model, provider);
        }
      }
    }

    return tierModels;
  }

  /**
   * Generate fallback models based on the current model tier
   * Returns alternative models from the same tier, then other providers
   */
  private static generateFallbackModels(model: string, apiKeys: Record<string, string>): string[] {
    const currentProvider = this.getProvider(model);
    const currentTier = this.getModelTier(model);
    const fallbacks: string[] = [];

    logger.debug(`[LLM] Generating fallbacks for ${model} (${currentTier} tier, ${currentProvider} provider)`);

    // Get all models in the same tier from all providers
    const tierModels = this.getModelsForTier(currentTier, apiKeys);

    // First, try other models from the same provider in same tier
    for (const [tierModel, tierProvider] of tierModels.entries()) {
      if (tierModel !== model && tierProvider === currentProvider) {
        fallbacks.push(tierModel);
        logger.debug(`[LLM] Fallback: ${tierModel} (same provider, same tier)`);
      }
    }

    // Then, try models from other providers in same tier
    for (const [tierModel, tierProvider] of tierModels.entries()) {
      if (tierModel !== model && tierProvider !== currentProvider) {
        fallbacks.push(tierModel);
        logger.debug(`[LLM] Fallback: ${tierModel} (different provider, same tier)`);
      }
    }

    // If we only have complex tier, also offer medium tier fallbacks
    if (currentTier === 'complex' && fallbacks.length < 2) {
      const mediumTierModels = this.getModelsForTier('medium', apiKeys);
      for (const [tierModel, tierProvider] of mediumTierModels.entries()) {
        if (!fallbacks.includes(tierModel)) {
          fallbacks.push(tierModel);
          logger.debug(`[LLM] Fallback: ${tierModel} (same provider, lower tier)`);
        }
      }
    }

    logger.debug(`[LLM] Total fallbacks available: ${fallbacks.length}`);
    return fallbacks;
  }

  /**
   * Call an LLM with automatic provider routing
   * 
   * @param options - LLM call options
   * @returns LLM response
   */
  static async call(options: LLMCallOptions): Promise<LLMResponse> {
    const {
      model,
      prompt,
      temperature = 0.7,
      maxTokens = 2000,
      systemPrompt = '',
      retries = this.DEFAULT_RETRIES,
      fallbackModels = [],
      _isRetry = false,
    } = options;

    const provider = this.getProvider(model);
    const config = getConfig();

    if (!config) {
      throw new ApiError('Configuration not loaded');
    }

    // Prefer live env var over cached config (handles interactive apikeys set)
    const envKey = `SAMWISE_API_KEYS_${provider.toUpperCase()}`;
    const apiKey = process.env[envKey] || config.samwise.api_keys[provider];
    
    // Treat placeholder/dummy values as missing keys
    const isPlaceholder = apiKey && /^(YOUR_|CHANGE_ME|sk-xxx|placeholder)/i.test(apiKey);
    
    // Debug logging
    logger.debug(`[LLM] Provider: ${provider}, API key present: ${!!apiKey}, key length: ${apiKey?.length || 0}${isPlaceholder ? ' (placeholder!)' : ''}`);
    
    if (!apiKey || isPlaceholder) {
      // No API key - try fallback models from other providers (only if not already retrying)
      if (!_isRetry) {
        logger.warn(`[LLM] No API key for ${provider}, trying fallbacks in same tier...`);
        const apiKeysObj = config.samwise.api_keys as Record<string, string>;
        const autoFallbacks = this.generateFallbackModels(model, apiKeysObj);
        for (const fallback of autoFallbacks.slice(0, 3)) {
          const fallbackProvider = this.getProvider(fallback);
          if (apiKeysObj[fallbackProvider]) {
            logger.info(`[LLM] Using tier-matched fallback: ${fallback} (${fallbackProvider})`);
            return this.call({
              model: fallback,
              prompt,
              temperature,
              maxTokens,
              systemPrompt,
              retries: 0,
              _isRetry: true,
            });
          }
        }
      }
      throw new ApiAuthenticationError(
        `Missing API key for ${provider}. Set SAMWISE_API_KEYS_${provider.toUpperCase()}`
      );
    }

    let lastError: Error | null = null;
    const attemptNumber = this.DEFAULT_RETRIES - retries + 1;

    try {
      // Check budget before making API call
      const estimatedCost = this.estimateCost(model, prompt, maxTokens);
      BudgetManager.checkBudget(estimatedCost);

      logger.debug(`[LLM] Calling ${provider} model: ${model} (attempt ${attemptNumber})`);

      // Direct API call — no rate-limit-handler wrapper here.
      // Fallback/retry logic below handles rate limits intelligently.
      const response = await this.callProvider(
        provider,
        model,
        apiKey,
        prompt,
        systemPrompt,
        temperature,
        maxTokens
      );

      // Record actual spending
      const actualCost = this.calculateActualCost(model, response.totalTokens);
      BudgetManager.recordSpending(actualCost);

      logger.debug(
        `[LLM] Success: ${response.totalTokens} tokens used (${response.inputTokens} input, ${response.outputTokens} output)`
      );

      return response;
    } catch (error) {
      lastError = error as Error;

      // Log the error with appropriate level
      if (error instanceof ApiRateLimitError) {
        logger.warn(`[LLM] Rate limited on ${model}`);
      } else if (error instanceof ApiAuthenticationError) {
        logger.warn(`[LLM] Authentication failed for ${model}`);
      } else if (error instanceof ApiError) {
        logger.warn(`[LLM] API error on ${model}: ${error.message}`);
      } else {
        logger.error(`[LLM] Unexpected error: ${error}`);
      }

      // ----- Rate limit: try fallback models IMMEDIATELY before any waiting -----
      if (error instanceof ApiRateLimitError && !_isRetry) {
        // 1) Try explicit fallback models
        if (fallbackModels.length > 0) {
          logger.info(`[LLM] Rate limited — trying explicit fallbacks: ${fallbackModels.join(', ')}`);
          for (const fallbackModel of fallbackModels) {
            try {
              return await this.call({
                model: fallbackModel,
                prompt,
                temperature,
                maxTokens,
                systemPrompt,
                retries: 0,
                _isRetry: true,
              });
            } catch (fallbackError) {
              logger.warn(`[LLM] Fallback ${fallbackModel} also failed, trying next...`);
            }
          }
        }

        // 2) Try auto-generated fallback models (other free models)
        const apiKeysObj = config.samwise.api_keys as Record<string, string>;
        const autoFallbacks = this.generateFallbackModels(model, apiKeysObj);
        if (autoFallbacks.length > 0) {
          logger.info(`[LLM] Rate limited — trying ${autoFallbacks.length} alternative models before waiting`);
          for (const fallbackModel of autoFallbacks.slice(0, 5)) {
            const fallbackProvider = this.getProvider(fallbackModel);
            if (apiKeysObj[fallbackProvider]) {
              try {
                logger.info(`[LLM] Trying alternative: ${fallbackModel}`);
                return await this.call({
                  model: fallbackModel,
                  prompt,
                  temperature,
                  maxTokens,
                  systemPrompt,
                  retries: 0,
                  _isRetry: true,
                });
              } catch (fallbackError) {
                logger.warn(`[LLM] Alternative ${fallbackModel} failed: ${(fallbackError as Error).message}`);
              }
            }
          }
        }

        // 3) All alternatives exhausted — wait and retry original model as last resort
        logger.info(`[LLM] All alternative models exhausted, waiting before retrying ${model}`);
        const result = await rateLimitHandler.executeWithRetry(
          () => this.callProvider(provider, model, apiKey, prompt, systemPrompt, temperature, maxTokens),
          `LLM call to ${model}`
        );
        const actualCost = this.calculateActualCost(model, result.totalTokens);
        BudgetManager.recordSpending(actualCost);
        return result;
      }

      // ----- Non-rate-limit errors: retry with backoff -----
      if (retries > 0 && !(error instanceof ApiAuthenticationError) && !_isRetry) {
        const delay = this.BASE_RETRY_DELAY * Math.pow(2, attemptNumber - 1);
        logger.info(`[LLM] Retrying ${model} in ${delay}ms (${retries} retries left)...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.call({
          model,
          prompt,
          temperature,
          maxTokens,
          systemPrompt,
          retries: retries - 1,
          fallbackModels,
          _isRetry: true,
        });
      }

      // Try explicit fallback models (non-rate-limit path)
      if (fallbackModels.length > 0 && !_isRetry) {
        logger.info(`[LLM] Attempting explicit fallback models: ${fallbackModels.join(', ')}`);
        for (const fallbackModel of fallbackModels) {
          try {
            return await this.call({
              model: fallbackModel,
              prompt,
              temperature,
              maxTokens,
              systemPrompt,
              retries: 0,
              _isRetry: true,
            });
          } catch (fallbackError) {
            logger.warn(`[LLM] Fallback ${fallbackModel} failed, trying next...`);
          }
        }
      }

      // Try auto-generated fallback models (non-rate-limit path)
      if (!_isRetry) {
        const apiKeysObj = config.samwise.api_keys as Record<string, string>;
        const autoFallbacks = this.generateFallbackModels(model, apiKeysObj);
        if (autoFallbacks.length > 0) {
          logger.info(`[LLM] Attempting ${autoFallbacks.length} tier-matched fallbacks for ${model}`);
          for (const fallbackModel of autoFallbacks.slice(0, 3)) {
            const fallbackProvider = this.getProvider(fallbackModel);
            if (apiKeysObj[fallbackProvider]) {
              try {
                logger.info(`[LLM] Trying fallback: ${fallbackModel} (${fallbackProvider})`);
                return await this.call({
                  model: fallbackModel,
                  prompt,
                  temperature,
                  maxTokens,
                  systemPrompt,
                  retries: 0,
                  _isRetry: true,
                });
              } catch (fallbackError) {
                logger.warn(`[LLM] Fallback ${fallbackModel} failed: ${(fallbackError as Error).message}`);
              }
            }
          }
        }
      }

      // All attempts failed
      throw lastError;
    }
  }

  /**
   * Call a specific provider
   */
  private static async callProvider(
    provider: 'openrouter',
    model: string,
    apiKey: string,
    prompt: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    switch (provider) {
      case 'openrouter':
        return this.callOpenRouter(model, apiKey, prompt, systemPrompt, temperature, maxTokens);
      default:
        throw new ApiError(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call OpenRouter API (OpenAI-compatible)
   */
  private static async callOpenRouter(
    model: string,
    apiKey: string,
    prompt: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/yourusername/samwise', // Optional: for rankings
        'X-Title': 'Samwise', // Optional: for rankings
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      await this.handleAPIError(response, 'OpenRouter');
    }

    const data = (await response.json()) as AnyRecord;

    return {
      content: data.choices[0].message.content as string,
      model,
      inputTokens: data.usage.prompt_tokens as number,
      outputTokens: data.usage.completion_tokens as number,
      totalTokens: data.usage.total_tokens as number,
      cached: false,
    };
  }

  /**
   * Handle API errors with appropriate exception types
   */
  private static async handleAPIError(response: Response, provider: string): Promise<never> {
    const errorData = (await response.json().catch(() => ({}))) as AnyRecord;
    
    // Debug: log full error response
    logger.debug(`[LLM] API Error Details: ${JSON.stringify(errorData)}`);

    // Extract the human-readable message from nested error objects
    const errorMessage: string =
      (errorData.error?.message as string) ||
      (typeof errorData.error === 'string' ? errorData.error : null) ||
      (errorData.message as string) ||
      response.statusText;

    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthenticationError(
        `${provider} authentication failed: ${errorMessage}`
      );
    }

    // 429 = standard rate limit, 402 = OpenRouter free-tier quota exhausted
    if (response.status === 429 || response.status === 402) {
      throw new ApiRateLimitError(
        `${provider} rate limit exceeded: ${errorMessage}`
      );
    }

    throw new ApiError(
      `${provider} API error (${response.status}): ${errorMessage}`
    );
  }

  /**
   * Get provider from model name
   */
  public static getProvider(model: string): 'openrouter' {
    // OpenRouter models use provider/model format or have ':free' suffix
    if (model.includes('/') || model.includes(':free')) return 'openrouter';
    // All models go through OpenRouter
    return 'openrouter';
  }

  /**
   * Estimate cost before API call (rough approximation)
   */
  public static estimateCost(model: string, prompt: string, maxTokens: number): number {
    // Rough token estimation: ~4 chars per token
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedTotalTokens = estimatedInputTokens + maxTokens;

    const costPer1k: Record<string, number> = {
      // OpenRouter free tier models
      'meta-llama/llama-3.2-3b-instruct:free': 0,
      'openrouter/pony-alpha': 0,
      'nousresearch/hermes-3-llama-3.1-405b:free': 0,
      'stepfun/step-3.5-flash:free': 0,
      'arcee-ai/trinity-large-preview:free': 0,
      'deepseek/deepseek-r1-0528:free': 0,
      'tngtech/deepseek-r1t2-chimera:free': 0,
      'nvidia/nemotron-3-nano-30b-a3b:free': 0,
      'z-ai/glm-4.5-air:free': 0,
    };

    const cost = (costPer1k[model] || 0) * (estimatedTotalTokens / 1000);
    return cost;
  }

  /**
   * Calculate actual cost based on token usage
   */
  private static calculateActualCost(model: string, totalTokens: number): number {
    const costPer1k: Record<string, number> = {
      // OpenRouter free tier models
      'meta-llama/llama-3.2-3b-instruct:free': 0,
      'openrouter/pony-alpha': 0,
      'nousresearch/hermes-3-llama-3.1-405b:free': 0,
      'stepfun/step-3.5-flash:free': 0,
      'arcee-ai/trinity-large-preview:free': 0,
      'deepseek/deepseek-r1-0528:free': 0,
      'tngtech/deepseek-r1t2-chimera:free': 0,
      'nvidia/nemotron-3-nano-30b-a3b:free': 0,
      'z-ai/glm-4.5-air:free': 0,
    };

    return (costPer1k[model] || 0) * (totalTokens / 1000);
  }
}

/**
 * Tool Calling Support for Agent Loop
 */
export interface ToolCallingOptions {
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * Extended LLM Client with tool calling capabilities
 */
export class LLMClientWithTools {
  /**
   * Call LLM with tool definitions for agent loop
   */
  static async callWithTools(options: ToolCallingOptions): Promise<LLMToolResponse> {
    const {
      model,
      messages,
      tools,
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt,
    } = options;

    const provider = LLMClient.getProvider(model);
    const config = getConfig();

    if (!config) {
      throw new ApiError('Configuration not loaded');
    }

    const apiKey = config.samwise.api_keys[provider];
    if (!apiKey) {
      throw new ApiAuthenticationError(
        `Missing API key for ${provider}. Set SAMWISE_API_KEYS_${provider.toUpperCase()}`
      );
    }

    // Check budget
    const estimatedCost = LLMClient.estimateCost(model, '', maxTokens);
    BudgetManager.checkBudget(estimatedCost);

    logger.debug(`[LLM] Calling ${provider} with tools (${tools.length} available)`);

    try {
      const response = await this.callProviderWithTools(
        provider,
        model,
        apiKey,
        messages,
        tools,
        temperature,
        maxTokens,
        systemPrompt
      );

      // Record spending
      BudgetManager.recordSpending(estimatedCost);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[LLM] Tool calling failed: ${message}`);
      throw error;
    }
  }

  /**
   * Convert tool definitions to provider format
   */
  private static formatToolsForProvider(
    provider: string,
    tools: ToolDefinition[]
  ): Record<string, unknown>[] {
    // OpenAI-compatible format (used by OpenRouter)
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Call OpenAI with tools
   */
  private static async callOpenAIWithTools(
    model: string,
    apiKey: string,
    messages: Message[],
    tools: ToolDefinition[],
    temperature: number,
    maxTokens: number,
    systemPrompt?: string
  ): Promise<LLMToolResponse> {
    const formattedTools = this.formatToolsForProvider('openai', tools);

    const openaiMessages: Array<Record<string, unknown>> = [];
    if (systemPrompt) {
      openaiMessages.push({ role: 'system', content: systemPrompt });
    }
    openaiMessages.push(...messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content,
    })));

    // Determine if this is OpenRouter based on model name
    const isOpenRouter = model.includes('/') || model.includes(':free');
    const baseUrl = isOpenRouter 
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    // Add OpenRouter-specific headers
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://github.com/yourusername/samwise';
      headers['X-Title'] = 'Samwise';
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        tools: formattedTools,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const providerName = isOpenRouter ? 'OpenRouter' : 'OpenAI';
      throw new Error(`${providerName} API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const choice = data.choices[0];

    return {
      stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      content: choice.message.tool_calls || [{ type: 'text', text: choice.message.content }],
      model,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
    };
  }

  /**
   * Generic provider dispatcher for tool calling
   */
  private static async callProviderWithTools(
    provider: string,
    model: string,
    apiKey: string,
    messages: Message[],
    tools: ToolDefinition[],
    temperature: number,
    maxTokens: number,
    systemPrompt?: string
  ): Promise<LLMToolResponse> {
    if (provider === 'openrouter') {
      // OpenRouter uses OpenAI-compatible API
      return this.callOpenAIWithTools(model, apiKey, messages, tools, temperature, maxTokens, systemPrompt);
    } else {
      throw new Error(`Tool calling not yet supported for provider: ${provider}`);
    }
  }
}
