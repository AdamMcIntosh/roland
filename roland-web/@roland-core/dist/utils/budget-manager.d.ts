/**
 * Budget Manager - Cost control and spending limits
 *
 * Tracks API spending and enforces budget limits to prevent unexpected costs.
 * Auto-resets spending on the 1st of every month.
 * Default budget loaded from config.yaml (goose.monthly_budget).
 */
export interface BudgetConfig {
    maxBudget: number;
    currentSpending: number;
    warningThreshold: number;
    enabled: boolean;
    resetDate?: number;
    billingCycleDay: number;
}
export declare class BudgetManager {
    private static budgetFile;
    private static config;
    private static loaded;
    /**
     * Initialize and load budget from disk.
     * Checks if a monthly reset is due and applies it automatically.
     */
    static initialize(): void;
    /**
     * Check if a monthly reset is due and apply it.
     * Resets spending to $0 on the billing cycle day (default: 1st of month).
     */
    private static checkMonthlyReset;
    /**
     * Save budget to disk
     */
    private static save;
    /**
     * Configure budget from application config (called during startup).
     * Sets the budget programmatically from config.yaml goose section.
     */
    static configureFromAppConfig(options: {
        monthlyBudget?: number;
        warningThreshold?: number;
        billingCycleDay?: number;
        enabled?: boolean;
    }): void;
    /**
     * Set maximum budget
     */
    static setMaxBudget(amount: number): void;
    /**
     * Enable budget enforcement
     */
    static enable(maxBudget?: number): void;
    /**
     * Disable budget enforcement
     */
    static disable(): void;
    /**
     * Check if a cost would exceed the budget
     * @throws Error if budget would be exceeded
     */
    static checkBudget(estimatedCost: number): void;
    /**
     * Record actual spending
     */
    static recordSpending(cost: number): void;
    /**
     * Get remaining budget
     */
    static getRemainingBudget(): number;
    /**
     * Get current budget status
     */
    static getStatus(): BudgetConfig;
    /**
     * Reset budget spending to zero
     */
    static reset(): void;
    /**
     * Get budget usage percentage
     */
    static getUsagePercent(): number;
    /**
     * Get days until next reset
     */
    static getDaysUntilReset(): number;
    /**
     * Format budget status for display
     */
    static formatStatus(): string;
}
//# sourceMappingURL=budget-manager.d.ts.map