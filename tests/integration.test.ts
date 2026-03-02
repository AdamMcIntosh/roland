/**
 * Integration Tests — Config + Model Routing + Cost Tracking
 *
 * End-to-end integration of the core advisory pipeline:
 * config loading → complexity classification → model selection → cost tracking.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig, getConfig } from '../src/config/config-loader.js';
import { ModelRouter } from '../src/orchestrator/model-router.js';
import { ComplexityClassifier } from '../src/orchestrator/complexity-classifier.js';
import { AdvancedCostTracker } from '../src/orchestrator/advanced-cost-tracker.js';

describe('Integration: Config → Router → Cost Pipeline', () => {
  beforeAll(async () => {
    await loadConfig();
  });

  it('should load config and expose routing section', () => {
    const cfg = getConfig();
    expect(cfg).toBeDefined();
    expect(cfg).toHaveProperty('routing');
  });

  it('should classify then route a simple query', () => {
    const query = 'rename this variable';
    const analysis = ComplexityClassifier.analyzeQuery(query);
    expect(analysis.complexity).toBe('simple');

    const selection = ModelRouter.selectModel({ query, agentName: 'executor' });
    expect(selection.model).toBeDefined();
  });

  it('should classify then route a complex query', () => {
    const query =
      'Design a distributed event-driven microservices architecture with real-time machine learning inference pipeline, concurrent processing, and scalability optimizations';
    const analysis = ComplexityClassifier.analyzeQuery(query);
    expect(['medium', 'complex']).toContain(analysis.complexity);

    const result = ModelRouter.routeByComplexity(query);
    expect(result.selected.model).toBeDefined();
  });

  it('should track costs across multiple routing decisions', () => {
    const tracker = new AdvancedCostTracker();
    const queries = [
      { q: 'fix typo', agent: 'executor' },
      { q: 'design the API schema', agent: 'architect' },
      { q: 'write unit tests', agent: 'qa-tester' },
    ];

    for (const { q, agent } of queries) {
      const result = ModelRouter.routeByComplexity(q);
      tracker.recordCost(result.selected.model, 'ide', agent, 100, 50, 0.01);
    }

    const summary = tracker.getSummary();
    expect(summary.recordCount).toBe(3);
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(Object.keys(summary.agentCosts).length).toBe(3);
  });
});

describe('Integration: Complexity Score Consistency', () => {
  it('should produce monotonically increasing scores for increasing complexity', () => {
    const simple = ComplexityClassifier.analyzeQuery('fix a bug');
    const medium = ComplexityClassifier.analyzeQuery('refactor the authentication module');
    const complex = ComplexityClassifier.analyzeQuery(
      'Design distributed microservices with machine learning data pipeline and real-time scalability'
    );

    expect(simple.score).toBeLessThanOrEqual(medium.score);
    expect(medium.score).toBeLessThanOrEqual(complex.score);
  });
});
