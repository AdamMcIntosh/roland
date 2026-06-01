/**
 * Query Complexity Classifier
 *
 * Analyzes queries to determine complexity and required model tier
 * Uses multiple heuristics:
 * - Token count estimation
 * - Keyword analysis (architecture, design, analyze, etc.)
 * - Multi-step task detection
 * - Context size indicators
 * - Domain-specific complexity
 */
import { AppConfig } from '../utils/types.js';
/**
 * Call OpenRouter with a free model to semantically classify query complexity.
 * Returns a ComplexityAnalysis if successful, or null on any failure.
 */
export declare function semanticClassify(query: string, config?: AppConfig): Promise<ComplexityAnalysis | null>;
/**
 * Async entry point that tries semantic classification first,
 * then falls back to the keyword heuristic.
 */
export declare function classifyWithSemantic(query: string, config?: AppConfig): Promise<ComplexityAnalysis>;
export interface ComplexityAnalysis {
    complexity: 'local' | 'simple' | 'medium' | 'complex';
    score: number;
    factors: ComplexityFactor[];
    tokenEstimate: number;
    suggestedModel: string;
}
export interface ComplexityFactor {
    name: string;
    weight: number;
    detected: boolean;
}
export declare class ComplexityClassifier {
    /**
     * Complexity keywords that suggest higher tier
     */
    private static readonly COMPLEX_KEYWORDS;
    /**
     * Trivial task keywords — reduce score toward local tier
     */
    private static readonly TRIVIAL_KEYWORDS;
    /**
     * Multi-step task indicators
     */
    private static readonly MULTISTEP_KEYWORDS;
    /**
     * Analyze query complexity
     * Returns complexity level and detailed score
     */
    static analyzeQuery(query: string): ComplexityAnalysis;
    /**
     * Analyze query length as complexity indicator
     */
    private static analyzeLengthFactor;
    /**
     * Analyze keyword complexity
     */
    private static analyzeKeywordComplexity;
    /**
     * Detect if query contains multiple steps
     */
    private static detectMultiStepTasks;
    /**
     * Analyze code complexity indicators
     */
    private static analyzeCodeComplexity;
    /**
     * Analyze explanation depth requirements
     */
    private static analyzeExplanationDepth;
    /**
     * Analyze technical depth of the query
     */
    private static analyzeTechnicalDepth;
    /**
     * Detect trivial tasks that can be handled by a local model.
     * Returns a negative weight to push score toward the local tier.
     */
    private static analyzeTrivialTask;
    /**
     * Convert complexity score to level
     */
    private static scoreToComplexity;
    /**
     * Estimate token count from query
     * Rough heuristic: ~4 characters per token
     */
    private static estimateTokens;
    /**
     * Suggest best IDE model for query complexity
     */
    private static suggestModel;
    /**
     * Get complexity tier for routing
     * Useful for selecting from config routing tables
     */
    static getRoutingTier(query: string): 'local' | 'simple' | 'medium' | 'complex' | 'explain';
    /**
     * Get full analysis with all details
     */
    static getDetailedAnalysis(query: string): ComplexityAnalysis;
}
/**
 * Convenience function for quick complexity check
 */
export declare function classifyQueryComplexity(query: string): 'local' | 'simple' | 'medium' | 'complex';
//# sourceMappingURL=complexity-classifier.d.ts.map