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
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
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
  warningThresholdPercent?: number; // Alert at X% of limit
}

/**
 * Advanced cost tracking system
 */
export class AdvancedCostTracker {
  private records: CostRecord[] = [];
  private budget: BudgetConfig = {
    enableWarnings: true,
    warningThresholdPercent: 80,
  };
  private sessionStartTime: number = Date.now();

  /**
   * Initialize tracker with budget config
   */
  constructor(budget?: BudgetConfig) {
    if (budget) {
      this.budget = { ...this.budget, ...budget };
    }
  }

  /**
   * Record a cost entry
   */
  recordCost(
    model: string,
    provider: string,
    agent: string,
    inputTokens: number,
    outputTokens: number,
    cost: number,
    options?: { query?: string; cached?: boolean }
  ): void {
    const record: CostRecord = {
      timestamp: Date.now(),
      model,
      provider,
      agent,
      inputTokens,
      outputTokens,
      cost,
      query: options?.query,
      cached: options?.cached ?? false,
    };

    this.records.push(record);

    // Check budget limits
    this.checkBudgetLimits();
  }

  /**
   * Check if budget limits are exceeded
   */
  private checkBudgetLimits(): void {
    if (!this.budget.enableWarnings) return;

    const summary = this.getSummary();
    const thresholdPercent = this.budget.warningThresholdPercent || 80;

    if (
      this.budget.dailyLimit &&
      summary.totalCost > (this.budget.dailyLimit * thresholdPercent) / 100
    ) {
      console.warn(
        `⚠️ Daily cost budget warning: $${summary.totalCost.toFixed(2)} / $${this.budget.dailyLimit.toFixed(2)}`
      );
    }

    if (
      this.budget.monthlyLimit &&
      summary.totalCost > (this.budget.monthlyLimit * thresholdPercent) / 100
    ) {
      console.warn(
        `⚠️ Monthly cost budget warning: $${summary.totalCost.toFixed(2)} / $${this.budget.monthlyLimit.toFixed(2)}`
      );
    }

    if (
      this.budget.perQueryLimit &&
      this.records.length > 0
    ) {
      const lastRecord = this.records[this.records.length - 1];
      if (lastRecord.cost > this.budget.perQueryLimit) {
        console.warn(
          `⚠️ Per-query limit exceeded: $${lastRecord.cost.toFixed(4)} > $${this.budget.perQueryLimit.toFixed(4)}`
        );
      }
    }
  }

  /**
   * Get cost summary
   */
  getSummary(): CostSummary {
    const modelCosts: Record<string, number> = {};
    const agentCosts: Record<string, number> = {};
    const providerCosts: Record<string, number> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const record of this.records) {
      totalCost += record.cost;
      totalTokens += record.inputTokens + record.outputTokens;

      // Aggregate by model
      modelCosts[record.model] = (modelCosts[record.model] || 0) + record.cost;

      // Aggregate by agent
      agentCosts[record.agent] = (agentCosts[record.agent] || 0) + record.cost;

      // Aggregate by provider
      providerCosts[record.provider] =
        (providerCosts[record.provider] || 0) + record.cost;
    }

