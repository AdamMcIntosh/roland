/**
 * Budget Manager - Cost control and spending limits
 * 
 * Tracks API spending and enforces budget limits to prevent unexpected costs
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export interface BudgetConfig {
  maxBudget: number;        // Maximum allowed spending
  currentSpending: number;  // Current total spending
  warningThreshold: number; // Warn at this percentage (0.0-1.0)
  enabled: boolean;         // Whether budget enforcement is enabled
  resetDate?: number;       // Optional: auto-reset timestamp
}

export class BudgetManager {
  private static budgetFile = '.cache/budget.json';
  private static config: BudgetConfig = {
    maxBudget: 5.00,
    currentSpending: 0,
    warningThreshold: 0.8,
    enabled: false,
  };
  private static loaded = false;

  /**
   * Initialize and load budget from disk
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
   * Format budget status for display
   */
  static formatStatus(): string {
    this.initialize();
    const remaining = this.getRemainingBudget();
    const usagePercent = this.getUsagePercent();

    return [
      `Budget Status:`,
      `  Enabled: ${this.config.enabled ? 'YES' : 'NO'}`,
      `  Maximum: $${this.config.maxBudget.toFixed(2)}`,
      `  Spent:   $${this.config.currentSpending.toFixed(4)}`,
      `  Remaining: $${remaining.toFixed(4)}`,
      `  Usage:   ${usagePercent.toFixed(1)}%`,
    ].join('\n');
  }
}
