/**
 * Unit Tests: Performance Monitor
 * Tests metrics collection, aggregation, and reporting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor } from '../src/utils/performance-monitor';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    PerformanceMonitor.reset();
  });

  describe('record()', () => {
    it('should record single metric', () => {
      PerformanceMonitor.record(
        'architect',
        'Ultrapilot',
        'xai',
        500,    // latency
        1000,   // tokens
        0.001,  // cost
        true    // success
      );

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCalls).toBe(1);
    });

    it('should record multiple metrics', () => {
      for (let i = 0; i < 5; i++) {
        PerformanceMonitor.record(
          'executor',
          'Ultrapilot',
          'anthropic',
          600 + i * 10,
          1200 + i * 100,
          0.002,
          true
        );
      }

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCalls).toBe(5);
    });

    it('should track both successes and failures', () => {
      PerformanceMonitor.record('architect', 'Ultrapilot', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('executor', 'Ultrapilot', 'xai', 600, 1100, 0.002, false);

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCalls).toBe(2);
      expect(metrics.successfulCalls).toBe(1);
    });
  });

  describe('getGlobalMetrics()', () => {
    it('should calculate success rate', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 600, 1100, 0.002, true);
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 400, 900, 0.001, false);

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.successRate).toBeCloseTo(66.67, 1);
    });

    it('should calculate average latency', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 700, 1200, 0.002, true);

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.avgLatency).toBeCloseTo(600, 1);
    });

    it('should track latency range', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 300, 1000, 0.001, true);
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 700, 1100, 0.002, true);

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.minLatency).toBe(300);
      expect(metrics.maxLatency).toBe(700);
    });

    it('should sum total tokens', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 600, 2000, 0.002, true);

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalTokens).toBe(3000);
    });

    it('should sum total cost', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.123, true);
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 600, 1100, 0.456, true);

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCost).toBeCloseTo(0.579, 3);
    });

    it('should return zero when no calls', () => {
      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCalls).toBe(0);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.totalCost).toBe(0);
    });
  });

  describe('getAgentMetrics()', () => {
    it('should get metrics for specific agent', () => {
      PerformanceMonitor.record('architect', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('executor', 'Ultra', 'xai', 600, 1100, 0.002, true);

      const archMetrics = PerformanceMonitor.getAgentMetrics('architect');
      expect(archMetrics).not.toBeNull();
      expect(archMetrics?.totalCalls).toBe(1);
    });

    it('should calculate agent-specific stats', () => {
      PerformanceMonitor.record('researcher', 'Ultra', 'xai', 400, 2000, 0.003, true);
      PerformanceMonitor.record('researcher', 'Ultra', 'xai', 600, 1500, 0.002, true);
      PerformanceMonitor.record('researcher', 'Ultra', 'xai', 500, 1800, 0.002, false);

      const metrics = PerformanceMonitor.getAgentMetrics('researcher');
      expect(metrics?.totalCalls).toBe(3);
      expect(metrics?.successfulCalls).toBe(2);
      expect(metrics?.avgLatency).toBeCloseTo(500, 1);
    });

    it('should return null for unknown agent', () => {
      const metrics = PerformanceMonitor.getAgentMetrics('unknown-agent');
      expect(metrics).toBeNull();
    });
  });

  describe('getModeMetrics()', () => {
    it('should get metrics for specific mode', () => {
      PerformanceMonitor.record('arch', 'Ultrapilot', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('exec', 'Swarm', 'xai', 600, 1100, 0.002, true);

      const ultraMetrics = PerformanceMonitor.getModeMetrics('Ultrapilot');
      expect(ultraMetrics).not.toBeNull();
      expect(ultraMetrics?.totalCalls).toBe(1);
    });

    it('should aggregate mode statistics', () => {
      PerformanceMonitor.record('arch', 'Pipeline', 'xai', 400, 1000, 0.001, true);
      PerformanceMonitor.record('exec', 'Pipeline', 'xai', 600, 1200, 0.002, true);
      PerformanceMonitor.record('plan', 'Pipeline', 'xai', 500, 1100, 0.001, true);

      const metrics = PerformanceMonitor.getModeMetrics('Pipeline');
      expect(metrics?.totalCalls).toBe(3);
      expect(metrics?.totalTokens).toBe(3300);
    });

    it('should return null for unknown mode', () => {
      const metrics = PerformanceMonitor.getModeMetrics('unknown-mode');
      expect(metrics).toBeNull();
    });
  });

  describe('getProviderMetrics()', () => {
    it('should get metrics for specific provider', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('exec', 'Ultra', 'anthropic', 600, 1100, 0.002, true);

      const xaiMetrics = PerformanceMonitor.getProviderMetrics('xai');
      expect(xaiMetrics).not.toBeNull();
      expect(xaiMetrics?.totalCalls).toBe(1);
    });

    it('should track provider reliability', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'openai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('arch', 'Ultra', 'openai', 600, 1100, 0.002, true);
      PerformanceMonitor.record('arch', 'Ultra', 'openai', 700, 1200, 0.003, false);

      const metrics = PerformanceMonitor.getProviderMetrics('openai');
      expect(metrics?.totalCalls).toBe(3);
      expect(metrics?.successRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('getTopAgents()', () => {
    it('should return top agents by call count', () => {
      for (let i = 0; i < 5; i++) {
        PerformanceMonitor.record('architect', 'Ultra', 'xai', 500, 1000, 0.001, true);
      }
      for (let i = 0; i < 3; i++) {
        PerformanceMonitor.record('executor', 'Ultra', 'xai', 600, 1100, 0.002, true);
      }
      for (let i = 0; i < 2; i++) {
        PerformanceMonitor.record('researcher', 'Ultra', 'xai', 700, 1200, 0.001, true);
      }

      const topAgents = PerformanceMonitor.getTopAgents(3);
      expect(topAgents.length).toBe(3);
      expect(topAgents[0].agent).toBe('architect');
      expect(topAgents[0].calls).toBe(5);
    });

    it('should handle limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        PerformanceMonitor.record('architect', 'Ultra', 'xai', 500, 1000, 0.001, true);
        PerformanceMonitor.record('executor', 'Ultra', 'xai', 600, 1100, 0.002, true);
        PerformanceMonitor.record('researcher', 'Ultra', 'xai', 700, 1200, 0.001, true);
      }

      const top2 = PerformanceMonitor.getTopAgents(2);
      expect(top2.length).toBe(2);

      const top5 = PerformanceMonitor.getTopAgents(5);
      expect(top5.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getSlowestAgents()', () => {
    it('should return slowest agents by latency', () => {
      PerformanceMonitor.record('architect', 'Ultra', 'xai', 300, 1000, 0.001, true);
      PerformanceMonitor.record('executor', 'Ultra', 'xai', 800, 1100, 0.002, true);
      PerformanceMonitor.record('researcher', 'Ultra', 'xai', 600, 1200, 0.001, true);

      const slowest = PerformanceMonitor.getSlowestAgents(1);
      expect(slowest[0].agent).toBe('executor');
      expect(slowest[0].avgLatency).toBe(800);
    });
  });

  describe('getMostExpensiveProviders()', () => {
    it('should rank providers by cost', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.1, true);
      PerformanceMonitor.record('arch', 'Ultra', 'anthropic', 600, 1100, 0.5, true);
      PerformanceMonitor.record('arch', 'Ultra', 'openai', 700, 1200, 0.3, true);

      const expensive = PerformanceMonitor.getMostExpensiveProviders(3);
      expect(expensive[0].provider).toBe('anthropic');
      expect(expensive[0].totalCost).toBeCloseTo(0.5, 3);
    });
  });

  describe('generateDashboard()', () => {
    it('should generate dashboard string', () => {
      PerformanceMonitor.record('architect', 'Ultrapilot', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('executor', 'Ultrapilot', 'xai', 600, 1100, 0.002, true);

      const dashboard = PerformanceMonitor.generateDashboard();
      
      expect(typeof dashboard).toBe('string');
      expect(dashboard).toContain('PERFORMANCE');
      expect(dashboard).toContain('architect');
      expect(dashboard).toContain('executor');
    });

    it('should include global metrics in dashboard', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, true);

      const dashboard = PerformanceMonitor.generateDashboard();
      expect(dashboard).toContain('Global');
      expect(dashboard).toContain('Calls');
    });

    it('should include agent rankings', () => {
      PerformanceMonitor.record('architect', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('executor', 'Ultra', 'xai', 600, 1100, 0.002, true);

      const dashboard = PerformanceMonitor.generateDashboard();
      expect(dashboard).toContain('Top Agents');
    });
  });

  describe('reset()', () => {
    it('should clear all metrics', () => {
      PerformanceMonitor.record('architect', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.reset();

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCalls).toBe(0);
    });

    it('should reset agent metrics', () => {
      PerformanceMonitor.record('architect', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.reset();

      const metrics = PerformanceMonitor.getAgentMetrics('architect');
      expect(metrics).toBeNull();
    });
  });

  describe('Multi-Provider Scenarios', () => {
    it('should track metrics across providers', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, true);
      PerformanceMonitor.record('arch', 'Ultra', 'anthropic', 600, 1100, 0.002, true);
      PerformanceMonitor.record('arch', 'Ultra', 'openai', 700, 1200, 0.003, true);

      const global = PerformanceMonitor.getGlobalMetrics();
      expect(global.totalCalls).toBe(3);

      expect(PerformanceMonitor.getProviderMetrics('xai')).not.toBeNull();
      expect(PerformanceMonitor.getProviderMetrics('anthropic')).not.toBeNull();
      expect(PerformanceMonitor.getProviderMetrics('openai')).not.toBeNull();
    });

    it('should provide provider comparison data', () => {
      // xAI: fast, cheap
      for (let i = 0; i < 5; i++) {
        PerformanceMonitor.record('arch', 'Ultra', 'xai', 400, 1000, 0.001, true);
      }

      // Anthropic: slow, expensive
      for (let i = 0; i < 5; i++) {
        PerformanceMonitor.record('arch', 'Ultra', 'anthropic', 900, 1500, 0.005, true);
      }

      const xai = PerformanceMonitor.getProviderMetrics('xai');
      const anthropic = PerformanceMonitor.getProviderMetrics('anthropic');

      expect(xai?.avgLatency).toBeLessThan(anthropic?.avgLatency!);
      expect(xai?.avgCostPerCall).toBeLessThan(anthropic?.avgCostPerCall!);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero latency', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 0, 1000, 0.001, true);
      
      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.minLatency).toBe(0);
    });

    it('should handle large token counts', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000000, 0.100, true);
      
      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalTokens).toBe(1000000);
    });

    it('should handle small costs', () => {
      PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 100, 0.00001, true);
      
      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCost).toBeCloseTo(0.00001, 7);
    });

    it('should handle 100% success rate', () => {
      for (let i = 0; i < 10; i++) {
        PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, true);
      }

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.successRate).toBe(100);
    });

    it('should handle 0% success rate', () => {
      for (let i = 0; i < 5; i++) {
        PerformanceMonitor.record('arch', 'Ultra', 'xai', 500, 1000, 0.001, false);
      }

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.successRate).toBe(0);
    });
  });

  describe('Accuracy Tests', () => {
    it('should calculate metrics accurately with mixed data', () => {
      // Simulate realistic mixed calls
      const testCalls = [
        { agent: 'arch', mode: 'Ultra', provider: 'xai', latency: 523, tokens: 1450, cost: 0.000234, success: true },
        { agent: 'exec', mode: 'Ultra', provider: 'anthropic', latency: 612, tokens: 1890, cost: 0.000567, success: true },
        { agent: 'research', mode: 'Swarm', provider: 'openai', latency: 789, tokens: 2100, cost: 0.001234, success: false },
      ];

      testCalls.forEach(call => {
        PerformanceMonitor.record(
          call.agent,
          call.mode,
          call.provider,
          call.latency,
          call.tokens,
          call.cost,
          call.success
        );
      });

      const metrics = PerformanceMonitor.getGlobalMetrics();
      expect(metrics.totalCalls).toBe(3);
      expect(metrics.successfulCalls).toBe(2);
      expect(metrics.totalTokens).toBe(5440);
      expect(metrics.totalCost).toBeCloseTo(0.002035, 6);
    });
  });
});