    return {
      totalCost,
      totalTokens,
      modelCosts,
      agentCosts,
      providerCosts,
      recordCount: this.records.length,
      averageCostPerQuery: this.records.length > 0 ? totalCost / this.records.length : 0,
    };
  }

  /**
   * Get cost breakdown by model
   */
  getModelBreakdown(): Array<{ model: string; cost: number; percentage: number }> {
    const summary = this.getSummary();
    return Object.entries(summary.modelCosts)
      .map(([model, cost]) => ({
        model,
        cost,
        percentage: (cost / summary.totalCost) * 100,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get cost breakdown by agent
   */
  getAgentBreakdown(): Array<{ agent: string; cost: number; percentage: number }> {
    const summary = this.getSummary();
    return Object.entries(summary.agentCosts)
      .map(([agent, cost]) => ({
        agent,
        cost,
        percentage: (cost / summary.totalCost) * 100,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get cost breakdown by provider
   */
  getProviderBreakdown(): Array<{ provider: string; cost: number; percentage: number }> {
    const summary = this.getSummary();
    return Object.entries(summary.providerCosts)
      .map(([provider, cost]) => ({
        provider,
        cost,
        percentage: (cost / summary.totalCost) * 100,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get cost trends over time
   */
  getCostTrends(
    windowMinutes: number = 60
  ): Array<{ timestamp: number; cost: number; cumulativeCost: number }> {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const startTime = now - windowMs;

    const trends: Array<{ timestamp: number; cost: number; cumulativeCost: number }> = [];
    let cumulativeCost = 0;

    const filteredRecords = this.records.filter((r) => r.timestamp >= startTime);
    for (const record of filteredRecords) {
      cumulativeCost += record.cost;
      trends.push({
        timestamp: record.timestamp,
        cost: record.cost,
        cumulativeCost,
      });
    }

    return trends;
  }

  /**
   * Generate formatted cost report
   */
  generateReport(): string {
    const summary = this.getSummary();
    const sessionDuration = (Date.now() - this.sessionStartTime) / 1000 / 60; // minutes

    let report = '';
    report += '💰 Cost Report\n';
    report += '═══════════════════════════════════════\n\n';

    // Summary
    report += `Total Cost:        $${summary.totalCost.toFixed(4)}\n`;
    report += `Total Tokens:      ${summary.totalTokens.toLocaleString()}\n`;
    report += `Total Queries:     ${summary.recordCount}\n`;
    report += `Avg Cost/Query:    $${summary.averageCostPerQuery.toFixed(4)}\n`;
    report += `Session Duration:  ${sessionDuration.toFixed(1)} min\n\n`;

    // Model breakdown
    report += 'By Model:\n';
    for (const { model, cost, percentage } of this.getModelBreakdown()) {
      report += `  ${model.padEnd(20)} $${cost.toFixed(4).padStart(8)} (${percentage.toFixed(1)}%)\n`;
    }
    report += '\n';

    // Agent breakdown
    report += 'By Agent:\n';
    for (const { agent, cost, percentage } of this.getAgentBreakdown()) {
      report += `  ${agent.padEnd(20)} $${cost.toFixed(4).padStart(8)} (${percentage.toFixed(1)}%)\n`;
    }
    report += '\n';

    // Provider breakdown
    report += 'By Provider:\n';
    for (const { provider, cost, percentage } of this.getProviderBreakdown()) {
      report += `  ${provider.padEnd(20)} $${cost.toFixed(4).padStart(8)} (${percentage.toFixed(1)}%)\n`;
    }

    // Budget status
    if (this.budget.dailyLimit) {
      const dailyUsagePercent = (summary.totalCost / this.budget.dailyLimit) * 100;
      report += `\nDaily Budget:      $${summary.totalCost.toFixed(2)} / $${this.budget.dailyLimit.toFixed(2)} (${dailyUsagePercent.toFixed(1)}%)\n`;
    }

    return report;
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
    this.sessionStartTime = Date.now();
  }

  /**
   * Export records as JSON
   */
  exportJSON(): string {
    return JSON.stringify(
      {
        exportDate: new Date().toISOString(),
        summary: this.getSummary(),
        records: this.records,
      },
      null,
      2
    );
  }

  /**
   * Get all records
   */
  getRecords(): CostRecord[] {
    return [...this.records];
  }

  /**
   * Find expensive queries
   */
  getMostExpensiveQueries(limit: number = 10): CostRecord[] {
    return [...this.records]
      .filter((r) => r.query)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit);
  }

  /**
   * Check if budget is exceeded
   */
  isBudgetExceeded(): boolean {
    const summary = this.getSummary();

    if (this.budget.dailyLimit && summary.totalCost > this.budget.dailyLimit) {
      return true;
    }

    if (this.budget.monthlyLimit && summary.totalCost > this.budget.monthlyLimit) {
      return true;
    }

    return false;
  }

  /**
   * Set budget configuration
   */
  setBudget(budget: BudgetConfig): void {
    this.budget = { ...this.budget, ...budget };
  }

  /**
   * Get budget configuration
   */
  getBudget(): BudgetConfig {
    return { ...this.budget };
  }
}

/**
 * Global instance for singleton pattern
 */
let globalTracker: AdvancedCostTracker | null = null;

/**
 * Get global tracker instance
 */
export function getGlobalTracker(): AdvancedCostTracker {
  if (!globalTracker) {
    globalTracker = new AdvancedCostTracker();
  }
  return globalTracker;
}

/**
 * Initialize global tracker with budget
 */
export function initializeTracker(budget?: BudgetConfig): AdvancedCostTracker {
  globalTracker = new AdvancedCostTracker(budget);
  return globalTracker;
}
