/**
 * Budget Manager - Cost control and spending limits
 *
 * Tracks API spending and enforces budget limits to prevent unexpected costs.
 * Auto-resets spending on the 1st of every month.
 * Default budget loaded from config.yaml (goose.monthly_budget).
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export interface BudgetConfig {
  maxBudget: number;        // Maximum allowed spending (monthly)
  currentSpending: number;  // Current total spending this period
  warningThreshold: number; // Warn at this percentage (0.0-1.0)
  enabled: boolean;         // Whether budget enforcement is enabled
  resetDate?: number;       // Timestamp of last reset
  billingCycleDay: number;  // Day of month to reset (default: 1)
}

export class BudgetManager {
  private static budgetFile = '.cache/budget.json';
  private static config: BudgetConfig = {
    maxBudget: 85.00,
    currentSpending: 0,
    warningThreshold: 0.8,
    enabled: true,
    billingCycleDay: 1,
  };
  private static loaded = false;

  /**
   * Initialize and load budget from disk.
   * Checks if a monthly reset is due and applies it automatically.
   */
  static initialize(): void {
    if (this.loaded) return;

    try {
      if (fs.existsSync(this.budgetFile)) {
        const data = JSON.parse(fs.readFileSync(this.budgetFile, 'utf-8'));
        this.config = { ...this.config, ...data };
        logger.debug(`[Budget] Loaded: $${this.config.currentSpending.toFixed(4)} / $${this.config.maxBudget.toFixed(2)}`);
      }
    } catch (error) {
      logger.warn(`[Budget] Failed to load budget file: ${error}`);
    }

    this.loaded = true;

    // Check for monthly auto-reset
    this.checkMonthlyReset();
  }

  /**
   * Check if a monthly reset is due and apply it.
   * Resets spending to $0 on the billing cycle day (default: 1st of month).
   */
  private static checkMonthlyReset(): void {
    const now = new Date();
    const resetDay = this.config.billingCycleDay || 1;

    if (!this.config.resetDate) {
      // First run — set resetDate to now, don't reset spending
      this.config.resetDate = now.getTime();
      this.save();
      return;
    }

    const lastReset = new Date(this.config.resetDate);

    // Check if we've crossed the billing cycle day since last reset
    // This handles: last reset was in a previous month AND today is on or after the reset day
    const lastResetMonth = lastReset.getFullYear() * 12 + lastReset.getMonth();
    const currentMonth = now.getFullYear() * 12 + now.getMonth();

    if (currentMonth > lastResetMonth && now.getDate() >= resetDay) {
      const previousSpending = this.config.currentSpending;
      this.config.currentSpending = 0;
      this.config.resetDate = now.getTime();
      this.save();
      logger.info(
        `[Budget] Monthly auto-reset: $${previousSpending.toFixed(4)} → $0.00 ` +
        `(billing cycle day: ${resetDay}, limit: $${this.config.maxBudget.toFixed(2)})`
      );
    }
  }

  /**
   * Save budget to disk
   */
  private static save(): void {
    try {
      const dir = path.dirname(this.budgetFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.budgetFile, JSON.stringify(this.config, null, 2));
      logger.debug(`[Budget] Saved: $${this.config.currentSpending.toFixed(4)}`);
    } catch (error) {
      logger.error(`[Budget] Failed to save: ${error}`);
    }
  }

  /**
   * Configure budget from application config (called during startup).
   * Sets the budget programmatically from config.yaml goose section.
   */
  static configureFromAppConfig(options: {
    monthlyBudget?: number;
    warningThreshold?: number;
    billingCycleDay?: number;
    enabled?: boolean;
  }): void {
    this.initialize();

    let changed = false;

    if (options.monthlyBudget !== undefined && options.monthlyBudget !== this.config.maxBudget) {
      this.config.maxBudget = options.monthlyBudget;
      changed = true;
    }
    if (options.warningThreshold !== undefined) {
      this.config.warningThreshold = options.warningThreshold;
      changed = true;
    }
    if (options.billingCycleDay !== undefined) {
      this.config.billingCycleDay = options.billingCycleDay;
      changed = true;
    }
    if (options.enabled !== undefined) {
      this.config.enabled = options.enabled;
      changed = true;
    }

    if (changed) {
      this.save();
      logger.info(
        `[Budget] Configured: $${this.config.maxBudget.toFixed(2)}/month, ` +
        `threshold: ${(this.config.warningThreshold * 100).toFixed(0)}%, ` +
        `billing day: ${this.config.billingCycleDay}, ` +
        `enabled: ${this.config.enabled}`
      );
    }
  }

  /**
   * Set maximum budget
   */
  static setMaxBudget(amount: number): void {
    this.initialize();
    this.config.maxBudget = amount;
    this.config.enabled = true;
    this.save();
    logger.info(`[Budget] Budget set to $${amount.toFixed(2)}`);
  }

  /**
   * Enable budget enforcement
   */
  static enable(maxBudget?: number): void {
    this.initialize();
    this.config.enabled = true;
    if (maxBudget !== undefined) {
      this.config.maxBudget = maxBudget;
    }
    this.save();
    logger.info(`[Budget] Budget enforcement ENABLED ($${this.config.maxBudget.toFixed(2)} limit)`);
  }

  /**
   * Disable budget enforcement
   */
  static disable(): void {
    this.initialize();
    this.config.enabled = false;
    this.save();
    logger.info(`[Budget] Budget enforcement DISABLED`);
  }

  /**
   * Check if a cost would exceed the budget
   * @throws Error if budget would be exceeded
   */
  static checkBudget(estimatedCost: number): void {
    this.initialize();

    if (!this.config.enabled) {
      return; // Budget not enforced
    }

    const newTotal = this.config.currentSpending + estimatedCost;
    const remaining = this.config.maxBudget - this.config.currentSpending;

    if (newTotal > this.config.maxBudget) {
      throw new Error(
        `Budget exceeded! Cost: $${estimatedCost.toFixed(6)}, ` +
        `Remaining: $${remaining.toFixed(6)}, ` +
        `Budget: $${this.config.maxBudget.toFixed(2)}`
      );
    }

    // Warning threshold
    const usagePercent = newTotal / this.config.maxBudget;
    if (usagePercent >= this.config.warningThreshold &&
        this.config.currentSpending / this.config.maxBudget < this.config.warningThreshold) {
      logger.warn(
        `[Budget] WARNING: ${(usagePercent * 100).toFixed(0)}% of budget used ` +
        `($${newTotal.toFixed(4)} / $${this.config.maxBudget.toFixed(2)})`
      );
    }
  }

  /**
   * Record actual spending
   */
  static recordSpending(cost: number): void {
    this.initialize();
    this.config.currentSpending += cost;
    this.save();

    const usagePercent = (this.config.currentSpending / this.config.maxBudget) * 100;
    logger.debug(
      `[Budget] Spent: $${cost.toFixed(6)}, ` +
      `Total: $${this.config.currentSpending.toFixed(4)} ` +
      `(${usagePercent.toFixed(1)}% of budget)`
    );
  }

  /**
   * Get remaining budget
   */
  static getRemainingBudget(): number {
    this.initialize();
    return Math.max(0, this.config.maxBudget - this.config.currentSpending);
  }

  /**
   * Get current budget status
   */
  static getStatus(): BudgetConfig {
    this.initialize();
    return { ...this.config };
  }

  /**
   * Reset budget spending to zero
   */
  static reset(): void {
    this.initialize();
    this.config.currentSpending = 0;
    this.config.resetDate = Date.now();
    this.save();
    logger.info(`[Budget] Budget reset. Limit: $${this.config.maxBudget.toFixed(2)}`);
  }

  /**
   * Get budget usage percentage
   */
  static getUsagePercent(): number {
    this.initialize();
    if (this.config.maxBudget === 0) return 0;
    return (this.config.currentSpending / this.config.maxBudget) * 100;
  }

  /**
   * Get days until next reset
   */
  static getDaysUntilReset(): number {
    const now = new Date();
    const resetDay = this.config.billingCycleDay || 1;
    const currentDay = now.getDate();

    if (currentDay < resetDay) {
      return resetDay - currentDay;
    }
    // Next month
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, resetDay);
    const diffMs = nextMonth.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Format budget status for display
   */
  static formatStatus(): string {
    this.initialize();
    const remaining = this.getRemainingBudget();
    const usagePercent = this.getUsagePercent();
    const daysUntilReset = this.getDaysUntilReset();

    return [
      `Budget Status:`,
      `  Enabled: ${this.config.enabled ? 'YES' : 'NO'}`,
      `  Maximum: $${this.config.maxBudget.toFixed(2)}/month`,
      `  Spent:   $${this.config.currentSpending.toFixed(4)}`,
      `  Remaining: $${remaining.toFixed(4)}`,
      `  Usage:   ${usagePercent.toFixed(1)}%`,
      `  Resets in: ${daysUntilReset} days (day ${this.config.billingCycleDay} of month)`,
    ].join('\n');
  }
}
