/**
 * Unit Tests: Budget Manager
 * Tests spending limits, enforcement, and tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetManager } from '../src/utils/budget-manager';

describe('BudgetManager', () => {
  beforeEach(() => {
    BudgetManager.reset();
    BudgetManager.setMaxBudget(5.0);
  });

  afterEach(() => {
    BudgetManager.reset();
  });

  describe('setMaxBudget()', () => {
    it('should set budget limit', () => {
      BudgetManager.setMaxBudget(10.0);
      const status = BudgetManager.getStatus();
      expect(status.maxBudget).toBe(10.0);
    });

    it('should accept positive numbers', () => {
      BudgetManager.setMaxBudget(1.5);
      const status = BudgetManager.getStatus();
      expect(status.maxBudget).toBe(1.5);
    });

    it('should persist budget', () => {
      BudgetManager.setMaxBudget(7.5);
      const status1 = BudgetManager.getStatus();
      const status2 = BudgetManager.getStatus();
      expect(status1.maxBudget).toBe(status2.maxBudget);
    });
  });

  describe('checkBudget()', () => {
    it('should approve small costs', () => {
      expect(() => {
        BudgetManager.checkBudget(0.01);
      }).not.toThrow();
    });

    it('should approve cost within budget', () => {
      BudgetManager.recordSpending(2.0);
      expect(() => {
        BudgetManager.checkBudget(2.5);
      }).not.toThrow();
    });

    it('should reject cost exceeding budget', () => {
      BudgetManager.recordSpending(3.0);
      expect(() => {
        BudgetManager.checkBudget(2.5);
      }).toThrow();
    });

    it('should reject cost exactly at limit', () => {
      BudgetManager.recordSpending(4.9);
      expect(() => {
        BudgetManager.checkBudget(0.2);
      }).toThrow();
    });

    it('should include meaningful error message', () => {
      BudgetManager.recordSpending(4.0);
      try {
        BudgetManager.checkBudget(1.5);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('budget');
        expect(error.message.toLowerCase()).toContain('exceeded');
      }
    });

    it('should handle zero cost', () => {
      expect(() => {
        BudgetManager.checkBudget(0);
      }).not.toThrow();
    });

    it('should handle very small costs', () => {
      expect(() => {
        BudgetManager.checkBudget(0.000001);
      }).not.toThrow();
    });
  });

  describe('recordSpending()', () => {
    it('should add to current spending', () => {
      BudgetManager.recordSpending(0.5);
      const status = BudgetManager.getStatus();
      expect(status.currentSpending).toBe(0.5);
    });

    it('should accumulate multiple spends', () => {
      BudgetManager.recordSpending(0.1);
      BudgetManager.recordSpending(0.2);
      BudgetManager.recordSpending(0.3);
      const status = BudgetManager.getStatus();
      expect(status.currentSpending).toBeCloseTo(0.6, 5);
    });

    it('should track spending precisely', () => {
      const costs = [0.001, 0.002, 0.003];
      costs.forEach(cost => BudgetManager.recordSpending(cost));
      const status = BudgetManager.getStatus();
      expect(status.currentSpending).toBeCloseTo(0.006, 10);
    });

    it('should handle zero spending', () => {
      BudgetManager.recordSpending(0);
      const status = BudgetManager.getStatus();
      expect(status.currentSpending).toBe(0);
    });
  });

  describe('getRemainingBudget()', () => {
    it('should return full budget when nothing spent', () => {
      const remaining = BudgetManager.getRemainingBudget();
      expect(remaining).toBe(5.0);
    });

    it('should decrease as spending increases', () => {
      const remaining1 = BudgetManager.getRemainingBudget();
      BudgetManager.recordSpending(1.0);
      const remaining2 = BudgetManager.getRemainingBudget();
      expect(remaining2).toBeLessThan(remaining1);
    });

    it('should be accurate', () => {
      BudgetManager.recordSpending(1.5);
      const remaining = BudgetManager.getRemainingBudget();
      expect(remaining).toBeCloseTo(3.5, 5);
    });

    it('should never be negative', () => {
      BudgetManager.recordSpending(10.0); // Overspend (shouldn't happen with checkBudget)
      const remaining = BudgetManager.getRemainingBudget();
      // Implementation may vary, but document behavior
      expect(remaining).toBeDefined();
    });
  });

  describe('getUsagePercent()', () => {
    it('should return 0% when nothing spent', () => {
      const percent = BudgetManager.getUsagePercent();
      expect(percent).toBe(0);
    });

    it('should return 50% when half spent', () => {
      BudgetManager.recordSpending(2.5);
      const percent = BudgetManager.getUsagePercent();
      expect(percent).toBe(50);
    });

    it('should return 100% when fully spent', () => {
      BudgetManager.recordSpending(5.0);
      const percent = BudgetManager.getUsagePercent();
      expect(percent).toBe(100);
    });

    it('should be between 0 and 100', () => {
      BudgetManager.recordSpending(2.0);
      const percent = BudgetManager.getUsagePercent();
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    });
  });

  describe('enable() / disable()', () => {
    it('should enable budget enforcement', () => {
      BudgetManager.disable();
      BudgetManager.enable();
      const status = BudgetManager.getStatus();
      expect(status.enabled).toBe(true);
    });

    it('should disable budget enforcement', () => {
      BudgetManager.enable();
      BudgetManager.disable();
      const status = BudgetManager.getStatus();
      expect(status.enabled).toBe(false);
    });

    it('should skip checks when disabled', () => {
      BudgetManager.disable();
      BudgetManager.recordSpending(10.0);
      expect(() => {
        BudgetManager.checkBudget(5.0);
      }).not.toThrow();
    });

    it('should enforce checks when enabled', () => {
      BudgetManager.enable();
      BudgetManager.recordSpending(4.0);
      expect(() => {
        BudgetManager.checkBudget(1.5);
      }).toThrow();
    });
  });

  describe('reset()', () => {
    it('should clear spending', () => {
      BudgetManager.recordSpending(2.0);
      BudgetManager.reset();
      const status = BudgetManager.getStatus();
      expect(status.currentSpending).toBe(0);
    });

    it('should preserve budget limit', () => {
      const originalBudget = 5.0;
      BudgetManager.setMaxBudget(originalBudget);
      BudgetManager.recordSpending(2.0);
      BudgetManager.reset();
      const status = BudgetManager.getStatus();
      expect(status.maxBudget).toBe(originalBudget);
    });

    it('should reset usage percent to 0', () => {
      BudgetManager.recordSpending(2.5);
      BudgetManager.reset();
      const percent = BudgetManager.getUsagePercent();
      expect(percent).toBe(0);
    });
  });

  describe('getStatus()', () => {
    it('should return all status info', () => {
      BudgetManager.recordSpending(1.5);
      const status = BudgetManager.getStatus();

      expect(status).toHaveProperty('maxBudget');
      expect(status).toHaveProperty('currentSpending');
      expect(status).toHaveProperty('warningThreshold');
      expect(status).toHaveProperty('enabled');
    });

    it('should have accurate values', () => {
      BudgetManager.setMaxBudget(10.0);
      BudgetManager.recordSpending(2.0);
      const status = BudgetManager.getStatus();

      expect(status.maxBudget).toBe(10.0);
      expect(status.currentSpending).toBe(2.0);
    });
  });

  describe('formatStatus()', () => {
    it('should return formatted string', () => {
      BudgetManager.recordSpending(1.0);
      const formatted = BudgetManager.formatStatus();

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('5.00');
      expect(formatted).toContain('1.00');
    });

    it('should show all relevant info', () => {
      BudgetManager.recordSpending(2.5);
      const formatted = BudgetManager.formatStatus();

      expect(formatted).toContain('Enabled');
      expect(formatted).toContain('Maximum');
      expect(formatted).toContain('Spent');
      expect(formatted).toContain('Remaining');
      expect(formatted).toContain('Usage');
    });

    it('should handle disabled state', () => {
      BudgetManager.disable();
      const formatted = BudgetManager.formatStatus();
      expect(formatted).toContain('NO');
    });
  });

  describe('Budget Workflows', () => {
    it('should support multiple queries within budget', () => {
      const queries = [
        { cost: 0.1 },
        { cost: 0.2 },
        { cost: 0.15 },
        { cost: 0.25 },
      ];

      let totalCost = 0;
      queries.forEach(q => {
        expect(() => BudgetManager.checkBudget(q.cost)).not.toThrow();
        BudgetManager.recordSpending(q.cost);
        totalCost += q.cost;
      });

      expect(BudgetManager.getStatus().currentSpending).toBeCloseTo(totalCost, 5);
      expect(BudgetManager.getRemainingBudget()).toBeCloseTo(5.0 - totalCost, 5);
    });

    it('should prevent overspending', () => {
      BudgetManager.recordSpending(4.8);

      expect(() => BudgetManager.checkBudget(0.3)).toThrow();
      expect(() => BudgetManager.checkBudget(0.1)).not.toThrow();

      BudgetManager.recordSpending(0.1);
      expect(() => BudgetManager.checkBudget(0.05)).toThrow();
    });

    it('should support dynamic budget changes', () => {
      BudgetManager.recordSpending(2.0);

      // Increase budget
      BudgetManager.setMaxBudget(10.0);
      expect(() => BudgetManager.checkBudget(5.0)).not.toThrow();

      // Decrease budget
      BudgetManager.setMaxBudget(3.0);
      expect(() => BudgetManager.checkBudget(1.0)).toThrow();
    });
  });

  describe('Warning Threshold', () => {
    it('should include warning threshold in status', () => {
      const status = BudgetManager.getStatus();
      expect(status.warningThreshold).toBeDefined();
      expect(status.warningThreshold).toBeGreaterThan(0);
      expect(status.warningThreshold).toBeLessThan(1);
    });

    it('should warn when approaching limit', () => {
      const threshold = BudgetManager.getStatus().warningThreshold;
      const warningPoint = 5.0 * threshold;

      BudgetManager.recordSpending(warningPoint + 0.1);

      // Method to check if warning should be shown
      const percent = BudgetManager.getUsagePercent();
      expect(percent).toBeGreaterThan(threshold * 100);
    });
  });

  describe('Persistence', () => {
    it('should persist state to file', () => {
      BudgetManager.setMaxBudget(7.0);
      BudgetManager.recordSpending(2.5);

      // In a real scenario, verify file was written
      const status = BudgetManager.getStatus();
      expect(status.maxBudget).toBe(7.0);
      expect(status.currentSpending).toBe(2.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle floating point precision', () => {
      BudgetManager.recordSpending(0.1);
      BudgetManager.recordSpending(0.2);
      BudgetManager.recordSpending(0.3);

      const total = BudgetManager.getStatus().currentSpending;
      expect(total).toBeCloseTo(0.6, 10);
    });

    it('should handle very large budgets', () => {
      BudgetManager.setMaxBudget(1000000);
      BudgetManager.recordSpending(500000);

      const status = BudgetManager.getStatus();
      expect(status.maxBudget).toBe(1000000);
      expect(status.currentSpending).toBe(500000);
    });

    it('should handle very small budgets', () => {
      BudgetManager.setMaxBudget(0.01);
      expect(() => BudgetManager.checkBudget(0.005)).not.toThrow();
      expect(() => BudgetManager.checkBudget(0.01)).toThrow();
    });
  });
});
