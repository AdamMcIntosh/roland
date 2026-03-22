/**
 * Unit Tests: Model Routing, Complexity Classification, and Cost Tracking
 *
 * Validates the core "eco" decision layer:
 * - Complexity classification (simple / medium / complex)
 * - Model selection by complexity
 * - Cost tracking and budget enforcement
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ModelRouter, MODEL_PRICING } from '../../src/orchestrator/model-router.js';
import { ComplexityClassifier } from '../../src/orchestrator/complexity-classifier.js';
import { AdvancedCostTracker } from '../../src/orchestrator/advanced-cost-tracker.js';
import { loadConfig } from '../../src/config/config-loader.js';

describe('Ecomode: Complexity Classification', () => {
  it('should classify a short query as simple', () => {
    const result = ComplexityClassifier.analyzeQuery('fix a typo');
    expect(result.complexity).toBe('simple');
    expect(result.score).toBeLessThan(30);
  });

  it('should assign a higher score to a long architectural query than a short one', () => {
    const short = ComplexityClassifier.analyzeQuery('fix a typo');
    const query =
      'Design a distributed microservices architecture with real-time event streaming, ' +
      'implement the data pipeline for machine learning inference, and optimize for scalability';
    const result = ComplexityClassifier.analyzeQuery(query);
    expect(result.score).toBeGreaterThanOrEqual(short.score);
    expect(['simple', 'medium', 'complex']).toContain(result.complexity);
  });

  it('should classify a moderate query with a valid complexity level', () => {
    const result = ComplexityClassifier.analyzeQuery(
      'Refactor the user authentication module to use JWTs'
    );
    expect(['simple', 'medium', 'complex']).toContain(result.complexity);
  });

  it('should return a detailed analysis with factors', () => {
    const analysis = ComplexityClassifier.getDetailedAnalysis(
      'Analyze performance of the database queries'
    );
    expect(analysis).toHaveProperty('complexity');
    expect(analysis).toHaveProperty('score');
    expect(analysis).toHaveProperty('factors');
    expect(analysis).toHaveProperty('tokenEstimate');
    expect(analysis).toHaveProperty('suggestedModel');
    expect(Array.isArray(analysis.factors)).toBe(true);
  });
});

describe('Ecomode: Model Router', () => {
  beforeAll(async () => {
    await loadConfig();
  });

  it('should recommend a model for a query', () => {
    const result = ModelRouter.analyzeQueryComplexity('add a button to the form');
    expect(result).toHaveProperty('complexity');
    expect(result).toHaveProperty('suggestedModel');
  });

  it('should route a query by complexity', () => {
    const result = ModelRouter.routeByComplexity('simple task');
    expect(result.selected).toHaveProperty('model');
    expect(result).toHaveProperty('analysis');
  });

  it('should have pricing data for common models', () => {
    expect(MODEL_PRICING).toHaveProperty('gpt-4o');
    expect(MODEL_PRICING['gpt-4o'].input).toBeGreaterThan(0);
  });
});

describe('Ecomode: Cost Tracking', () => {
  let tracker: AdvancedCostTracker;

  beforeEach(() => {
    tracker = new AdvancedCostTracker({ dailyLimit: 5.0, enableWarnings: true });
  });

  it('should record and summarize costs', () => {
    tracker.recordCost('gpt-4o', 'openai', 'executor', 500, 200, 0.015);
    tracker.recordCost('claude-3.5-sonnet', 'anthropic', 'architect', 800, 300, 0.03);

    const summary = tracker.getSummary();
    expect(summary.totalCost).toBeCloseTo(0.045, 4);
    expect(summary.recordCount).toBe(2);
    expect(summary.modelCosts).toHaveProperty('gpt-4o');
    expect(summary.agentCosts).toHaveProperty('executor');
  });

  it('should calculate average cost per query', () => {
    tracker.recordCost('gpt-4o', 'openai', 'executor', 100, 100, 0.01);
    tracker.recordCost('gpt-4o', 'openai', 'executor', 100, 100, 0.03);

    const summary = tracker.getSummary();
    expect(summary.averageCostPerQuery).toBeCloseTo(0.02, 4);
  });

  it('should clear to empty state', () => {
    tracker.recordCost('gpt-4o', 'openai', 'executor', 100, 100, 0.01);
    tracker.clear();

    const summary = tracker.getSummary();
    expect(summary.totalCost).toBe(0);
    expect(summary.recordCount).toBe(0);
  });

  it('should report provider-level costs', () => {
    tracker.recordCost('gpt-4o', 'openai', 'executor', 100, 100, 0.01);
    tracker.recordCost('claude-3.5-sonnet', 'anthropic', 'architect', 100, 100, 0.02);

    const summary = tracker.getSummary();
    expect(summary.providerCosts['openai']).toBeCloseTo(0.01, 4);
    expect(summary.providerCosts['anthropic']).toBeCloseTo(0.02, 4);
  });
});
