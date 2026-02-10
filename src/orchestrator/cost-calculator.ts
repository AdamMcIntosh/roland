/**
 * Cost Calculator - Track and Display Query Costs
 * 
 * MVP Version: Simple cost tracking for Ecomode
 * Calculates, aggregates, and displays costs for API calls
 */

import { ModelRouter } from './model-router.js';
import { CostEntry, SessionCost } from '../utils/types.js';
import { logger } from '../utils/logger.js';

export class CostCalculator {
  private sessionCosts: Map<string, CostEntry[]> = new Map();
  private sessionStart: number = Date.now();

  /**
   * Record a single API call cost
   * 
   * @param model - Model used
   * @param inputTokens - Input token count
   * @param outputTokens - Output token count
   * @param taskName - Name of the task (for grouping)
   * @returns Calculated cost in USD
   */
  recordCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    taskName: string = 'unnamed'
  ): number {
    const cost = ModelRouter.estimateCost(model, inputTokens, outputTokens);

    const entry: CostEntry = {
      model,
      inputTokens,
      outputTokens,
      totalCost: cost,
      timestamp: Date.now(),
    };

    if (!this.sessionCosts.has(taskName)) {
      this.sessionCosts.set(taskName, []);
    }

    this.sessionCosts.get(taskName)!.push(entry);

    logger.debug(
      `Cost recorded: ${model} - ${cost.toFixed(4)}$ (${inputTokens} in, ${outputTokens} out)`
    );

    return cost;
  }

  /**
   * Get total cost for a specific task
   * 
   * @param taskName - Task name
   * @returns Total cost for task
   */
  getTaskCost(taskName: string): number {
    const entries = this.sessionCosts.get(taskName) || [];
    return entries.reduce((sum, entry) => sum + entry.totalCost, 0);
  }

  /**
   * Get total session cost
   * 
   * @returns Total cost for entire session
   */
  getTotalCost(): number {
    let total = 0;
    this.sessionCosts.forEach((entries) => {
      total += entries.reduce((sum, entry) => sum + entry.totalCost, 0);
    });
    return total;
  }

  /**
   * Get session cost summary
   * 
   * @returns Detailed cost breakdown
   */
  getSessionSummary(): SessionCost {
    const taskBreakdown: Record<string, number> = {};
    let totalCost = 0;
    let totalTokens = 0;
    let callCount = 0;

    this.sessionCosts.forEach((entries, taskName) => {
      const taskTotal = entries.reduce((sum, e) => sum + e.totalCost, 0);
      const taskTokens = entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
      taskBreakdown[taskName] = taskTotal;
      totalCost += taskTotal;
      totalTokens += taskTokens;
      callCount += entries.length;
    });

    return {
      totalCost,
      totalTokens,
      entries: Array.from(this.sessionCosts.values()).flat(),
      startTime: this.sessionStart,
    };
  }

  /**
   * Calculate savings compared to standard model
   * 
   * @param ecomodeModel - Cheap model used (e.g., meta-llama/llama-3.2-3b-instruct:free)
   * @param standardModel - Standard model to compare against (e.g., nousresearch/hermes-3-llama-3.1-405b:free)
   * @returns Savings in USD
   */
  calculateSavings(ecomodeModel: string, standardModel: string): number {
    const summary = this.getSessionSummary();
    const totalTokens = summary.totalTokens;

    if (totalTokens === 0) return 0;

    const ecomodeCost = ModelRouter.estimateCost(
      ecomodeModel,
      totalTokens,
      totalTokens
    );
    const standardCost = ModelRouter.estimateCost(
      standardModel,
      totalTokens,
      totalTokens
    );

    return standardCost - ecomodeCost;
  }

  /**
   * Format cost for display
   * 
   * @param cost - Cost in USD
   * @returns Formatted string
   */
  static formatCost(cost: number): string {
    if (cost < 0.01) {
      return `$${(cost * 1000).toFixed(2)}m`;
    }
    return `$${cost.toFixed(4)}`;
  }

  /**
   * Generate formatted cost report
   * 
   * @param ecomodeModel - Model used for ecomode
   * @param standardModel - Model for comparison
   * @returns Formatted report string
   */
  generateReport(ecomodeModel: string, standardModel: string): string {
    const summary = this.getSessionSummary();
    const savings = this.calculateSavings(ecomodeModel, standardModel);
    const totalTokens = summary.totalTokens;

    let report = '\n📊 Cost Summary:\n';
    report += `  Total Cost: ${CostCalculator.formatCost(summary.totalCost)}\n`;
    report += `  API Calls: ${summary.entries.length}\n`;
    if (summary.entries.length > 0) {
      report += `  Avg per Call: ${CostCalculator.formatCost(summary.totalCost / summary.entries.length)}\n`;
    }
    report += `  Savings vs ${standardModel}: ${CostCalculator.formatCost(savings)}\n`;

    return report;
  }

  /**
   * Reset session costs (for new session)
   */
  reset(): void {
    this.sessionCosts.clear();
    this.sessionStart = Date.now();
  }

  /**
   * Get all cost entries for a task
   * 
   * @param taskName - Task name
   * @returns Array of cost entries
   */
  getTaskEntries(taskName: string): CostEntry[] {
    return this.sessionCosts.get(taskName) || [];
  }
}

// Export singleton instance
export const costCalculator = new CostCalculator();
