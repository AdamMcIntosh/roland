/**
 * EvaluationGate unit tests — confidence scoring, custom criteria, manual review.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
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
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-eval-gate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

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
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
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
    expect(result.confidence).toBeLessThan(0.85);
  });

  it('applies per-strategy weight and success_threshold in confidence scoring', async () => {
    const gate = new EvaluationGate({
      strategies: [
        {
          type: 'unit',
          command: 'npm test',
          weight: 0.9,
          successThreshold: 1,
        },
        {
          type: 'smoke',
          command: 'npm test',
          optional: true,
          weight: 0.6,
          successThreshold: 0.6,
        },
      ],
      runner: passRunner,
      minConfidence: 0.8,
    });

    const result = await gate.evaluate();
    expect(result.accepted).toBe(true);
    expect(result.confidence).toBeCloseTo(0.84, 2);
    const unitGate = result.gates.find((g) => g.name === 'unit');
    const smokeGate = result.gates.find((g) => g.name === 'smoke');
    expect(unitGate?.weight).toBe(0.9);
    expect(smokeGate?.weight).toBe(0.6);
    expect(unitGate?.confidence).toBe(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
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

  it('includes soft-skipped unit gate in confidence scoring for greenfield projects', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: {} }),
    );

    const gate = new EvaluationGate({
      cwd: tmpDir,
      templateFilter: ['unit', 'lint'],
      goal: 'Bootstrap minimal app',
      iteration: 1,
    });

    const result = await gate.evaluate();
    const unitGate = result.gates.find((g) => g.type === 'unit');
    expect(unitGate?.skipped).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.accepted).toBe(true);
  });
});
