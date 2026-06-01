/**
 * Advanced Cost Tracking
 *
 * Tracks detailed cost information:
 * - Per-model costs
 * - Per-agent costs
 * - Session-level accumulation
 * - Budget warnings and limits
 * - Cost trends and analytics
 */
export interface CostRecord {
    timestamp: number;
    model: string;
    provider: string;
    agent: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    query?: string;
    cached: boolean;
    /** PM task this usage is attributed to (Phase 3 usage attribution). */
    taskKey?: string;
}
export interface CostSummary {
    totalCost: number;
    totalTokens: number;
    localTokens: number;
    modelCosts: Record<string, number>;
    agentCosts: Record<string, number>;
    providerCosts: Record<string, number>;
    recordCount: number;
    averageCostPerQuery: number;
}
export interface BudgetConfig {
    dailyLimit?: number;
    monthlyLimit?: number;
    perQueryLimit?: number;
    enableWarnings?: boolean;
    warningThresholdPercent?: number;
}
/**
 * Advanced cost tracking system
 */
export declare class AdvancedCostTracker {
    private records;
    private budget;
    private sessionStartTime;
    /**
     * Initialize tracker with budget config
     */
    constructor(budget?: BudgetConfig);
    /**
     * Record a cost entry
     */
    recordCost(model: string, provider: string, agent: string, inputTokens: number, outputTokens: number, cost: number, options?: {
        query?: string;
        cached?: boolean;
        taskKey?: string;
    }): void;
    /**
     * Check if budget limits are exceeded
     */
    private checkBudgetLimits;
    /**
     * Get cost summary
     */
    getSummary(): CostSummary;
    /**
     * Get cost breakdown by model
     */
    getModelBreakdown(): Array<{
        model: string;
        cost: number;
        percentage: number;
    }>;
    /**
     * Get cost breakdown by agent
     */
    getAgentBreakdown(): Array<{
        agent: string;
        cost: number;
        percentage: number;
    }>;
    /**
     * Get usage breakdown by PM task (Phase 3). Token-centric — cost is $0 for
     * Cursor/subscription models, so this sorts by total tokens.
     */
    getTaskBreakdown(): Array<{
        taskKey: string;
        inputTokens: number;
        outputTokens: number;
        requests: number;
        cost: number;
    }>;
    /**
     * Get cost breakdown by provider
     */
    getProviderBreakdown(): Array<{
        provider: string;
        cost: number;
        percentage: number;
    }>;
    /**
     * Get cost trends over time
     */
    getCostTrends(windowMinutes?: number): Array<{
        timestamp: number;
        cost: number;
        cumulativeCost: number;
    }>;
    /**
     * Generate formatted cost report
     */
    generateReport(): string;
    /**
     * Clear all records
     */
    clear(): void;
    /**
     * Export records as JSON
     */
    exportJSON(): string;
    /**
     * Get all records
     */
    getRecords(): CostRecord[];
    /**
     * Find expensive queries
     */
    getMostExpensiveQueries(limit?: number): CostRecord[];
    /**
     * Check if budget is exceeded
     */
    isBudgetExceeded(): boolean;
    /**
     * Set budget configuration
     */
    setBudget(budget: BudgetConfig): void;
    /**
     * Get budget configuration
     */
    getBudget(): BudgetConfig;
}
/**
 * Get global tracker instance
 */
export declare function getGlobalTracker(): AdvancedCostTracker;
/**
 * Initialize global tracker with budget
 */
export declare function initializeTracker(budget?: BudgetConfig): AdvancedCostTracker;
//# sourceMappingURL=advanced-cost-tracker.d.ts.map