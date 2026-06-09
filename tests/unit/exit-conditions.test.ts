/**
 * Exit condition unit tests — confidence streak, all gates pass, command success.
 */

import { describe, it, expect } from 'vitest';
import { evaluateExitConditions } from '../../src/loop-engine/exit-conditions.js';
import type { LoopDiskState } from '../../src/loop-engine/loop-memory.js';

function baseMemory(overrides: Partial<LoopDiskState> = {}): LoopDiskState {
  return {
    loopId: 'test-loop',
    goal: 'Test goal',
    templateId: 'test',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    iteration: 1,
    confidenceStreak: 0,
    confidenceHistory: [],
    betweenIterationRuns: [],
    exitConditionStatus: [],
    reflections: [],
    ...overrides,
  };
}

describe('evaluateExitConditions', () => {
  it('exits when all_gates_pass and evaluation accepted', () => {
    const result = evaluateExitConditions([{ type: 'all_gates_pass' }], {
      iteration: 1,
      maxIterations: 5,
      evaluation: {
        pass: true,
        accepted: true,
        confidence: 0.9,
        summary: 'ok',
        startedAt: 0,
        completedAt: 1,
        durationMs: 1,
        strategies: [],
        gates: [],
      },
      memory: baseMemory({ confidenceStreak: 1 }),
    });

    expect(result.shouldExit).toBe(true);
    expect(result.statuses[0].met).toBe(true);
  });

  it('requires consecutive confidence streak when configured', () => {
    const conditions = [
      {
        type: 'confidence_streak' as const,
        minConfidence: 0.85,
        consecutiveIterations: 2,
      },
    ];

    const first = evaluateExitConditions(conditions, {
      iteration: 1,
      maxIterations: 5,
      memory: baseMemory({ confidenceStreak: 1, confidenceHistory: [0.9] }),
    });
    expect(first.shouldExit).toBe(false);

    const second = evaluateExitConditions(conditions, {
      iteration: 2,
      maxIterations: 5,
      memory: baseMemory({ confidenceStreak: 2, confidenceHistory: [0.9, 0.92] }),
    });
    expect(second.shouldExit).toBe(true);
  });

  it('evaluates command_success from between-iteration run', () => {
    const result = evaluateExitConditions(
      [{ type: 'command_success', command: 'npm test' }],
      {
        iteration: 1,
        maxIterations: 3,
        memory: baseMemory(),
        lastBetweenRun: {
          iteration: 1,
          command: 'npm test',
          exitCode: 0,
          stdout: 'pass',
          stderr: '',
          at: Date.now(),
          durationMs: 10,
        },
      },
    );

    expect(result.shouldExit).toBe(true);
    expect(result.statuses[0].met).toBe(true);
  });

  it('defaults to all_gates_pass when no conditions configured', () => {
    const fail = evaluateExitConditions(undefined, {
      iteration: 1,
      maxIterations: 1,
      evaluation: {
        pass: false,
        accepted: false,
        confidence: 0.3,
        summary: 'fail',
        startedAt: 0,
        completedAt: 1,
        durationMs: 1,
        strategies: [],
        gates: [],
      },
      memory: baseMemory(),
    });
    expect(fail.shouldExit).toBe(false);

    const pass = evaluateExitConditions(undefined, {
      iteration: 1,
      maxIterations: 1,
      evaluation: {
        pass: true,
        accepted: true,
        confidence: 0.95,
        summary: 'ok',
        startedAt: 0,
        completedAt: 1,
        durationMs: 1,
        strategies: [],
        gates: [],
      },
      memory: baseMemory(),
    });
    expect(pass.shouldExit).toBe(true);
  });

  it('combines multiple conditions with AND semantics', () => {
    const conditions = [
      { type: 'all_gates_pass' as const },
      { type: 'confidence_streak' as const, consecutiveIterations: 2, minConfidence: 0.85 },
    ];

    const partial = evaluateExitConditions(conditions, {
      iteration: 1,
      maxIterations: 5,
      evaluation: {
        pass: true,
        accepted: true,
        confidence: 0.9,
        summary: 'ok',
        startedAt: 0,
        completedAt: 1,
        durationMs: 1,
        strategies: [],
        gates: [],
      },
      memory: baseMemory({ confidenceStreak: 1 }),
    });
    expect(partial.shouldExit).toBe(false);
    expect(partial.statuses.filter((s) => s.met).length).toBe(1);
  });
});
