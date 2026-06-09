/**
 * ClosedLoop E2E — full harness with EvaluationGate, spawner, checkpoint, PR formatter.
 *
 * Scoped run: npm run test:run -- tests/unit/closed-loop.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ClosedLoop,
  CLOSED_LOOP_PR_FILE,
  LoopTemplates,
  Phase,
  readLoopState,
  LOOP_STATE_FILE,
  type CommandRunner,
} from '../../src/loop-engine/index.js';
import { Blackboard } from '../../src/rco/blackboard.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';

const passRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'Tests  5 passed (5)\n',
  stderr: '',
});

describe('ClosedLoop harness', () => {
  let stateDir: string;
  let blackboard: Blackboard;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-closed-loop-'));
    blackboard = new Blackboard(stateDir);
    clearLoopEngineConfigCache();
    process.env.ROLAND_LOOP_TEST_MODE = '1';
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    clearLoopEngineConfigCache();
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('runs closed-loop-harness template through verify with evaluation gate', async () => {
    const templates = new LoopTemplates();
    const template = templates.get('closed-loop-harness');
    expect(template).toBeDefined();

    const goal = 'Improve loop-engine evaluation gates and confidence scoring';
    const loop = new ClosedLoop({
      stateDir,
      goal,
      template: 'closed-loop-harness',
      blackboard,
      runner: passRunner,
      isTestMode: true,
      skipBackoff: true,
    });

    // Single iteration — mock pass stops retry loop
    const result = await loop.run({ hadBlockers: false });

    expect(result.status).toBe('completed');
    expect(result.iterationsRun).toBeGreaterThanOrEqual(1);
    expect(result.spawnCount).toBeGreaterThan(0);
    expect(result.formattedPr).toBeDefined();
    expect(result.formattedPr!.title.length).toBeGreaterThan(0);
    expect(result.formattedPr!.body).toContain('Summary');

    const state = readLoopState(stateDir);
    expect(state).not.toBeNull();
    expect(state!.lastVerification?.confidence).toBeDefined();
    expect(state!.lastVerification?.accepted).toBe(true);

    const prFile = path.join(stateDir, CLOSED_LOOP_PR_FILE);
    expect(fs.existsSync(prFile)).toBe(true);
  });

  it('spawns specialists on phase transitions', async () => {
    const loop = new ClosedLoop({
      stateDir,
      goal: 'Add specialist spawner tests',
      template: 'minimal-3-phase',
      blackboard,
      runner: passRunner,
      isTestMode: true,
      skipBackoff: true,
    });

    await loop.run();
    const spawns = loop.getSpawner().getHistory();
    expect(spawns.some((s) => s.phase === Phase.Plan)).toBe(true);
    expect(spawns.some((s) => s.phase === Phase.Verify)).toBe(true);
  });

  it('persists loop-state.json for checkpoint recovery', async () => {
    const goal = 'Checkpoint recovery sample goal';
    const loop = new ClosedLoop({
      stateDir,
      goal,
      template: 'minimal-3-phase',
      blackboard,
      runner: passRunner,
      isTestMode: true,
      skipBackoff: true,
    });

    await loop.run();
    const statePath = path.join(stateDir, LOOP_STATE_FILE);
    expect(fs.existsSync(statePath)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.goal).toBe(goal);
    expect(raw.status).toBe('completed');
  });

  it('escalates when custom criteria fail repeatedly', async () => {
    const loop = new ClosedLoop({
      stateDir,
      goal: 'Force escalation via custom gate',
      template: {
        name: 'escalation-test',
        description: 'test',
        phases: [
          { phase: Phase.Plan },
          { phase: Phase.Act },
          { phase: Phase.Verify, verification: ['unit'] },
          { phase: Phase.Critique },
          { phase: Phase.Retry, optional: true },
          { phase: Phase.Escalate, optional: true },
        ],
        maxIterations: 1,
        maxRetries: 0,
        testModeMaxRetries: 0,
      },
      blackboard,
      runner: passRunner,
      customCriteria: [
        { name: 'always-fail', evaluate: () => ({ pass: false, message: 'blocked' }) },
      ],
      isTestMode: true,
      skipBackoff: true,
    });

    const result = await loop.run();
    expect(result.state.lastVerification?.accepted).toBe(false);
    expect(['completed', 'escalated']).toContain(result.status);
  });
});
