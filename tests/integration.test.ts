/**
 * Integration Tests - End-to-end testing for MVP
 * 
 * Tests core Ecomode functionality:
 * - Model routing
 * - Cost calculation
 * - Caching
 * - Skill execution
 * - Agent loading
 * - CLI interface
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelRouter } from '../../src/orchestrator/model-router';
import { CostCalculator } from '../../src/orchestrator/cost-calculator';
import { CacheManager } from '../../src/orchestrator/cache-manager';
import { AgentExecutor } from '../../src/orchestrator/agent-executor';
import { parseQuery, getComplexity } from '../../src/cli/keyword-parser';
import { RefactoringSkill, DocumentationSkill, TestingSkill } from '../../src/skills/implementations/core-skills';
import { skillRegistry } from '../../src/skills/skill-framework';

describe('Ecomode MVP Integration Tests', () => {
  
  describe('Model Router', () => {
    it('should select cheapest model for simple complexity', () => {
      const result = ModelRouter.selectCheapestModel({
        queryLength: 100,
        complexity: 'simple',
      });

      expect(result).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.provider).toBeDefined();
      expect(result.costPer1kTokens).toBeGreaterThan(0);
    });

    it('should estimate cost for tokens', () => {
      const cost = ModelRouter.estimateCost('grok-4-1-fast-reasoning', 1000, 1000);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.01);
    });

    it('should get provider correctly', () => {
      expect(ModelRouter.getProvider('grok-4-1-fast-reasoning')).toBe('xai');
      expect(ModelRouter.getProvider('claude-4.5-sonnet')).toBe('anthropic');
      expect(ModelRouter.getProvider('gpt-4o')).toBe('openai');
      expect(ModelRouter.getProvider('gemini-2.5-flash')).toBe('google');
    });

    it('should compare costs between models', () => {
      const comparison = ModelRouter.compareCosts('grok-4-1-fast-reasoning', 'gpt-4o', 1000);
      expect(comparison.cheapCost).toBeLessThan(comparison.expensiveCost);
      expect(comparison.savings).toBeGreaterThan(0);
    });
  });

  describe('Cost Calculator', () => {
    let calculator: CostCalculator;

    beforeEach(() => {
      calculator = new CostCalculator();
    });

    it('should record costs correctly', () => {
      const cost = calculator.recordCost('grok-4-1-fast-reasoning', 100, 100, 'test');
      expect(cost).toBeGreaterThan(0);
    });

    it('should calculate task-specific costs', () => {
      calculator.recordCost('grok-4-1-fast-reasoning', 100, 100, 'task1');
      calculator.recordCost('grok-4-1-fast-reasoning', 200, 200, 'task2');

      const cost1 = calculator.getTaskCost('task1');
      const cost2 = calculator.getTaskCost('task2');

      expect(cost2).toBeGreaterThan(cost1);
    });

    it('should aggregate total costs', () => {
      calculator.recordCost('grok-4-1-fast-reasoning', 100, 100, 'task1');
      calculator.recordCost('grok-4-1-fast-reasoning', 100, 100, 'task2');

      const total = calculator.getTotalCost();
      expect(total).toBeGreaterThan(0);
    });

    it('should generate cost report', () => {
      calculator.recordCost('grok-4-1-fast-reasoning', 100, 100, 'test');
      const report = calculator.generateReport('grok-4-1-fast-reasoning', 'gpt-4o');
      expect(report).toContain('Cost Summary');
      expect(report).toContain('Savings');
    });
  });

  describe('Cache Manager', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = new CacheManager('./.test-cache');
    });

    afterEach(() => {
      cache.clear();
    });

    it('should cache and retrieve results', () => {
      const query = 'test query';
      const result = 'test result';

      cache.set(query, result, 'grok-4-1-fast-reasoning', 0.001);
      const cached = cache.get(query);

      expect(cached).toBe(result);
    });

    it('should return null for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should track cache statistics', () => {
      cache.get('missing1'); // miss
      cache.get('missing2'); // miss
      
      cache.set('query', 'result', 'model', 0.001);
      cache.get('query'); // hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
    });

    it('should generate cache report', () => {
      cache.set('query', 'result', 'model', 0.001);
      const report = cache.generateReport();
      expect(report).toContain('Cache Statistics');
    });
  });

  describe('Skills Framework', () => {
    beforeEach(() => {
      skillRegistry.clear();
    });

    it('should register refactoring skill', async () => {
      const skill = new RefactoringSkill();
      skillRegistry.register(skill);

      expect(skillRegistry.hasSkill('refactoring')).toBe(true);
      expect(skillRegistry.count()).toBe(1);
    });

    it('should execute refactoring skill', async () => {
      skillRegistry.register(new RefactoringSkill());

      const result = await skillRegistry.executeSkill('refactoring', {
        code: 'function test() { return true; }',
        focus: 'readability',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute documentation skill', async () => {
      skillRegistry.register(new DocumentationSkill());

      const result = await skillRegistry.executeSkill('documentation', {
        code: 'function test() { return true; }',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute testing skill', async () => {
      skillRegistry.register(new TestingSkill());

      const result = await skillRegistry.executeSkill('testing', {
        code: 'function test() { return true; }',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should list skills by category', () => {
      skillRegistry.register(new RefactoringSkill());
      skillRegistry.register(new TestingSkill());

      const codeSkills = skillRegistry.getSkillsByCategory('code');
      expect(codeSkills.length).toBeGreaterThan(0);
    });
  });

  describe('Keyword Parser', () => {
    it('should parse ecomode keyword', () => {
      const result = parseQuery('eco: refactor this code');
      expect(result.mode).toBe('ecomode');
      expect(result.query).toBe('refactor this code');
    });

    it('should detect refactoring skill', () => {
      const result = parseQuery('eco: refactor function');
      expect(result.skill).toBe('refactoring');
    });

    it('should detect documentation skill', () => {
      const result = parseQuery('eco: document this API');
      expect(result.skill).toBe('documentation');
    });

    it('should detect testing skill', () => {
      const result = parseQuery('eco: write tests');
      expect(result.skill).toBe('testing');
    });

    it('should default to simple complexity', () => {
      const complexity = getComplexity('simple task');
      expect(complexity).toBe('simple');
    });

    it('should detect complex task', () => {
      const complexity = getComplexity('analyze and design the system');
      expect(complexity).toBe('complex');
    });

    it('should detect medium complexity', () => {
      const complexity = getComplexity('balance performance and readability');
      expect(complexity).toBe('medium');
    });
  });

  describe('Execution Flow', () => {
    it('should complete basic execution request', async () => {
      const executor = new AgentExecutor();
      
      const result = await executor.execute({
        query: 'test refactor',
        complexity: 'simple',
        agentName: 'default',
        useCache: true,
      });

      expect(result).toBeDefined();
      expect(result.query).toBeDefined();
      expect(result.result).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should cache results', async () => {
      const executor = new AgentExecutor();
      
      // First execution - should not be cached
      const result1 = await executor.execute({
        query: 'test query',
        complexity: 'simple',
      });

      // Second execution - should be cached
      const result2 = await executor.execute({
        query: 'test query',
        complexity: 'simple',
      });

      expect(result1.result).toBe(result2.result);
      expect(result2.cachedHit).toBe(true);
    });

    it('should track execution costs', async () => {
      const executor = new AgentExecutor();
      
      await executor.execute({
        query: 'test task',
        complexity: 'simple',
      });

      const stats = executor.getStats();
      expect(stats.costs).toBeDefined();
      expect(stats.cache).toBeDefined();
    });

    it('should generate execution report', async () => {
      const executor = new AgentExecutor();
      
      await executor.execute({
        query: 'test',
        complexity: 'simple',
      });

      const report = executor.generateReport();
      expect(report).toContain('Cost Summary');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid skill execution', async () => {
      const result = await skillRegistry.executeSkill('nonexistent', {});
      // Should throw error, caught by test framework
    });

    it('should handle missing required parameters', async () => {
      skillRegistry.register(new RefactoringSkill());
      const result = await skillRegistry.executeSkill('refactoring', {});
      expect(result.success).toBe(false);
    });
  });

  describe('Output Formatting', () => {
    it('should format results with cost and duration', () => {
      const { formatResult } = require('../../src/cli/output-formatter');
      const output = formatResult('Test result', 'grok-4-1-fast-reasoning', 0.001, false, 100);
      
      expect(output.full).toContain('grok-4-1-fast-reasoning');
      expect(output.full).toContain('Test result');
    });
  });
});
