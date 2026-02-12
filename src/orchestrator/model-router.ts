/**
 * Model Router — IDE Model Selection with Complexity Classification
 *
 * Analyzes query complexity and recommends the best IDE model (Cursor, VS Code).
 * This is purely advisory — Samwise returns the recommendation and the IDE picks
 * the model. No server-side LLM calls are made.
 */

import { getConfig } from '../config/config-loader.js';
import { ModelSelection, RoutingContext } from '../utils/types.js';
import { RoutingError } from '../utils/errors.js';
import { ComplexityClassifier } from './complexity-classifier.js';

/**
 * Estimated cost per million tokens for common IDE models.
 * Used for advisory cost estimates only — actual billing is through the IDE.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Cursor models
  'cursor-small':        { input: 0,    output: 0 },     // Included in subscription
  'gpt-4o-mini':         { input: 0.15, output: 0.60 },
  'gpt-4o':              { input: 2.50, output: 10.00 },
  'claude-3.5-sonnet':   { input: 3.00, output: 15.00 },
  'claude-3-opus':       { input: 15.00, output: 75.00 },
  'gemini-2.0-flash':    { input: 0,    output: 0 },
  'gemini-1.5-pro':      { input: 1.25, output: 5.00 },
  'grok-fast':           { input: 0.60, output: 0.60 },
  // Generic fallback
  'auto':                { input: 0,    output: 0 },
};

export class ModelRouter {
  /**
   * Analyze query complexity and suggest an IDE model.
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
   * Route query based on automatic complexity detection.
   * Returns recommended model + alternatives from config.
   */
  static routeByComplexity(
    query: string,
  ): { selected: ModelSelection; fallbacks: ModelSelection[]; analysis: ReturnType<typeof ComplexityClassifier.getDetailedAnalysis> } {
    const analysis = ComplexityClassifier.getDetailedAnalysis(query);

    const context: RoutingContext = {
      queryLength: query.length,
      complexity: analysis.complexity,
    };

    const routing = this.selectModelWithFallback(context);

    return {
      ...routing,
      analysis,
    };
  }

  /**
   * Select primary model + fallbacks for a complexity tier.
   */
  static selectModelWithFallback(
    context: RoutingContext,
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

    const selections: ModelSelection[] = models.map((model) => ({
      model,
      tier: complexity as 'simple' | 'medium' | 'complex' | 'explain',
      costPer1kTokens: this.estimateCostPer1k(model),
    }));

    const selected = selections[0];
    const fallbacks = selections.slice(1);

    return { selected, fallbacks };
  }

  /**
   * Get all configured models for a complexity level.
   */
  static getModelsForComplexity(
    complexity: 'simple' | 'medium' | 'explain' | 'complex'
  ): string[] {
    const config = getConfig();
    if (!config) return [];
    return config.routing[complexity] || [];
  }

  /**
   * Estimate cost per 1k tokens for a model.
   * Returns 0 for unknown models (IDE subscription covers them).
   */
  static estimateCostPer1k(model: string): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;
    return (pricing.input + pricing.output) / 2000; // Average per 1k tokens
  }

  /**
   * Estimate total cost for a query based on model and token count.
   */
  static estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0; // Unknown model — assume IDE subscription

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Generate a cost report for a model and token estimate.
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
    const pricing = MODEL_PRICING[model] || { input: 0, output: 0 };
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return {
      model,
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  }
}
