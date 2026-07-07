import { describe, expect, it } from 'vitest';
import {
  createMissionBudgetGuard,
  resolveMissionBudget,
} from '../../src/rco/mission-budget.js';
import { buildRunUsage, buildTaskUsage, formatCostSummaryMarkdown } from '../../src/rco/usage-tracker.js';

describe('mission-budget', () => {
  it('CLI --budget overrides config ceiling', () => {
    const res = resolveMissionBudget({
      cliBudgetUsd: 3.5,
      maxIterations: 10,
      yaml: { mission_budget_usd: 5, estimated_per_iteration_cost_usd: 0.75 },
    });
    expect(res.ceilingUsd).toBe(3.5);
    expect(res.source).toBe('cli');
  });

  it('computes ceiling from maxIterations × estimated cost', () => {
    const res = resolveMissionBudget({
      maxIterations: 4,
      yaml: { estimated_per_iteration_cost_usd: 1.0 },
    });
    expect(res.ceilingUsd).toBe(4);
    expect(res.source).toBe('computed');
  });

  it('guard blocks before iteration when budget would be exceeded', () => {
    const guard = createMissionBudgetGuard({
      resolution: resolveMissionBudget({ cliBudgetUsd: 1.0, maxIterations: 5 }),
      stateDir: '.roland-test-budget',
    });
    guard.recordSpending(0.85);
    const check = guard.checkBeforeIteration(2);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/budget/i);
  });
});

describe('formatCostSummaryMarkdown', () => {
  it('includes cost, tokens, duration, and models in footer block', () => {
    const record = buildRunUsage({
      runId: 'abc',
      runStart: Date.now() - 60_000,
      runEnd: Date.now(),
      goal: 'test',
      wavesRun: 2,
      blockersEncountered: 0,
      tasks: [
        buildTaskUsage('t1', 'Task', 'coding', 'composer-2.5', 1000, 2000, 5000),
      ],
    });
    const md = formatCostSummaryMarkdown(record);
    expect(md).toContain('Cost Summary');
    expect(md).toContain('composer-2.5');
    expect(md).toContain('Duration');
  });
});
