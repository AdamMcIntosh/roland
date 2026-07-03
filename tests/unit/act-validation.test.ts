/**
 * Act validation + greenfield verification tests.
 * Run: npx vitest run tests/unit/act-validation.test.ts tests/unit/minimal-project-verification.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  captureWorkspaceBaseline,
  inferExpectedDeliverables,
  validateActExecution,
} from '../../src/loop-engine/act-validation.js';
import { EvaluationGate } from '../../src/loop-engine/evaluation-gate.js';
import { TestExecutor } from '../../src/loop-engine/verification/test-executor.js';
import {
  lacksLintConfig,
  lacksTypecheckConfig,
} from '../../src/loop-engine/verification/minimal-project.js';

describe('act-validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-act-val-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ROLAND_LOOP_TEST_MODE;
  });

  it('infers deliverables from greenfield goal', () => {
    const goal = 'create test-hybrid-2 as minimal Node.js + TS project with hello-world.ts';
    const files = inferExpectedDeliverables(goal);
    expect(files).toContain('hello-world.ts');
    expect(files).toContain('package.json');
    expect(files).toContain('tsconfig.json');
  });

  it('detects act no-op when no files change', () => {
    const baseline = captureWorkspaceBaseline(tmpDir);
    const result = validateActExecution({
      cwd: tmpDir,
      goal: 'create minimal Node.js + TS project with hello-world.ts',
      baseline,
      agentOutput: 'Here is my plan for the project...',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no-op|missing deliverables/i);
  });

  it('passes when greenfield deliverables are created', () => {
    const baseline = captureWorkspaceBaseline(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'app', scripts: {} }));
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
    fs.writeFileSync(path.join(tmpDir, 'hello-world.ts'), 'console.log("hello");\n');

    const result = validateActExecution({
      cwd: tmpDir,
      goal: 'create minimal Node.js + TS project with hello-world.ts',
      baseline,
    });
    expect(result.ok).toBe(true);
    expect(result.filesCreated.length).toBeGreaterThanOrEqual(3);
  });

  it('skips validation in test mode', () => {
    process.env.ROLAND_LOOP_TEST_MODE = '1';
    const baseline = captureWorkspaceBaseline(tmpDir);
    const result = validateActExecution({
      cwd: tmpDir,
      goal: 'create minimal Node.js + TS project with hello-world.ts',
      baseline,
      skipInTestMode: true,
    });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/skipped/i);
  });
});

describe('greenfield verification tooling soft-skip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-greenfield-verify-'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'greenfield', scripts: {} }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects missing lint and typecheck config', () => {
    expect(lacksLintConfig(tmpDir)).toBe(true);
    expect(lacksTypecheckConfig(tmpDir)).toBe(true);
  });

  it('TestExecutor soft-skips lint and typecheck on minimal greenfield', async () => {
    const executor = new TestExecutor({
      cwd: tmpDir,
      strategies: [
        { type: 'lint', command: 'npm run lint', optional: true },
        { type: 'unit', command: 'npm test' },
        { type: 'typecheck', command: 'npm run typecheck', optional: true },
      ],
    });
    const result = await executor.runAll();
    expect(result.strategies.every((s) => s.skipped)).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('EvaluationGate accepts full-cycle gates on bare greenfield package.json', async () => {
    const gate = new EvaluationGate({
      cwd: tmpDir,
      templateFilter: ['lint', 'unit', 'typecheck'],
      goal: 'create minimal Node.js + TS project with hello-world.ts',
      iteration: 1,
    });
    const result = await gate.evaluate();
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.accepted).toBe(true);
  });
});
