/**
 * Token Extractor
 * 
 * Extracts token usage from HUD statusline or API responses
 */

import { logger } from '../utils/logger.js';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface EstimatedTokenUsage extends TokenUsage {
  estimatedOutput: boolean;
}

/**
 * Model-specific output token estimation ratios
 */
const OUTPUT_ESTIMATION_RATIOS: Record<string, number> = {
  // OpenRouter free models
  'meta-llama/llama-3.2-3b-instruct:free': 0.30,
  'openrouter/pony-alpha': 0.35,
  'nousresearch/hermes-3-llama-3.1-405b:free': 0.40,
  'stepfun/step-3.5-flash:free': 0.35,
  'arcee-ai/trinity-large-preview:free': 0.40,
  'deepseek/deepseek-r1-0528:free': 0.50,
  'tngtech/deepseek-r1t2-chimera:free': 0.45,
  'nvidia/nemotron-3-nano-30b-a3b:free': 0.35,
  'z-ai/glm-4.5-air:free': 0.40,
};

/**
 * Extract token usage from API response
 */
export function extractTokensFromResponse(response: any): TokenUsage | null {
  try {
    // Anthropic format
    if (response.usage) {
      return {
        inputTokens: response.usage.input_tokens || 0,
        outputTokens: response.usage.output_tokens || 0,
        cacheReadTokens: response.usage.cache_read_input_tokens,
        cacheWriteTokens: response.usage.cache_creation_input_tokens,
      };
    }

    // OpenAI format
    if (response.usage?.prompt_tokens) {
      return {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
      };
    }

    return null;
  } catch (error) {
    logger.error('[TokenExtractor] Failed to extract tokens', error);
    return null;
  }
}

/**
 * Estimate output tokens based on input tokens and model
 */
export function estimateOutputTokens(
  inputTokens: number,
  model: string
): EstimatedTokenUsage {
  const ratio = OUTPUT_ESTIMATION_RATIOS[model] || 0.40; // Default to 40%
  const estimatedOutput = Math.round(inputTokens * ratio);

  return {
    inputTokens,
    outputTokens: estimatedOutput,
    estimatedOutput: true,
  };
}

/**
 * Parse HUD statusline for token information
 * Format: "tokens: 1234" or "in: 1234 out: 567"
 */
export function extractTokensFromHUD(hudLine: string): Partial<TokenUsage> | null {
  try {
    // Pattern 1: "tokens: 1234"
    const totalMatch = hudLine.match(/tokens:\s*(\d+)/i);
    if (totalMatch) {
      return {
        inputTokens: parseInt(totalMatch[1], 10),
      };
    }

    // Pattern 2: "in: 1234 out: 567"
    const inOutMatch = hudLine.match(/in:\s*(\d+)\s+out:\s*(\d+)/i);
    if (inOutMatch) {
      return {
        inputTokens: parseInt(inOutMatch[1], 10),
        outputTokens: parseInt(inOutMatch[2], 10),
      };
    }

    // Pattern 3: "input: 1234 output: 567"
    const inputOutputMatch = hudLine.match(/input:\s*(\d+)\s+output:\s*(\d+)/i);
    if (inputOutputMatch) {
      return {
        inputTokens: parseInt(inputOutputMatch[1], 10),
        outputTokens: parseInt(inputOutputMatch[2], 10),
      };
    }

    return null;
  } catch (error) {
    logger.error('[TokenExtractor] Failed to parse HUD line', error);
    return null;
  }
}

/**
 * Calculate delta between two token usages
 */
export function calculateTokenDelta(
  current: TokenUsage,
  previous: TokenUsage
): TokenUsage {
  return {
    inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
    outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
    cacheReadTokens: current.cacheReadTokens && previous.cacheReadTokens
      ? Math.max(0, current.cacheReadTokens - previous.cacheReadTokens)
      : current.cacheReadTokens,
    cacheWriteTokens: current.cacheWriteTokens && previous.cacheWriteTokens
      ? Math.max(0, current.cacheWriteTokens - previous.cacheWriteTokens)
      : current.cacheWriteTokens,
  };
}

/**
 * Combine actual and estimated token usage
 * Prefers actual values when available
 */
export function combineTokenUsage(
  actual: Partial<TokenUsage>,
  estimated: EstimatedTokenUsage,
  model: string
): EstimatedTokenUsage {
  // If we have actual output tokens, use them
  if (actual.outputTokens !== undefined) {
    return {
      inputTokens: actual.inputTokens || estimated.inputTokens,
      outputTokens: actual.outputTokens,
      cacheReadTokens: actual.cacheReadTokens,
      cacheWriteTokens: actual.cacheWriteTokens,
      estimatedOutput: false,
    };
  }

  // Otherwise use estimation
  return {
    ...estimated,
    cacheReadTokens: actual.cacheReadTokens,
    cacheWriteTokens: actual.cacheWriteTokens,
  };
}
