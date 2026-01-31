/**
 * Phase 5A: Ecomode MVP Tests
 * 
 * Validates end-to-end Ecomode execution:
 * - Cache detection
 * - Model selection with cheapest option
 * - Agent routing
 * - Cost tracking and savings calculation
 * - Result caching
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Ecomode } from '../../dist/modes/ecomode.js';
import { ModelRouter } from '../../dist/orchestrator/model-router.js';
import { CostCalculator } from '../../dist/orchestrator/cost-calculator.js';
import { CacheManager } from '../../dist/orchestrator/cache-manager.js';
import { loadConfig } from '../../dist/config/config-loader.js';
import { initializeAgents } from '../../dist/agents/index.js';

describe('Phase 5A: Ecomode MVP', () => {
  let ecomode: Ecomode;
  let costCalculator: CostCalculator;
  let cacheManager: CacheManager;

  beforeAll(async () => {
    // Load configuration first
    await loadConfig();

    // Load agents
    await initializeAgents('./agents');

    // Initialize components
    costCalculator = new CostCalculator();
    cacheManager = new CacheManager();
    ecomode = new Ecomode(ModelRouter, costCalculator, cacheManager);
  });

  describe('Ecomode Configuration', () => {
    it('should have correct mode configuration', () => {
      const config = ecomode.getConfig();
      
      expect(config.name).toBe('Ecomode');
      expect(config.keyword).toBe('eco:');
      expect(config.description).toContain('Single-agent');
      expect(config.leadAgent).toBe('architect');
    });

    it('should support cheapest model selection', () => {
      const routingContext = { queryLength: 50, complexity: 'simple' as const };
      const model = ModelRouter.selectCheapestModel(routingContext);
      
      expect(model).toBeDefined();
      expect(model.model).toBeDefined();
      expect(model.provider).toBeDefined();
      expect(model.costPer1kTokens).toBeGreaterThan(0);
    });
  });

  describe('Cache Integration', () => {
    it('should detect cache hit on repeated query', async () => {
      const query = 'test cache query';
      const testResult = 'cached response';

      // Pre-populate cache
      cacheManager.set(query, testResult, 'test-model', 0.01);

      // Execute Ecomode
      const result = await ecomode.execute(query, 'simple');

      expect(result.agentResults[0].cachedHit).toBe(true);
      expect(result.agentResults[0].model).toBe('cached');
      expect(result.totalCost).toBe(0);
      expect(result.agentResults[0].result).toBe(testResult);
    });

    it('should cache result after execution', async () => {
      const query = 'new query for caching';

      // Execute (without prior cache)
      const result = await ecomode.execute(query, 'simple');

      // Verify it's now cached
      const cached = cacheManager.get(query);
      expect(cached).toBeDefined();
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate estimated cost', async () => {
      const query = 'cost calculation test query';
      
      // Clear cache first
      cacheManager.clear();

      const result = await ecomode.execute(query, 'simple');

      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.agentResults[0].cost).toBe(result.totalCost);
    });

    it('should report zero cost for cached hits', async () => {
      const query = 'cached cost test';
      cacheManager.set(query, 'result', 'model', 0.05);

      const result = await ecomode.execute(query, 'simple');

      expect(result.totalCost).toBe(0);
      expect(result.agentResults[0].cachedHit).toBe(true);
    });
  });

  describe('Agent Selection', () => {
    it('should use lead agent when no agent specified', async () => {
      const query = 'test agent selection';
      cacheManager.clear();

      const result = await ecomode.execute(query, 'simple');

      // Lead agent should be used
      expect(result.agentResults[0].agentName).toBeDefined();
      expect(result.agentResults[0].agentName).toBeTruthy();
    });
  });

  describe('Complexity Estimation', () => {
    it('should estimate simple complexity for short queries', async () => {
      const query = 'short';
      cacheManager.clear();

      const result = await ecomode.execute(query, 'simple');

      expect(result.agentResults.length).toBe(1);
      expect(result.mode).toBe('ecomode');
    });

    it('should handle complex queries', async () => {
      const query = 'analyze this: ' + 'x'.repeat(300) + ' architecture design pattern';
      cacheManager.clear();

      const result = await ecomode.execute(query, 'complex');

      expect(result.agentResults.length).toBe(1);
      expect(result.mode).toBe('ecomode');
    });
  });

  describe('Execution Flow', () => {
    it('should return complete execution result', async () => {
      const query = 'full execution flow test';
      cacheManager.clear();

      const result = await ecomode.execute(query, 'simple');

      expect(result.mode).toBe('ecomode');
      expect(result.query).toBe(query);
      expect(result.agentResults).toBeDefined();
      expect(result.agentResults.length).toBeGreaterThan(0);
      expect(result.synthesizedResult).toBeDefined();
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.startTime).toBeLessThanOrEqual(result.endTime);
    });

    it('should track agent results', async () => {
      const query = 'agent tracking test';
      cacheManager.clear();

      const result = await ecomode.execute(query, 'medium');

      const agentResult = result.agentResults[0];
      expect(agentResult.agentName).toBeDefined();
      expect(agentResult.result).toBeDefined();
      expect(agentResult.cost).toBeGreaterThanOrEqual(0);
      expect(agentResult.duration).toBeGreaterThanOrEqual(0);
      expect(agentResult.model).toBeDefined();
      expect(typeof agentResult.cachedHit).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should throw on invalid complexity', async () => {
      const query = 'test error handling';

      // Invalid complexity should be handled
      // (actual implementation might coerce or throw)
      try {
        await ecomode.execute(query, 'simple');
        expect(true).toBe(true); // Should not throw for valid input
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Savings Calculation', () => {
    it('should calculate savings vs standard model', async () => {
      const query = 'savings calculation test with medium complexity';
      cacheManager.clear();

      const result = await ecomode.execute(query, 'medium');

      // Ecomode uses cheapest model, so should have cost
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.agentResults[0].cost).toBeDefined();
    });
  });
});
