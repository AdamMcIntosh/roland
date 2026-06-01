/**
 * Model Router — IDE Model Selection with Complexity Classification
 *
 * Analyzes query complexity and recommends the best IDE model (Cursor, VS Code).
 * This is purely advisory — Roland returns the recommendation and the IDE picks
 * the model. No server-side LLM calls are made.
 */
import { ModelSelection, RoutingContext } from '../utils/types.js';
import { ComplexityClassifier } from './complexity-classifier.js';
/**
 * Estimated cost per million tokens for common IDE models.
 * Used for advisory cost estimates only — actual billing is through the IDE.
 */
export declare const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
}>;
export declare class ModelRouter {
    /**
     * Analyze query complexity and suggest an IDE model.
     */
    static analyzeQueryComplexity(query: string): {
        complexity: "local" | "simple" | "medium" | "complex";
        score: number;
        tokenEstimate: number;
        suggestedModel: string;
        factors: import("./complexity-classifier.js").ComplexityFactor[];
    };
    /**
     * Check Ollama availability. Caches result for 60 seconds.
     * Uses Node's built-in http module (Ollama is always localhost HTTP).
     */
    static checkOllamaHealth(baseUrl: string): Promise<{
        available: boolean;
        models: string[];
    }>;
    /**
     * Route query based on automatic complexity detection.
     * Returns recommended model + alternatives from config.
     */
    static routeByComplexity(query: string): {
        selected: ModelSelection;
        fallbacks: ModelSelection[];
        analysis: ReturnType<typeof ComplexityClassifier.getDetailedAnalysis>;
    };
    /**
     * Select primary model + fallbacks for a complexity tier.
     * When tier is `local`, falls back if Ollama is disabled in config.
     */
    static selectModelWithFallback(context: RoutingContext): {
        selected: ModelSelection;
        fallbacks: ModelSelection[];
    };
    /**
     * Get all configured models for a complexity level.
     */
    static getModelsForComplexity(complexity: 'local' | 'simple' | 'medium' | 'explain' | 'complex'): string[];
    /**
     * Estimate cost per 1k tokens for a model.
     * Returns 0 for unknown models (IDE subscription covers them).
     */
    static estimateCostPer1k(model: string): number;
    /**
     * Estimate total cost for a query based on model and token count.
     */
    static estimateCost(model: string, inputTokens: number, outputTokens: number): number;
    /**
     * Generate a cost report for a model and token estimate.
     */
    static generateCostReport(model: string, inputTokens: number, outputTokens: number): {
        model: string;
        inputTokens: number;
        outputTokens: number;
        inputCost: number;
        outputCost: number;
        totalCost: number;
    };
}
//# sourceMappingURL=model-router.d.ts.map