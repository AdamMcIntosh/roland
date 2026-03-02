/**
 * E2E Tests: Recipe Session Lifecycle
 *
 * Tests the complete recipe session flow through RecipeSessionManager:
 * start → advance → advance → ... → summary.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RecipeSessionManager, type ParsedRecipe } from '../../src/server/recipe-session.js';

const SAMPLE_RECIPE: ParsedRecipe = {
  name: 'TestRecipe',
  description: 'A minimal two-step recipe for testing',
  subagents: [
    { name: 'Planner', prompt: 'Plan the task: {{user_task}}' },
    { name: 'Executor', prompt: 'Execute the plan from Planner.' },
  ],
  steps: [
    { agent: 'Planner', input: '{{user_task}}', output_to: 'Executor' },
    { agent: 'Executor', final_output: true },
  ],
};

describe('E2E: Recipe Session Lifecycle', () => {
  let manager: RecipeSessionManager;

  beforeEach(() => {
    manager = new RecipeSessionManager();
  });

  it('should start a session and return the first step prompt', () => {
    const step = manager.startSession(SAMPLE_RECIPE, 'Build a todo app');

    expect(step.session_id).toBeDefined();
    expect(step.step_number).toBe(0);
    expect(step.total_steps).toBe(2);
    expect(step.agent_name).toBe('planner');
    expect(step.recipe_name).toBe('TestRecipe');
    expect(step.is_final).toBe(false);
    expect(step.user_prompt).toContain('Build a todo app');
  });

  it('should advance through all steps and return a summary', () => {
    const step1 = manager.startSession(SAMPLE_RECIPE, 'Build a CLI tool');

    const step2 = manager.advanceSession(step1.session_id, 'Here is the plan...');
    expect('agent_name' in step2).toBe(true);
    if ('agent_name' in step2) {
      expect(step2.agent_name).toBe('executor');
      expect(step2.is_final).toBe(true);
    }

    const summary = manager.advanceSession(step1.session_id, 'Executed successfully.');
    expect('status' in summary).toBe(true);
    if ('status' in summary) {
      expect(summary.status).toBe('completed');
      expect(summary.steps_executed).toBe(2);
      expect(summary.recipe_name).toBe('TestRecipe');
      expect(summary.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('should track cost data through the session', () => {
    const step1 = manager.startSession(SAMPLE_RECIPE, 'Test cost tracking');

    manager.advanceSession(step1.session_id, 'Plan output', {
      input_tokens: 100,
      output_tokens: 200,
      cost: 0.01,
      model: 'claude-3-5-sonnet',
    });

    const summary = manager.advanceSession(step1.session_id, 'Execution output', {
      input_tokens: 150,
      output_tokens: 300,
      cost: 0.02,
      model: 'claude-3-5-sonnet',
    });

    expect('cost' in summary).toBe(true);
    if ('cost' in summary) {
      expect(summary.cost.total_input_tokens).toBe(250);
      expect(summary.cost.total_output_tokens).toBe(500);
      expect(summary.cost.total_cost).toBeCloseTo(0.03, 4);
      expect(summary.cost.per_step.length).toBe(2);
    }
  });

  it('should throw when advancing a non-existent session', () => {
    expect(() =>
      manager.advanceSession('non-existent-session-id', 'output')
    ).toThrow(/Session not found/);
  });

  it('should support multiple concurrent sessions', () => {
    const s1 = manager.startSession(SAMPLE_RECIPE, 'Task A');
    const s2 = manager.startSession(SAMPLE_RECIPE, 'Task B');

    expect(s1.session_id).not.toBe(s2.session_id);
    expect(s1.user_prompt).toContain('Task A');
    expect(s2.user_prompt).toContain('Task B');

    const s1step2 = manager.advanceSession(s1.session_id, 'Plan A');
    const s2step2 = manager.advanceSession(s2.session_id, 'Plan B');

    expect('agent_name' in s1step2).toBe(true);
    expect('agent_name' in s2step2).toBe(true);
  });
});

describe('E2E: Recipe with Loop Condition', () => {
  const loopRecipe: ParsedRecipe = {
    name: 'LoopRecipe',
    description: 'Recipe that can loop',
    subagents: [
      { name: 'Builder', prompt: 'Build it.' },
      { name: 'Reviewer', prompt: 'Review the build.' },
    ],
    steps: [
      { agent: 'Builder', output_to: 'Reviewer' },
      { agent: 'Reviewer', loop_if: 'issues found', loop_to: 'Builder', final_output: true },
    ],
    settings: { max_loops: 3 },
  };

  it('should start and complete a loop-capable recipe', () => {
    const manager = new RecipeSessionManager();
    const step1 = manager.startSession(loopRecipe, 'Build with review');

    expect(step1.agent_name).toBe('builder');

    const step2 = manager.advanceSession(step1.session_id, 'Built the feature.');
    expect('agent_name' in step2).toBe(true);
    if ('agent_name' in step2) {
      expect(step2.agent_name).toBe('reviewer');
    }

    const result = manager.advanceSession(step1.session_id, 'Looks good, approved.');
    expect('status' in result || 'agent_name' in result).toBe(true);
  });
});
