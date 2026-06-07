/**
 * LoopEngine E2E — minimal-3-phase template (Plan → Act → Verify).
 *
 * Exercises production persistence paths:
 *   LoopEngine → LoopStateStore (loop-state.json)
 *   phase handlers → Blackboard (blackboard.json)
 *   onStateChange → RunStateWriter.updateLoopState (run-state.json)
 *   Verify phase → TestExecutor (mocked runner)
 *
 * Scoped run: npm run test:run -- tests/unit/loop-engine.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LoopEngine,
  LoopTemplates,
  LOOP_STATE_FILE,
  readLoopState,
  Phase,
  createDefaultHandlers,
  VerifyPhaseHandler,
  type LoopState,
  type CommandRunner,
} from '../../src/loop-engine/index.js';
import { Blackboard } from '../../src/rco/blackboard.js';
import { RunStateWriter, readRunState, RUN_STATE_FILE } from '../../src/rco/run-state.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';

function syncLoopStateToRun(runState: RunStateWriter, loopState: LoopState): void {
  runState.updateLoopState({
    loopTemplateId: loopState.templateId,
    loopPhase: loopState.currentPhase,
    loopIteration: loopState.iteration,
    loopRetryCount: loopState.retryCount,
    lastVerification: loopState.lastVerification,
    lastCritique: loopState.lastCritique
      ? {
          summary: loopState.lastCritique.summary,
          retryDecision: loopState.lastCritique.retryDecision,
          model: loopState.lastCritique.model,
          at: loopState.lastCritique.at,
          iteration: loopState.lastCritique.iteration,
          issueCount: loopState.lastCritique.issues?.length,
        }
      : undefined,
  });
}

const mockPassRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'Tests  3 passed (3)\n',
  stderr: '',
});

const mockFailRunner: CommandRunner = async () => ({
  exitCode: 1,
  stdout: '',
  stderr: 'FAIL tests/unit/example.test.ts\nAssertionError: expected false to be true',
});

function handlersWithMockVerify(runner: CommandRunner) {
  const map = createDefaultHandlers();
  map.set(Phase.Verify, new VerifyPhaseHandler({ runner }));
  return map;
}

describe('LoopEngine — minimal-3-phase E2E', () => {
  let tmpDir: string;
  let templates: LoopTemplates;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-e2e-'));
    templates = new LoopTemplates();
    clearLoopEngineConfigCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearLoopEngineConfigCache();
  });

  it('runs plan → act → verify, persists loop-state, blackboard, and run-state', async () => {
    const template = templates.get('minimal-3-phase');
    expect(template).toBeDefined();
    expect(template!.phases.map((p) => p.phase)).toEqual([
      Phase.Plan,
      Phase.Act,
      Phase.Verify,
    ]);
    expect(template!.phases.find((p) => p.phase === Phase.Verify)?.verification).toEqual(['unit']);

    const goal = 'E2E: minimal 3-phase loop reference run';
    const blackboard = new Blackboard(tmpDir);
    const runState = new RunStateWriter(tmpDir, goal);

    const phaseStarts: string[] = [];
    const phaseCompletes: string[] = [];

    const engine = new LoopEngine({
      stateDir: tmpDir,
      template: template!,
      goal,
      blackboard,
      handlers: handlersWithMockVerify(mockPassRunner),
      hooks: {
        onPhaseStart: (phase) => phaseStarts.push(phase),
        onPhaseComplete: (phase, result) => {
          phaseCompletes.push(phase);
          expect(result.success).toBe(true);
        },
        onStateChange: (state) => syncLoopStateToRun(runState, state),
      },
    });

    const result = await engine.run({ hadBlockers: false });

    // ── Run result ────────────────────────────────────────────────────────────
    expect(result.status).toBe('completed');
    expect(result.phasesCompleted).toBe(3);
    expect(result.state.status).toBe('completed');
    expect(result.state.templateId).toBe('minimal-3-phase');
    expect(result.state.goal).toBe(goal);
    expect(result.state.iteration).toBe(1);
    expect(result.state.currentPhase).toBe(Phase.Verify);
    expect(result.state.lastVerification).toMatchObject({
      pass: true,
      summary: expect.stringContaining('Verification passed'),
      strategies: expect.arrayContaining([
        expect.objectContaining({ type: 'unit', pass: true }),
      ]),
    });

    // ── Phase transitions ─────────────────────────────────────────────────────
    expect(phaseStarts).toEqual([Phase.Plan, Phase.Act, Phase.Verify]);
    expect(phaseCompletes).toEqual([Phase.Plan, Phase.Act, Phase.Verify]);

    const completedPhases = result.state.phaseHistory
      .filter((t) => t.completedAt !== undefined)
      .map((t) => t.phase);
    expect(completedPhases).toContain(Phase.Plan);
    expect(completedPhases).toContain(Phase.Act);
    expect(completedPhases).toContain(Phase.Verify);

    // ── loop-state.json on disk ───────────────────────────────────────────────
    const loopStatePath = path.join(tmpDir, LOOP_STATE_FILE);
    expect(fs.existsSync(loopStatePath)).toBe(true);

    const persistedLoop = readLoopState(tmpDir);
    expect(persistedLoop).not.toBeNull();
    expect(persistedLoop!.status).toBe('completed');
    expect(persistedLoop!.currentPhase).toBe(Phase.Verify);
    expect(persistedLoop!.templateId).toBe('minimal-3-phase');

    // ── Blackboard entries from phase handlers ────────────────────────────────
    const loopEntries = blackboard.read().filter((e) => e.tags.includes('loop'));
    expect(loopEntries.length).toBeGreaterThanOrEqual(4);

    const planEntry = loopEntries.find((e) => e.tags.includes('plan'));
    const actEntry = loopEntries.find((e) => e.tags.includes('act'));
    const verifyEntry = loopEntries.find((e) => e.tags.includes('verify') && e.type === 'result');

    expect(planEntry?.type).toBe('decision');
    expect(planEntry?.author).toBe('loop-engine');
    expect(actEntry?.type).toBe('decision');
    expect(verifyEntry?.type).toBe('result');
    expect(verifyEntry?.status).toBe('done');

    expect(fs.existsSync(path.join(tmpDir, 'blackboard.json'))).toBe(true);

    // ── run-state.json loop fields (team-cli sync path) ───────────────────────
    const runStatePath = path.join(tmpDir, RUN_STATE_FILE);
    expect(fs.existsSync(runStatePath)).toBe(true);

    const persistedRun = readRunState(tmpDir);
    expect(persistedRun).not.toBeNull();
    expect(persistedRun!.loopTemplateId).toBe('minimal-3-phase');
    expect(persistedRun!.loopPhase).toBe(Phase.Verify);
    expect(persistedRun!.loopIteration).toBe(1);
    expect(persistedRun!.lastVerification).toMatchObject({
      pass: true,
      summary: expect.stringContaining('Verification passed'),
      strategies: expect.arrayContaining([
        expect.objectContaining({ type: 'unit', pass: true }),
      ]),
    });
  });

  it('marks verify failure and triggers retry loop when tests fail', async () => {
    const template = templates.get('minimal-3-phase');
    const blackboard = new Blackboard(tmpDir);

    const engine = new LoopEngine({
      stateDir: tmpDir,
      template: template!,
      goal: 'verify failure path',
      blackboard,
      handlers: handlersWithMockVerify(mockFailRunner),
    });

    const result = await engine.run({ hadBlockers: false });

    expect(result.state.lastVerification?.pass).toBe(false);
    expect(result.state.lastVerification?.summary).toContain('Verification failed');
    expect(result.state.lastVerification?.strategies?.[0]?.pass).toBe(false);
  });

  it('loads all three bundled loop templates with verify steps', () => {
    const names = templates.list().map((t) => t.name);
    expect(names).toContain('minimal-3-phase');
    expect(names).toContain('standard-code-loop');
    expect(names).toContain('research-loop');

    const standard = templates.get('standard-code-loop');
    const verifyPhase = standard?.phases.find((p) => p.phase === Phase.Verify);
    expect(verifyPhase?.verification).toEqual(['unit', 'lint', 'typecheck']);
  });
});
