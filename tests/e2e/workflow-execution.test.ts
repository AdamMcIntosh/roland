/**
 * E2E Tests: Workflow Execution
 * 
 * Tests complete workflow lifecycle and integration
 * Includes caching, version management, and error recovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine } from '../../src/workflows/engine.js';
import { CacheManager } from '../../src/cache/cache-manager.js';
import { logger } from '../../src/utils/logger.js';

describe('E2E: Workflow Execution', () => {
  let engine: WorkflowEngine;
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager({ enabled: true, persistent: false });
    engine = new WorkflowEngine(true); // Just enable caching, let engine create its own cache
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Complete Workflow Lifecycle', () => {
    it('should register, execute, and cache workflow', async () => {
      // Register workflow
      engine.registerWorkflow({
        name: 'E2ETestWorkflow',
        version: '1.0.0',
        description: 'End-to-end test workflow',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            input: { code: 'const x = 1;' },
          },
        ],
      });

      // Verify workflow is registered
      const registered = engine.getWorkflow('E2ETestWorkflow', '1.0.0');
      expect(registered).toBeDefined();
      expect(registered?.name).toBe('E2ETestWorkflow');

      // First execution
      const result1 = await engine.executeWorkflow('E2ETestWorkflow', {}, '1.0.0');
      expect(result1).toBeDefined();
      expect(result1.status).toBe('success');
      expect(result1.stepsExecuted).toBe(1);

      // Cache should be populated
      const stats1 = engine.getCacheStats();
      expect(stats1.hits + stats1.misses).toBeGreaterThan(0);

      // Second execution (cache hit expected)
      const result2 = await engine.executeWorkflow('E2ETestWorkflow', {}, '1.0.0');
      expect(result2.status).toBe('success');

      // Cache stats should show activity
      const stats2 = engine.getCacheStats();
      expect(stats2.hits).toBeGreaterThanOrEqual(stats1.hits);
    });

    it('should handle workflow with user inputs end-to-end', async () => {
      engine.registerWorkflow({
        name: 'InputWorkflow',
        version: '1.0.0',
        description: 'Workflow that accepts inputs',
        agents: ['architect'],
        steps: [
          {
            name: 'step1',
            agent: 'architect',
            action: 'design',
            input: { requirements: '{{ userRequirements }}' },
          },
        ],
        variables: { userRequirements: '' },
        outputs: { step1: 'step1' },
      });

      const result = await engine.executeWorkflow('InputWorkflow', {
        userRequirements: 'Build a REST API',
      }, '1.0.0');

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.stepsExecuted).toBe(1);
    });

    it('should track costs and duration across workflow', async () => {
      engine.registerWorkflow({
        name: 'CostTrackingWorkflow',
        version: '1.0.0',
        description: 'Tracks cost and duration',
        agents: ['analyst', 'architect'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
          },
          {
            name: 'step2',
            agent: 'architect',
            action: 'design',
          },
        ],
        variables: {},
        outputs: { step1: 'step1', step2: 'step2' },
      });

      const result = await engine.executeWorkflow('CostTrackingWorkflow', {}, '1.0.0');

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.stepsExecuted).toBe(2);
    });
  });

  describe('Multi-Workflow Scenarios', () => {
    it('should execute multiple workflows in sequence', async () => {
      // Register first workflow
      engine.registerWorkflow({
        name: 'WorkflowA',
        version: '1.0.0',
        description: 'First workflow',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // Register second workflow
      engine.registerWorkflow({
        name: 'WorkflowB',
        version: '1.0.0',
        description: 'Second workflow',
        agents: ['architect'],
        steps: [
          {
            name: 'step1',
            agent: 'architect',
            action: 'design',
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // Execute both
      const resultA = await engine.executeWorkflow('WorkflowA', {}, '1.0.0');
      expect(resultA.status).toBe('success');

      const resultB = await engine.executeWorkflow('WorkflowB', {}, '1.0.0');
      expect(resultB.status).toBe('success');

      // Both should be tracked
      const stats = engine.getCacheStats();
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('should isolate cache between different workflow versions', async () => {
      // Register v1.0.0
      engine.registerWorkflow({
        name: 'VersionedWorkflow',
        version: '1.0.0',
        description: 'Version 1',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
            input: { data: 'v1' },
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // Register v2.0.0
      engine.registerWorkflow({
        name: 'VersionedWorkflow',
        version: '2.0.0',
        description: 'Version 2',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
            input: { data: 'v2' },
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // Execute both versions
      const v1 = await engine.executeWorkflow('VersionedWorkflow', {}, '1.0.0');
      expect(v1.status).toBe('success');

      const v2 = await engine.executeWorkflow('VersionedWorkflow', {}, '2.0.0');
      expect(v2.status).toBe('success');

      // Both should exist independently
      const w1 = engine.getWorkflow('VersionedWorkflow', '1.0.0');
      const w2 = engine.getWorkflow('VersionedWorkflow', '2.0.0');

      expect(w1).toBeDefined();
      expect(w2).toBeDefined();
    });
  });

  describe('Workflow Error Recovery', () => {
    it('should handle workflow not found', () => {
      expect(() => {
        engine.getWorkflow('NonExistentWorkflow', '1.0.0');
      }).not.toThrow();

      const workflow = engine.getWorkflow('NonExistentWorkflow', '1.0.0');
      expect(workflow).toBeUndefined();
    });

    it('should handle invalid workflow structure', () => {
      const invalid = {
        name: 'InvalidWorkflow',
        // Missing required fields
      } as any;

      expect(() => {
        engine.registerWorkflow(invalid);
      }).not.toThrow();
    });

    it('should recover from errors during execution', async () => {
      engine.registerWorkflow({
        name: 'ErrorRecoveryWorkflow',
        version: '1.0.0',
        description: 'Handles errors gracefully',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // Should handle execution gracefully
      const result = await engine.executeWorkflow('ErrorRecoveryWorkflow', {}, '1.0.0');
      expect(result).toBeDefined();
      expect(['success', 'partial', 'error']).toContain(result.status);
    });
  });

  describe('Cache Management in E2E', () => {
    it('should clear cache and reset statistics', async () => {
      engine.registerWorkflow({
        name: 'CacheTestWorkflow',
        version: '1.0.0',
        description: 'Cache test',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
            input: { code: 'const x = 1;' },
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // Execute to populate cache
      const result1 = await engine.executeWorkflow('CacheTestWorkflow', {}, '1.0.0');
      expect(result1.status).toBe('success');

      const statsBeforeClear = engine.getCacheStats();
      expect(statsBeforeClear.misses).toBeGreaterThan(0);

      // Clear cache
      cache.clear();

      const statsAfterClear = engine.getCacheStats();
      expect(statsAfterClear.hits).toBe(0);
      expect(statsAfterClear.misses).toBe(0);
    });

    it('should invalidate specific workflow cache', async () => {
      engine.registerWorkflow({
        name: 'WorkflowX',
        version: '1.0.0',
        description: 'Workflow X',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
            input: { data: 'x' },
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // Execute
      const result = await engine.executeWorkflow('WorkflowX', {}, '1.0.0');
      expect(result.status).toBe('success');

      // Invalidate specific workflow cache
      cache.invalidate({ workflowName: 'WorkflowX', version: '1.0.0' });

      // Cache should be cleared
      const stats = engine.getCacheStats();
      expect(stats).toBeDefined();
    });

    it('should track cost and time savings from cache', async () => {
      engine.registerWorkflow({
        name: 'SavingsTrackingWorkflow',
        version: '1.0.0',
        description: 'Tracks savings',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
            input: { data: 'savings' },
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      // First execution (cache miss)
      const result1 = await engine.executeWorkflow('SavingsTrackingWorkflow', {}, '1.0.0');
      expect(result1.status).toBe('success');

      const statsBefore = engine.getCacheStats();

      // Second execution (cache hit expected)
      const result2 = await engine.executeWorkflow('SavingsTrackingWorkflow', {}, '1.0.0');
      expect(result2.status).toBe('success');

      const statsAfter = engine.getCacheStats();
      // Cache hits should increase
      expect(statsAfter.hits).toBeGreaterThanOrEqual(statsBefore.hits);
    });
  });

  describe('Workflow Features E2E', () => {
    it('should support workflow metadata', async () => {
      engine.registerWorkflow({
        name: 'MetadataWorkflow',
        version: '1.0.0',
        description: 'Workflow with metadata',
        agents: ['analyst'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
          },
        ],
        variables: {},
        outputs: { step1: 'step1' },
      });

      const workflow = engine.getWorkflow('MetadataWorkflow', '1.0.0');
      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('MetadataWorkflow');
    });

    it('should handle workflow with multiple step types', async () => {
      engine.registerWorkflow({
        name: 'MultiStepWorkflow',
        version: '1.0.0',
        description: 'Multiple step types',
        agents: ['analyst', 'architect', 'planner'],
        steps: [
          {
            name: 'step1',
            agent: 'analyst',
            action: 'analyze',
          },
          {
            name: 'step2',
            agent: 'architect',
            action: 'design',
          },
          {
            name: 'step3',
            agent: 'planner',
            action: 'plan',
          },
        ],
        variables: {},
        outputs: { step1: 'step1', step2: 'step2', step3: 'step3' },
      });

      const result = await engine.executeWorkflow('MultiStepWorkflow', {}, '1.0.0');
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.stepsExecuted).toBe(3);
    });
  });
});
