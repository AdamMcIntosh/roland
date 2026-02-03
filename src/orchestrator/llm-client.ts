/**
 * LLM Client - Unified API for calling LLM models
 * 
 * Phase 8: Real API integration for xAI, Anthropic, OpenAI, Google
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
   * Generate fallback models based on the current model
   * Returns cheaper/alternative models from the same or lower complexity tier
   */
  private static generateFallbackModels(model: string, complexity: 'simple' | 'medium' | 'complex'): string[] {
    const provider = this.getProvider(model);
    const fallbacks: string[] = [];

    // Try same provider, different tier
    if (provider === 'anthropic') {
      if (model === 'claude-4.5-sonnet') fallbacks.push('claude-4-sonnet');
    } else if (provider === 'openai') {
      if (model === 'gpt-4o') fallbacks.push('gpt-4o-mini');
    } else if (provider === 'google') {
      if (model === 'gemini-2.5-pro') fallbacks.push('gemini-2.5-flash');
    } else if (provider === 'xai') {
      if (model === 'grok-4.1-full') fallbacks.push('grok-4-1-fast-reasoning');
    }

    // Try cheapest models from other providers
    if (complexity === 'complex' || complexity === 'medium') {
      fallbacks.push('grok-4-1-fast-reasoning', 'gemini-2.5-flash', 'gpt-4o-mini');
    } else {
      fallbacks.push('grok-4-1-fast-reasoning', 'gemini-2.5-flash');
    }

    // Remove duplicates and the original model
    return [...new Set(fallbacks)].filter(m => m !== model);
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

    const apiKey = config.goose.api_keys[provider];
    if (!apiKey) {
      // No API key - try fallback models from other providers (only if not already retrying)
      if (!_isRetry) {
        logger.warn(`[LLM] No API key for ${provider}, trying fallbacks...`);
        const autoFallbacks = this.generateFallbackModels(model, 'medium');
        for (const fallback of autoFallbacks.slice(0, 2)) {
          const fallbackProvider = this.getProvider(fallback);
          if (config.goose.api_keys[fallbackProvider]) {
            logger.info(`[LLM] Using fallback model: ${fallback}`);
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

      // Wrap API call with rate limit handler
      const response = await rateLimitHandler.executeWithRetry(
        () => this.callProvider(
          provider,
          model,
          apiKey,
          prompt,
          systemPrompt,
          temperature,
          maxTokens
        ),
        `LLM call to ${model}`
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

      // Try retries with exponential backoff before fallbacks
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

      // Try explicit fallback models first (only if not already retrying)
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

      // Try auto-generated fallback models (only if not already retrying)
      if (!_isRetry) {
        const autoFallbacks = this.generateFallbackModels(model, 'medium');
        if (autoFallbacks.length > 0) {
          logger.info(`[LLM] Attempting auto-generated fallbacks: ${autoFallbacks.slice(0, 2).join(', ')}`);
          for (const fallbackModel of autoFallbacks.slice(0, 2)) {
            const fallbackProvider = this.getProvider(fallbackModel);
            if (config.goose.api_keys[fallbackProvider]) {
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
                logger.warn(`[LLM] Auto-fallback ${fallbackModel} failed`);
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
    provider: 'xai' | 'anthropic' | 'openai' | 'google',
    model: string,
    apiKey: string,
    prompt: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    switch (provider) {
      case 'xai':
        return this.callXAI(model, apiKey, prompt, systemPrompt, temperature, maxTokens);
      case 'anthropic':
        return this.callAnthropic(model, apiKey, prompt, systemPrompt, temperature, maxTokens);
      case 'openai':
        return this.callOpenAI(model, apiKey, prompt, systemPrompt, temperature, maxTokens);
      case 'google':
        return this.callGoogle(model, apiKey, prompt, systemPrompt, temperature, maxTokens);
      default:
        throw new ApiError(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call xAI (Grok) API
   */
  private static async callXAI(
    model: string,
    apiKey: string,
    prompt: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
      await this.handleAPIError(response, 'xAI');
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
   * Call Anthropic (Claude) API
   */
  private static async callAnthropic(
    model: string,
    apiKey: string,
    prompt: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature,
      }),
    });

    if (!response.ok) {
      await this.handleAPIError(response, 'Anthropic');
    }

    const data = (await response.json()) as AnyRecord;

    return {
      content: data.content[0].text as string,
      model,
      inputTokens: data.usage.input_tokens as number,
      outputTokens: data.usage.output_tokens as number,
      totalTokens: (data.usage.input_tokens as number) + (data.usage.output_tokens as number),
      cached: false,
    };
  }

  /**
   * Call OpenAI API
   */
  private static async callOpenAI(
    model: string,
    apiKey: string,
    prompt: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
      await this.handleAPIError(response, 'OpenAI');
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
   * Call Google Gemini API
   */
  private static async callGoogle(
    model: string,
    apiKey: string,
    prompt: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          ...(systemPrompt && {
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
          }),
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      await this.handleAPIError(response, 'Google');
    }

    const data = (await response.json()) as AnyRecord;
    const usageData = (data.usageMetadata || {}) as AnyRecord;

    return {
      content: data.candidates[0].content.parts[0].text as string,
      model,
      inputTokens: (usageData.promptTokenCount as number) || 0,
      outputTokens: (usageData.candidatesTokenCount as number) || 0,
      totalTokens: (usageData.totalTokenCount as number) || 0,
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

    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthenticationError(
        `${provider} authentication failed: ${(errorData.message as string) || response.statusText}`
      );
    }

    if (response.status === 429) {
      throw new ApiRateLimitError(
        `${provider} rate limit exceeded: ${(errorData.message as string) || response.statusText}`
      );
    }

    throw new ApiError(
      `${provider} API error (${response.status}): ${(errorData.message as string) || (errorData.error as string) || response.statusText}`
    );
  }

  /**
   * Get provider from model name
   */
  public static getProvider(model: string): 'xai' | 'anthropic' | 'openai' | 'google' {
    if (model.startsWith('grok-')) return 'xai';
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('gpt-')) return 'openai';
    if (model.startsWith('gemini-')) return 'google';
    throw new ApiError(`Unknown provider for model: ${model}`);
  }

  /**
   * Estimate cost before API call (rough approximation)
   */
  public static estimateCost(model: string, prompt: string, maxTokens: number): number {
    // Rough token estimation: ~4 chars per token
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedTotalTokens = estimatedInputTokens + maxTokens;

    // Cost per 1k tokens (very rough estimates)
    const costPer1k: Record<string, number> = {
      'grok-3-mini': 0.0005,
      'grok-3': 0.002,
      'claude-3-5-sonnet-20241022': 0.003,
      'claude-3-haiku-20240307': 0.00025,
      'gpt-4o': 0.0025,
      'gpt-4o-mini': 0.00015,
      'gemini-1.5-flash': 0.00007,
      'gemini-1.5-pro': 0.00125,
    };

    const cost = (costPer1k[model] || 0.001) * (estimatedTotalTokens / 1000);
    return cost;
  }

  /**
   * Calculate actual cost based on token usage
   */
  private static calculateActualCost(model: string, totalTokens: number): number {
    const costPer1k: Record<string, number> = {
      'grok-3-mini': 0.0005,
      'grok-3': 0.002,
      'claude-3-5-sonnet-20241022': 0.003,
      'claude-3-haiku-20240307': 0.00025,
      'gpt-4o': 0.0025,
      'gpt-4o-mini': 0.00015,
      'gemini-1.5-flash': 0.00007,
      'gemini-1.5-pro': 0.00125,
    };

    return (costPer1k[model] || 0.001) * (totalTokens / 1000);
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
    } = options;

    const provider = LLMClient.getProvider(model);
    const config = getConfig();

    if (!config) {
      throw new ApiError('Configuration not loaded');
    }

    const apiKey = config.goose.api_keys[provider];
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
        maxTokens
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
    if (provider === 'anthropic') {
      return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    }
    // OpenAI format
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
   * Call Anthropic with tools
   */
  private static async callAnthropicWithTools(
    model: string,
    apiKey: string,
    messages: Message[],
    tools: ToolDefinition[],
    temperature: number,
    maxTokens: number
  ): Promise<LLMToolResponse> {
    const formattedTools = this.formatToolsForProvider('anthropic', tools);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        tools: formattedTools,
        messages: messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : msg.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return {
      stop_reason: data.stop_reason as 'tool_use' | 'end_turn' | 'max_tokens',
      content: data.content as ContentBlock[],
      model,
      usage: {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      },
    };
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
    maxTokens: number
  ): Promise<LLMToolResponse> {
    const formattedTools = this.formatToolsForProvider('openai', tools);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : msg.content,
        })),
        tools: formattedTools,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
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
    maxTokens: number
  ): Promise<LLMToolResponse> {
    if (provider === 'anthropic') {
      return this.callAnthropicWithTools(model, apiKey, messages, tools, temperature, maxTokens);
    } else if (provider === 'openai') {
      return this.callOpenAIWithTools(model, apiKey, messages, tools, temperature, maxTokens);
    } else {
      throw new Error(`Tool calling not yet supported for provider: ${provider}`);
    }
  }
}
