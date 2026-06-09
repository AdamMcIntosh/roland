/**
 * Spec-First Ship loop — harness integration with checklist gate and structured reflection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ClosedLoop,
  LoopTemplates,
  LOOP_REFLECTION_MD,
  evaluateExitConditions,
  type CommandRunner,
} from '../../src/loop-engine/index.js';
import { Blackboard } from '../../src/rco/blackboard.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';

const passRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'Tests  5 passed (5)\n',
  stderr: '',
});

describe('Spec-First Ship loop', () => {
  let stateDir: string;
  let cwd: string;
  let blackboard: Blackboard;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-spec-ship-state-'));
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-spec-ship-cwd-'));
    blackboard = new Blackboard(stateDir);
    clearLoopEngineConfigCache();
    process.env.ROLAND_LOOP_TEST_MODE = '1';

    const specDir = path.join(cwd, '.roland', 'specs');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'feature-ship-checklist.md'),
      ['- [x] Item A', '- [x] Item B'].join('\n'),
      'utf-8',
    );
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    clearLoopEngineConfigCache();
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('loads spec-first-ship-loop template with specFile and spec_complete exit', () => {
    const templates = new LoopTemplates();
    const template = templates.get('spec-first-ship-loop');
    expect(template).toBeDefined();
    expect(template!.specFile).toBe('.roland/specs/feature-ship-checklist.md');
    expect(template!.exitConditions?.some((c) => c.type === 'spec_complete')).toBe(true);
    expect(template!.reflection).toBe(true);
  });

  it('evaluates spec_complete exit condition from LoopMemory progress', () => {
    const result = evaluateExitConditions(
      [{ type: 'spec_complete', description: 'All spec items done' }],
      {
        iteration: 1,
        maxIterations: 5,
        memory: {
          loopId: 'test',
          goal: 'g',
          templateId: 'spec-first-ship-loop',
          startedAt: Date.now(),
          updatedAt: Date.now(),
          iteration: 1,
          confidenceStreak: 0,
          confidenceHistory: [],
          betweenIterationRuns: [],
          exitConditionStatus: [],
          reflections: [],
          specProgress: {
            specPath: '.roland/specs/feature-ship-checklist.md',
            total: 2,
            completed: 2,
            percentComplete: 100,
            items: [],
            allComplete: true,
            updatedAt: Date.now(),
            recordedAt: Date.now(),
          },
        },
      },
    );
    expect(result.shouldExit).toBe(true);
    expect(result.statuses[0].met).toBe(true);
  });

  it('runs spec-first loop with complete checklist and structured reflection', async () => {
    const loop = new ClosedLoop({
      stateDir,
      goal: 'Spec-First ship test feature',
      template: 'spec-first-ship-loop',
      blackboard,
      runner: passRunner,
      cwd,
      isTestMode: true,
      skipBackoff: true,
      loopId: 'spec-ship-test',
    });

    const result = await loop.run();
    expect(result.status).toBe('completed');
    expect(result.loopId).toBe('spec-ship-test');

    const reflectionMd = fs.readFileSync(
      path.join(result.loopDir, LOOP_REFLECTION_MD),
      'utf-8',
    );
    expect(reflectionMd).toContain('## Iteration');
    expect(reflectionMd).toContain('**What worked well:**');
    expect(reflectionMd).toContain('**Confidence in current approach (0-100):**');

    const memory = loop.getMemory().getState();
    expect(memory.specProgress?.allComplete).toBe(true);
  });
});
