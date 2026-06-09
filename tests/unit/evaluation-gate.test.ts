/**
 * EvaluationGate unit tests — confidence scoring, custom criteria, manual review.
 */

import { describe, it, expect } from 'vitest';
import {
  EvaluationGate,
  evaluationResultToLoopState,
} from '../../src/loop-engine/evaluation-gate.js';
import type { CommandRunner } from '../../src/loop-engine/verification/index.js';

const passRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'Tests  3 passed (3)\n',
  stderr: '',
});

const failRunner: CommandRunner = async () => ({
  exitCode: 1,
  stdout: '',
  stderr: 'FAIL tests/unit/example.test.ts',
});

describe('EvaluationGate', () => {
  it('passes with high confidence when all automated gates pass', async () => {
    const gate = new EvaluationGate({
      templateFilter: ['unit'],
      runner: passRunner,
      goal: 'Add feature X',
      iteration: 1,
    });

    const result = await gate.evaluate();
    expect(result.pass).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.gates.some((g) => g.type === 'unit' && g.pass)).toBe(true);
  });

  it('rejects with low confidence when unit tests fail', async () => {
    const gate = new EvaluationGate({
      templateFilter: ['unit'],
      runner: failRunner,
      goal: 'Fix bug',
      iteration: 1,
    });

    const result = await gate.evaluate();
    expect(result.pass).toBe(false);
    expect(result.accepted).toBe(false);
    expect(result.confidence).toBeLessThan(0.75);
  });

  it('runs custom criteria alongside automated verifiers', async () => {
    const gate = new EvaluationGate({
      templateFilter: ['unit'],
      runner: passRunner,
      customCriteria: [
        {
          name: 'no-todos',
          evaluate: () => ({ pass: true, message: 'No TODO markers' }),
        },
        {
          name: 'coverage-floor',
          weight: 2,
          evaluate: () => ({ pass: false, message: 'Coverage below 80%' }),
        },
      ],
    });

    const result = await gate.evaluate();
    expect(result.gates.some((g) => g.name === 'no-todos' && g.pass)).toBe(true);
    expect(result.gates.some((g) => g.name === 'coverage-floor' && !g.pass)).toBe(true);
    expect(result.accepted).toBe(false);
  });

  it('requires manual review when configured', async () => {
    const gate = new EvaluationGate({
      templateFilter: ['unit'],
      runner: passRunner,
      requireManualReview: true,
      manualReviewApproved: false,
    });

    const result = await gate.evaluate();
    expect(result.gates.some((g) => g.type === 'manual_review' && !g.pass)).toBe(true);
    expect(result.accepted).toBe(false);
  });

  it('maps to loop state snapshot with confidence fields', async () => {
    const gate = new EvaluationGate({
      templateFilter: ['unit'],
      runner: passRunner,
    });
    const result = await gate.evaluate();
    const snapshot = evaluationResultToLoopState(result);
    expect(snapshot.confidence).toBeDefined();
    expect(snapshot.accepted).toBe(true);
    expect(snapshot.pass).toBe(true);
  });

  it('includes exit preview when exit conditions configured and accepted', async () => {
    const gate = new EvaluationGate({
      templateFilter: ['unit'],
      runner: passRunner,
      exitConditions: [{ type: 'all_gates_pass' }],
    });
    const result = await gate.evaluate();
    expect(result.accepted).toBe(true);
    expect(result.exitPreview?.wouldExit).toBe(true);
  });
});
