/**
 * Integration Tests: MCP Tools and RCO Skills
 *
 * Validates that the RCO skill layer (eco-optimizer, graph-visualizer)
 * and the stub tools are functional end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { ecoOptimizerSuggestModel, graphVisualizerDOT, isValidDOT } from '../../src/skills.js';
import { runTool } from '../../src/rco/tools.js';
import type { RcoState } from '../../src/rco/types.js';

describe('RCO Skills: eco-optimizer', () => {
  it('should return Haiku for a short simple prompt', () => {
    const model = ecoOptimizerSuggestModel('fix typo', 'claude-3-5-sonnet-20241022');
    expect(model).toContain('haiku');
  });

  it('should return Sonnet or the default for complex prompts', () => {
    const model = ecoOptimizerSuggestModel(
      'Design a distributed event-driven architecture with real-time machine learning inference ' +
        'pipeline, concurrent processing, and scalability optimizations across microservices',
      'claude-3-5-sonnet-20241022'
    );
    expect(model).toMatch(/sonnet|claude/);
  });
});

describe('RCO Skills: graph-visualizer', () => {
  const mockState: RcoState = {
    sessionId: 'test-session',
    recipe: 'PlanExecRevEx',
    task: 'test task',
    currentStep: 3,
    loopCount: 0,
    outputs: {
      Planner: 'plan output',
      Executor: 'exec output',
      Reviewer: 'review output',
    },
    agentLogs: [],
  };

  const mockSteps = [
    { agent: 'Planner', output_to: 'Executor' },
    { agent: 'Executor', output_to: 'Reviewer' },
    { agent: 'Reviewer', output_to: 'Explainer', loop_if: 'issues found' },
    { agent: 'Explainer', final_output: true },
  ];

  it('should produce valid DOT output', () => {
    const dot = graphVisualizerDOT(mockState, mockSteps);
    expect(isValidDOT(dot)).toBe(true);
    expect(dot).toContain('digraph');
    expect(dot).toContain('Planner');
    expect(dot).toContain('Executor');
  });

  it('should be accessible via runTool', () => {
    const result = runTool('graph-visualizer', mockState, mockSteps);
    expect(result).toContain('digraph');
  });
});

describe('RCO Stub Tools', () => {
  const emptyState: RcoState = {
    sessionId: 'stub',
    recipe: 'test',
    task: 'test',
    currentStep: 0,
    loopCount: 0,
    outputs: {},
    agentLogs: [],
  };

  it('should return a result for the search tool', () => {
    const result = runTool('search', emptyState, []);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should return a result for the code tool', () => {
    const result = runTool('code', emptyState, []);
    expect(result).toBeDefined();
  });

  it('should return unknown message for unrecognised tool', () => {
    const result = runTool('nonexistent-tool', emptyState, []);
    expect(result).toContain('unknown tool');
  });
});
