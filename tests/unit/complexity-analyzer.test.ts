/**
 * Unit Tests: Complexity Analyzer
 * Tests the query complexity scoring algorithm and agent recommendations
 */

import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer } from '../src/utils/complexity-analyzer';

describe('ComplexityAnalyzer', () => {
  describe('analyze() - Query Complexity Scoring', () => {
    it('should score simple queries as simple', () => {
      const result = ComplexityAnalyzer.analyze('hello');
      expect(result.level).toBe('simple');
      expect(result.score).toBeLessThan(40);
    });

    it('should score medium queries as medium', () => {
      const result = ComplexityAnalyzer.analyze('build a REST API with user authentication');
      expect(result.level).toBe('medium');
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.score).toBeLessThan(70);
    });

    it('should score complex queries as complex', () => {
      const result = ComplexityAnalyzer.analyze(
        'design a distributed microservices architecture with service mesh, ' +
        'event sourcing, CQRS pattern, distributed tracing, and comprehensive monitoring'
      );
      expect(result.level).toBe('complex');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('should include reasoning in result', () => {
      const result = ComplexityAnalyzer.analyze('test query');
      expect(result).toHaveProperty('factors');
      expect(result.factors).toHaveProperty('length');
      expect(result.factors).toHaveProperty('technicalTerms');
      expect(result.factors).toHaveProperty('multiStep');
    });

    it('should handle empty query', () => {
      const result = ComplexityAnalyzer.analyze('');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should handle very long query', () => {
      const longQuery = 'test '.repeat(1000);
      const result = ComplexityAnalyzer.analyze(longQuery);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.level).toBeDefined();
    });

    it('should detect technical keywords', () => {
      const queries = [
        { query: 'authentication', expected: true },
        { query: 'microservices', expected: true },
        { query: 'kubernetes', expected: true },
        { query: 'hello world', expected: false },
      ];

      queries.forEach(({ query, expected }) => {
        const result = ComplexityAnalyzer.analyze(query);
        const hasTechTerms = result.factors.technicalTerms > 0;
        expect(hasTechTerms).toBe(expected);
      });
    });

    it('should detect multi-step patterns', () => {
      const result = ComplexityAnalyzer.analyze('first do this, then that, and finally this');
      expect(result.factors.multiStep).toBeGreaterThan(0);
    });
  });

  describe('recommendAgentsForMode()', () => {
    it('should recommend 2 agents for simple ultrapilot', () => {
      const agents = ComplexityAnalyzer.recommendAgentsForMode('simple', 'ultrapilot');
      expect(agents.length).toBe(2);
      expect(agents).toContain('architect');
      expect(agents).toContain('executor');
    });

    it('should recommend 3 agents for medium ultrapilot', () => {
      const agents = ComplexityAnalyzer.recommendAgentsForMode('medium', 'ultrapilot');
      expect(agents.length).toBe(3);
      expect(agents).toContain('architect');
      expect(agents).toContain('executor');
    });

    it('should recommend 5 agents for complex ultrapilot', () => {
      const agents = ComplexityAnalyzer.recommendAgentsForMode('complex', 'ultrapilot');
      expect(agents.length).toBe(5);
      expect(agents).toContain('architect');
      expect(agents).toContain('researcher');
      expect(agents).toContain('designer');
    });

    it('should recommend 3 agents for simple swarm', () => {
      const agents = ComplexityAnalyzer.recommendAgentsForMode('simple', 'swarm');
      expect(agents.length).toBe(3);
    });

    it('should recommend 5 agents for medium swarm', () => {
      const agents = ComplexityAnalyzer.recommendAgentsForMode('medium', 'swarm');
      expect(agents.length).toBe(5);
    });

    it('should recommend 8 agents for complex swarm', () => {
      const agents = ComplexityAnalyzer.recommendAgentsForMode('complex', 'swarm');
      expect(agents.length).toBe(8);
      expect(agents).toContain('architect');
      expect(agents).toContain('critic');
      expect(agents).toContain('planner');
    });

    it('should include executor in all recommendations', () => {
      const modes = ['ultrapilot', 'swarm', 'autopilot', 'pipeline'];
      const levels = ['simple', 'medium', 'complex'];

      modes.forEach(mode => {
        levels.forEach(level => {
          const agents = ComplexityAnalyzer.recommendAgentsForMode(level, mode);
          expect(agents).toContain('executor');
        });
      });
    });

    it('should throw error for invalid mode', () => {
      expect(() => {
        ComplexityAnalyzer.recommendAgentsForMode('simple', 'invalid-mode' as any);
      }).toThrow();
    });

    it('should throw error for invalid level', () => {
      expect(() => {
        ComplexityAnalyzer.recommendAgentsForMode('invalid-level' as any, 'ultrapilot');
      }).toThrow();
    });
  });

  describe('calculateAgentCost()', () => {
    it('should estimate cost for agent pool', () => {
      const cost = ComplexityAnalyzer.calculateAgentCost(
        ['architect', 'executor'],
        'grok-3-mini',
        2000
      );

      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });

    it('should scale cost with agent count', () => {
      const cost2Agents = ComplexityAnalyzer.calculateAgentCost(
        ['architect', 'executor'],
        'grok-3',
        1000
      );

      const cost4Agents = ComplexityAnalyzer.calculateAgentCost(
        ['architect', 'executor', 'researcher', 'designer'],
        'grok-3',
        1000
      );

      expect(cost4Agents).toBeGreaterThan(cost2Agents);
    });

    it('should scale cost with token count', () => {
      const cost1k = ComplexityAnalyzer.calculateAgentCost(
        ['architect', 'executor'],
        'grok-3',
        1000
      );

      const cost2k = ComplexityAnalyzer.calculateAgentCost(
        ['architect', 'executor'],
        'grok-3',
        2000
      );

      expect(cost2k).toBeGreaterThan(cost1k);
    });

    it('should vary cost by model', () => {
      const agents = ['architect', 'executor'];
      const tokens = 1000;

      const costCheap = ComplexityAnalyzer.calculateAgentCost(agents, 'grok-3-mini', tokens);
      const costExpensive = ComplexityAnalyzer.calculateAgentCost(agents, 'claude-4.5-sonnet', tokens);

      expect(costExpensive).toBeGreaterThan(costCheap);
    });
  });

  describe('scoreAndRecommend()', () => {
    it('should recommend simple ultrapilot for simple query', () => {
      const result = ComplexityAnalyzer.scoreAndRecommend('say hello', 'ultrapilot');

      expect(result.score).toBeLessThan(40);
      expect(result.level).toBe('simple');
      expect(result.agentCount).toBe(2);
      expect(result.agents.length).toBe(2);
    });

    it('should recommend complex swarm for complex query', () => {
      const result = ComplexityAnalyzer.scoreAndRecommend(
        'design distributed microservices with kubernetes and service mesh',
        'swarm'
      );

      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.level).toBe('complex');
      expect(result.agentCount).toBe(8);
      expect(result.agents.length).toBe(8);
    });

    it('should include cost estimate', () => {
      const result = ComplexityAnalyzer.scoreAndRecommend('test', 'ultrapilot');

      expect(result.estimatedCost).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it('should include optimization suggestions', () => {
      const simpleResult = ComplexityAnalyzer.scoreAndRecommend('hello', 'ultrapilot');
      const complexResult = ComplexityAnalyzer.scoreAndRecommend(
        'build distributed system with all features',
        'ultrapilot'
      );

      expect(simpleResult.optimization).toBeDefined();
      expect(complexResult.optimization).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle queries with special characters', () => {
      const result = ComplexityAnalyzer.analyze('test!@#$%^&*()');
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle Unicode queries', () => {
      const result = ComplexityAnalyzer.analyze('你好世界 🚀 مرحبا');
      expect(result).toBeDefined();
      expect(result.level).toBeDefined();
    });

    it('should handle very high complexity scores', () => {
      const veryComplexQuery = [
        'design and implement a globally distributed system with',
        'microservices architecture, event sourcing, CQRS pattern,',
        'service mesh, distributed tracing, observability stack,',
        'comprehensive monitoring, alerting, and incident response',
        'with kubernetes orchestration, auto-scaling, zero-downtime',
        'deployment, multi-region failover, disaster recovery',
      ].join(' ');

      const result = ComplexityAnalyzer.analyze(veryComplexQuery);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Consistency', () => {
    it('should score same query consistently', () => {
      const query = 'build a REST API with authentication';

      const result1 = ComplexityAnalyzer.analyze(query);
      const result2 = ComplexityAnalyzer.analyze(query);

      expect(result1.score).toBe(result2.score);
      expect(result1.level).toBe(result2.level);
    });

    it('should recommend same agents for same complexity', () => {
      const agents1 = ComplexityAnalyzer.recommendAgentsForMode('medium', 'ultrapilot');
      const agents2 = ComplexityAnalyzer.recommendAgentsForMode('medium', 'ultrapilot');

      expect(agents1).toEqual(agents2);
    });
  });
});
