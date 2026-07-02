/**
 * Minimal project verification gate tests — soft-skip when no npm test script.
 * Run: npx vitest run tests/unit/minimal-project-verification.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvaluationGate } from '../../src/loop-engine/evaluation-gate.js';
import { TestExecutor } from '../../src/loop-engine/verification/test-executor.js';
import {
  isNoTestSpecifiedOutput,
  lacksNpmTestScript,
} from '../../src/loop-engine/verification/minimal-project.js';
import type { CommandRunner } from '../../src/loop-engine/verification/index.js';

describe('minimal-project verification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-minimal-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects missing npm test script in package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'greenfield', version: '1.0.0', scripts: {} }),
    );
    expect(lacksNpmTestScript(tmpDir)).toBe(true);
  });

  it('detects npm "no test specified" output', () => {
    expect(isNoTestSpecifiedOutput('', 'npm ERR! Missing script: "test"')).toBe(true);
    expect(isNoTestSpecifiedOutput('', 'Error: no test specified')).toBe(true);
    expect(isNoTestSpecifiedOutput('Tests  3 passed', '')).toBe(false);
  });

  it('TestExecutor soft-skips unit when no test script exists', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { start: 'node index.js' } }),
    );

    const executor = new TestExecutor({
      cwd: tmpDir,
      strategies: [{ type: 'unit', command: 'npm test' }],
    });
    const result = await executor.runAll();
    const unit = result.strategies[0]!;

    expect(unit.skipped).toBe(true);
    expect(unit.pass).toBe(true);
    expect(unit.skipReason).toMatch(/no npm test script/i);
    expect(result.pass).toBe(true);
  });

  it('TestExecutor soft-passes when npm test reports no test specified', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { test: 'echo "Error: no test specified"' } }),
    );

    const noTestRunner: CommandRunner = async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'npm ERR! Missing script: "test"\nError: no test specified',
    });

    const executor = new TestExecutor({
      cwd: tmpDir,
      strategies: [{ type: 'unit', command: 'npm test' }],
      runner: noTestRunner,
    });
    const result = await executor.runAll();
    expect(result.strategies[0]?.skipped).toBe(true);
    expect(result.strategies[0]?.pass).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('EvaluationGate accepts minimal project with skipped unit gate', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: {} }),
    );

    const gate = new EvaluationGate({
      cwd: tmpDir,
      templateFilter: ['unit'],
      goal: 'Bootstrap hello-world app',
      iteration: 1,
    });

    const result = await gate.evaluate();
    expect(result.pass).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    const unitGate = result.gates.find((g) => g.type === 'unit');
    expect(unitGate?.skipped).toBe(true);
  });
});
