/**
 * LoopMemory unit tests — disk persistence, reflections, checkpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LoopMemory,
  LOOP_REFLECTION_MD,
  LOOP_STATE_JSON,
  readLoopMemoryState,
} from '../../src/loop-engine/loop-memory.js';

describe('LoopMemory', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-memory-'));
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('creates loop directory structure on init', () => {
    const memory = new LoopMemory({
      stateDir,
      loopId: 'feature-x-abc',
      goal: 'Ship feature X',
      templateId: 'feature-implementation-loop',
    });

    expect(fs.existsSync(memory.loopDir)).toBe(true);
    expect(fs.existsSync(path.join(memory.loopDir, LOOP_STATE_JSON))).toBe(true);
    expect(fs.existsSync(path.join(memory.loopDir, 'checkpoints'))).toBe(true);
    expect(fs.existsSync(path.join(memory.loopDir, 'artifacts'))).toBe(true);
    expect(memory.loopId).toBe('feature-x-abc');
  });

  it('persists reflections to reflection.md', () => {
    const memory = new LoopMemory({
      stateDir,
      loopId: 'reflect-test',
      goal: 'Test reflections',
      templateId: 'closed-loop-harness',
    });

    memory.appendReflection(1, '## Iteration 1 Reflection\n\nLearned that lint must pass before unit tests.');
    memory.appendReflection(2, '## Iteration 2 Reflection\n\nSecond iteration — confidence streak building.');

    const md = memory.readReflectionMd();
    expect(md).toContain('Iteration 1');
    expect(md).toContain('lint must pass');
    expect(md).toContain('Iteration 2');

    const state = memory.getState();
    expect(state.reflections).toHaveLength(2);
  });

  it('tracks confidence streak across verifications', () => {
    const memory = new LoopMemory({
      stateDir,
      goal: 'Streak test',
      templateId: 'test',
    });

    memory.recordVerification(0.9, true);
    memory.recordVerification(0.92, true);
    expect(memory.getState().confidenceStreak).toBe(2);

    memory.recordVerification(0.5, false);
    expect(memory.getState().confidenceStreak).toBe(0);
  });

  it('reloads state from disk', () => {
    const memory = new LoopMemory({
      stateDir,
      loopId: 'reload-test',
      goal: 'Reload goal',
      templateId: 'test',
    });
    memory.recordVerification(0.88, true);

    const reloaded = readLoopMemoryState(stateDir, 'reload-test');
    expect(reloaded?.confidenceStreak).toBe(1);
    expect(reloaded?.goal).toBe('Reload goal');
  });

  it('writes between-iteration artifacts', () => {
    const memory = new LoopMemory({
      stateDir,
      loopId: 'between-test',
      goal: 'Between iter',
      templateId: 'test',
    });

    memory.recordBetweenIteration({
      iteration: 1,
      command: 'npm test',
      exitCode: 0,
      stdout: '5 passed',
      stderr: '',
      at: Date.now(),
      durationMs: 42,
    });

    const artifact = path.join(memory.loopDir, 'artifacts', 'between-iter-1.txt');
    expect(fs.existsSync(artifact)).toBe(true);
    expect(fs.readFileSync(artifact, 'utf-8')).toContain('npm test');
  });

  it('tracks spec progress snapshots', () => {
    const memory = new LoopMemory({
      stateDir,
      loopId: 'spec-progress-test',
      goal: 'Spec tracking',
      templateId: 'spec-first-ship-loop',
    });

    memory.recordSpecProgress({
      specPath: 'spec.md',
      total: 4,
      completed: 2,
      percentComplete: 50,
      items: [],
      allComplete: false,
      updatedAt: Date.now(),
    });

    const state = memory.getState();
    expect(state.specProgress?.percentComplete).toBe(50);
    expect(state.specProgressHistory).toHaveLength(1);
  });

  it('stores structured reflection fields', () => {
    const memory = new LoopMemory({
      stateDir,
      loopId: 'structured-reflect',
      goal: 'Reflect test',
      templateId: 'closed-loop-harness',
    });

    memory.appendReflection(1, '## Iteration 1 Reflection\n\n**Confidence in current approach (0-100):** 85', {
      whatWorkedWell: ['Gates passed'],
      whatFailed: [],
      keyLearnings: ['Keep patterns'],
      nextStrategy: ['Continue'],
      confidenceScore: 85,
    });

    const state = memory.getState();
    expect(state.reflections[0].structured?.confidenceScore).toBe(85);
  });
});
