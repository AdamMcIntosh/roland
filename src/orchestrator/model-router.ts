/**
 * Model Router — IDE Model Selection with Complexity Classification
 *
 * Analyzes query complexity and recommends the best IDE model (Cursor, VS Code).
 * This is purely advisory — Roland returns the recommendation and the IDE picks
 * the model. No server-side LLM calls are made.
 */

import http from 'http';
import { getConfig } from '../config/config-loader.js';
import { ModelSelection, RoutingContext } from '../utils/types.js';
import { RoutingError } from '../utils/errors.js';
import { ComplexityClassifier } from './complexity-classifier.js';
import { getGlobalQualityTracker } from './quality-tracker.js';

// ============================================================================
// Ollama health check cache (module-level, shared across all ModelRouter calls)
// ============================================================================

interface OllamaHealthCache {
  available: boolean;
  models: string[];
  timestamp: number;
}

let _ollamaHealthCache: OllamaHealthCache | null = null;
const OLLAMA_CACHE_TTL_MS = 60_000; // 60 seconds

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
   * Check Ollama availability. Caches result for 60 seconds.
   * Uses Node's built-in http module (Ollama is always localhost HTTP).
   */
  static checkOllamaHealth(baseUrl: string): Promise<{ available: boolean; models: string[] }> {
    // Return cached result if fresh
    if (
      _ollamaHealthCache &&
      Date.now() - _ollamaHealthCache.timestamp < OLLAMA_CACHE_TTL_MS
    ) {
      return Promise.resolve({
        available: _ollamaHealthCache.available,
        models: _ollamaHealthCache.models,
      });
    }

    return new Promise((resolve) => {
      const url = new URL('/api/tags', baseUrl);
      const req = http.get(
        { hostname: url.hostname, port: url.port || 11434, path: url.pathname, timeout: 2000 },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body) as { models?: Array<{ name: string }> };
              const models = (parsed.models || []).map((m) => m.name);
              _ollamaHealthCache = { available: true, models, timestamp: Date.now() };
              resolve({ available: true, models });
            } catch {
              _ollamaHealthCache = { available: false, models: [], timestamp: Date.now() };
              resolve({ available: false, models: [] });
            }
          });
        }
      );
      req.on('error', () => {
        _ollamaHealthCache = { available: false, models: [], timestamp: Date.now() };
        resolve({ available: false, models: [] });
      });
      req.on('timeout', () => {
        req.destroy();
        _ollamaHealthCache = { available: false, models: [], timestamp: Date.now() };
        resolve({ available: false, models: [] });
      });
    });
  }

  /**
   * Route query based on automatic complexity detection.
   * Returns recommended model + alternatives from config.
   */
  static routeByComplexity(
    query: string,
  ): { selected: ModelSelection; fallbacks: ModelSelection[]; analysis: ReturnType<typeof ComplexityClassifier.getDetailedAnalysis> } {
    const analysis = ComplexityClassifier.getDetailedAnalysis(query);

    // If local tier, check if Ollama is enabled and available (sync fallback)
    let complexity = analysis.complexity;
    if (complexity === 'local') {
      const config = getConfig();
      if (!config?.ollama?.enabled) {
        complexity = (config?.ollama?.fallback_to ?? 'simple') as typeof complexity;
      }
    }

    const context: RoutingContext = {
      queryLength: query.length,
      complexity,
    };

    const routing = this.selectModelWithFallback(context);

    return {
      ...routing,
      analysis,
    };
  }

  /**
   * Select primary model + fallbacks for a complexity tier.
   * When tier is `local`, falls back if Ollama is disabled in config.
   */
  static selectModelWithFallback(
    context: RoutingContext,
  ): { selected: ModelSelection; fallbacks: ModelSelection[] } {
    const config = getConfig();
    if (!config) {
      throw new RoutingError('Configuration not loaded. Call loadConfig() first.');
    }

    let complexity = context.complexity || 'simple';

    // Local tier: fall back if Ollama not enabled
    if (complexity === 'local' && !config.ollama?.enabled) {
      complexity = (config.ollama?.fallback_to ?? 'simple') as typeof complexity;
    }

    const models = config.routing[complexity as keyof typeof config.routing];

    if (!models || models.length === 0) {
      throw new RoutingError(`No models configured for complexity level: ${complexity}`);
    }

    const isLocalTier = complexity === 'local';
    const provider: 'local' | 'openrouter' | 'cursor' = isLocalTier ? 'local' : 'openrouter';

    const selections: ModelSelection[] = models.map((model) => ({
      model,
      tier: complexity as 'local' | 'simple' | 'medium' | 'complex' | 'explain',
      costPer1kTokens: isLocalTier ? 0 : this.estimateCostPer1k(model),
      provider,
    }));

    let selected = selections[0];
    const fallbacks = selections.slice(1);

    // Quality adjustment: if selected model has < 50% accept rate for this tier
    // AND there's an alternative with > 70% AND both have > 10 signals, swap.
    const qualityTracker = getGlobalQualityTracker();
    if (qualityTracker && !isLocalTier) {
      const recommendations = qualityTracker.getRecommendation(complexity);
      if (recommendations.length > 0) {
        const selectedQuality = qualityTracker.getModelQuality(selected.model);
        const sq = Array.isArray(selectedQuality) ? null : selectedQuality;
        if (sq && sq.total_tasks > 10 && sq.accept_rate < 0.5) {
          const best = recommendations[0];
          if (best.model !== selected.model && best.score > 0.7) {
            // Swap to the better-quality model
            selected = {
              model: best.model,
              tier: selected.tier,
              costPer1kTokens: this.estimateCostPer1k(best.model),
              provider,
              quality_adjusted: true,
            };
          }
        }
      }
    }

    return { selected, fallbacks };
  }

  /**
   * Get all configured models for a complexity level.
   */
  static getModelsForComplexity(
    complexity: 'local' | 'simple' | 'medium' | 'explain' | 'complex'
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
