/**
 * Loop agent dispatch + greenfield goal tests.
 * Run: npx vitest run tests/unit/loop-agent-dispatch.test.ts tests/unit/goal-scope.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchLoopPhaseAgent } from '../../src/loop-engine/loop-agent-dispatch.js';
import { Blackboard } from '../../src/coordination/legacy-blackboard.js';
import { isGreenfieldGoal } from '../../src/rco/goal-scope.js';
import { ClosedLoop } from '../../src/loop-engine/closed-loop.js';
import type { CommandRunner } from '../../src/loop-engine/verification/index.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';

describe('isGreenfieldGoal', () => {
  it('detects test-hybrid and minimal Node project goals', () => {
    expect(
      isGreenfieldGoal(
        'create test-hybrid-2 as minimal Node.js + TS project with hello-world.ts',
      ),
    ).toBe(true);
    expect(isGreenfieldGoal('Bootstrap a new Express API project')).toBe(true);
    expect(isGreenfieldGoal('Fix typo in README')).toBe(false);
  });
});

describe('dispatchLoopPhaseAgent', () => {
  let stateDir: string;
  let blackboard: Blackboard;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-agent-'));
    blackboard = new Blackboard(stateDir);
    process.env.ROLAND_LOOP_TEST_MODE = '1';
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('returns test stub for act phase without CURSOR_API_KEY', async () => {
    delete process.env.CURSOR_API_KEY;
    const result = await dispatchLoopPhaseAgent({
      phase: 'act',
      iteration: 1,
      goal: 'create test-hybrid-2 minimal Node TS hello-world.ts',
      stateDir,
      blackboard,
      isTestMode: true,
      cwd: stateDir,
    });

    expect(result.success).toBe(true);
    expect(result.hadBlocker).toBe(false);
    expect(result.output).toMatch(/test stub/i);
  });
});

describe('greenfield closed-loop', () => {
  let stateDir: string;
  let projectDir: string;
  let blackboard: Blackboard;

  const passRunner: CommandRunner = async () => ({
    exitCode: 0,
    stdout: 'Tests  1 passed (1)\n',
    stderr: '',
  });

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-greenfield-'));
    stateDir = path.join(projectDir, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'test-hybrid-2', scripts: {} }),
    );
    blackboard = new Blackboard(stateDir);
    clearLoopEngineConfigCache();
    process.env.ROLAND_LOOP_TEST_MODE = '1';
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    fs.rmSync(projectDir, { recursive: true, force: true });
    clearLoopEngineConfigCache();
  });

  it('completes full-cycle-verified-loop for greenfield goal with soft unit skip', async () => {
    const goal = 'create test-hybrid-2 as minimal Node.js + TS project with hello-world.ts';
    const loop = new ClosedLoop({
      stateDir,
      goal,
      template: 'full-cycle-verified-loop',
      blackboard,
      runner: passRunner,
      cwd: projectDir,
      isTestMode: true,
      skipBackoff: true,
    });

    const result = await loop.run({ hadBlockers: false });
    expect(result.status).toBe('completed');
    expect(result.state.lastVerification?.pass).toBe(true);
    expect(result.state.lastVerification?.confidence).toBeGreaterThanOrEqual(0.85);
  });
});
