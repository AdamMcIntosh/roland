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
      xai: {
        simple: ['grok-3-mini', 'grok-code-fast-1'],
        medium: ['grok-3', 'grok-4-1-fast-non-reasoning'],
        complex: ['grok-4-1-fast-reasoning', 'grok-4-0709'],
      },
      openai: {
        simple: ['gpt-4o-mini'],
        medium: ['gpt-4o'],
        complex: ['gpt-4-turbo', 'gpt-5'],
      },
      google: {
        simple: ['gemini-2.5-flash'],
        medium: ['gemini-2.5-pro'],
        complex: ['gemini-pro-latest'],
      },
      anthropic: {
        simple: ['claude-haiku-4-5-20251001'],
        medium: ['claude-sonnet-4-5-20250929'],
        complex: ['claude-opus-4-5-20251101'],
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

    const apiKey = config.samwise.api_keys[provider];
    
    // Debug logging
    logger.debug(`[LLM] Provider: ${provider}, API key present: ${!!apiKey}, key length: ${apiKey?.length || 0}`);
    
    if (!apiKey) {
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
    maxTokens: number,
    systemPrompt?: string
  ): Promise<LLMToolResponse> {
    const formattedTools = this.formatToolsForProvider('anthropic', tools);

    // Format messages for Anthropic API
    // Anthropic requires:
    //   - tool_result messages to have role='user' with content=[{type:'tool_result', tool_use_id, content}]
    //   - assistant messages with tool calls to include tool_use content blocks
    const formattedMessages = messages.map(msg => {
      if (msg.role === 'tool_result') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: msg.toolUseId || 'unknown',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          }],
        };
      }
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        return {
          role: 'assistant' as const,
          content: msg.content,
        };
      }
      return {
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content,
      };
    });

    // Merge consecutive user messages (Anthropic doesn't allow them)
    const mergedMessages: Array<{ role: string; content: any }> = [];
    for (const msg of formattedMessages) {
      const prev = mergedMessages[mergedMessages.length - 1];
      if (prev && prev.role === 'user' && msg.role === 'user') {
        // Merge content arrays/strings
        const prevContent = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content as string }];
        const msgContent = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content as string }];
        prev.content = [...prevContent, ...msgContent];
      } else {
        mergedMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      tools: formattedTools,
      messages: mergedMessages,
    };

    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

    logger.debug(`[LLM] Anthropic request: model=${model}, messages=${mergedMessages.length}, system=${systemPrompt ? 'yes (' + systemPrompt.length + ' chars)' : 'no'}`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errBody}`);
    }

    const data = (await response.json()) as any;

    logger.debug(`[LLM] Anthropic response: stop_reason=${data.stop_reason}, content_blocks=${data.content?.length}, usage=${JSON.stringify(data.usage)}`);

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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
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
    maxTokens: number,
    systemPrompt?: string
  ): Promise<LLMToolResponse> {
    if (provider === 'anthropic') {
      return this.callAnthropicWithTools(model, apiKey, messages, tools, temperature, maxTokens, systemPrompt);
    } else if (provider === 'openai') {
      return this.callOpenAIWithTools(model, apiKey, messages, tools, temperature, maxTokens, systemPrompt);
    } else {
      throw new Error(`Tool calling not yet supported for provider: ${provider}`);
    }
  }
}
