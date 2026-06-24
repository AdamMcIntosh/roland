/**
 * Loop orchestrator routing — ClosedLoop as primary path for loop-template missions.
 *
 * Scoped run: npx vitest run tests/unit/loop-orchestrator.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  hasLoopTemplate,
  runClosedLoopMission,
} from '../../src/rco/loop-orchestrator.js';
import { runTeam } from '../../src/rco/team-orchestrator.js';
import {
  CLOSED_LOOP_PR_FILE,
  readLoopState,
  type CommandRunner,
} from '../../src/loop-engine/index.js';
import { RunStateWriter, readRunState } from '../../src/rco/run-state.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';

const passRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'Tests  5 passed (5)\n',
  stderr: '',
});

/** Mirrors team-cli syncLoopStateToRun for dashboard field assertions. */
function syncLoopStateToRun(
  runState: RunStateWriter,
  loopState: NonNullable<ReturnType<typeof readLoopState>>,
): void {
  runState.updateLoopState({
    loopTemplateId: loopState.templateId,
    loopPhase: loopState.currentPhase,
    loopIteration: loopState.iteration,
    loopRetryCount: loopState.retryCount,
    loopStatus: loopState.status,
    loopPhaseHistory: loopState.phaseHistory.slice(-12).map((t) => ({
      phase: t.phase,
      success: t.success,
      summary: t.summary?.slice(0, 80),
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    })),
    lastVerification: loopState.lastVerification,
    lastCritique: loopState.lastCritique
      ? {
          summary: loopState.lastCritique.summary,
          retryDecision: loopState.lastCritique.retryDecision,
          model: loopState.lastCritique.model,
          at: loopState.lastCritique.at,
          iteration: loopState.lastCritique.iteration,
        }
      : undefined,
  });
}

describe('loop-orchestrator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-orchestrator-'));
    clearLoopEngineConfigCache();
    process.env.ROLAND_LOOP_TEST_MODE = '1';
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    clearLoopEngineConfigCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hasLoopTemplate returns true only for non-empty template ids', () => {
    expect(hasLoopTemplate(undefined)).toBe(false);
    expect(hasLoopTemplate('')).toBe(false);
    expect(hasLoopTemplate('   ')).toBe(false);
    expect(hasLoopTemplate('closed-loop-harness')).toBe(true);
    expect(hasLoopTemplate('feature-implementation-loop')).toBe(true);
  });

  it('runClosedLoopMission runs closed-loop-harness end-to-end with PR and loop state', async () => {
    const goal = 'Route through ClosedLoop harness for loop orchestrator test';
    const runState = new RunStateWriter(tmpDir, goal);

    const result = await runClosedLoopMission({
      goal,
      stateDir: tmpDir,
      loopTemplate: 'closed-loop-harness',
      loopRunner: passRunner,
      onLoopStateChange: (s) => syncLoopStateToRun(runState, s),
    });

    expect(result.goal).toBe(goal);
    expect(result.wavesRun).toBeGreaterThanOrEqual(1);
    expect(result.synthesis).toContain('Closed-Loop Mission Complete');
    expect(result.synthesis).toContain('PR Draft');
    expect(result.plan.pmNotes).toMatch(/ClosedLoop harness|PM path|Stub PM plan/i);

    expect(fs.existsSync(path.join(tmpDir, CLOSED_LOOP_PR_FILE))).toBe(true);

    const loopState = readLoopState(tmpDir);
    expect(loopState?.templateId).toBe('closed-loop-harness');
    expect(loopState?.status).toBe('completed');

    const persistedRun = readRunState(tmpDir);
    expect(persistedRun?.loopTemplateId).toBe('closed-loop-harness');
    expect(persistedRun?.loopStatus).toBe('completed');
  });

  it('runClosedLoopMission runs feature-implementation-loop template', async () => {
    const result = await runClosedLoopMission({
      goal: 'Feature loop routing test',
      stateDir: tmpDir,
      loopTemplate: 'feature-implementation-loop',
      loopRunner: passRunner,
    });

    expect(result.synthesis).toContain('feature-implementation-loop');
    const loopState = readLoopState(tmpDir);
    expect(loopState?.templateId).toBe('feature-implementation-loop');
  });

  it('runTeam delegates to ClosedLoop when loopTemplate is set', async () => {
    const goal = 'runTeam routing smoke test';
    const loopOrchestrator = await import('../../src/rco/loop-orchestrator.js');
    const runSpy = vi.spyOn(loopOrchestrator, 'runClosedLoopMission').mockResolvedValue({
      goal,
      plan: { tasks: [], pmNotes: 'mock' },
      taskResults: {},
      synthesis: '# mock closed-loop synthesis',
      wavesRun: 1,
      blockersEncountered: 0,
    });

    try {
      const result = await runTeam({
        goal,
        stateDir: tmpDir,
        loopTemplate: 'minimal-3-phase',
      });

      expect(runSpy).toHaveBeenCalledOnce();
      expect(runSpy.mock.calls[0]![0].loopTemplate).toBe('minimal-3-phase');
      expect(result.synthesis).toContain('mock');
    } finally {
      runSpy.mockRestore();
    }
  });

  it('throws for unknown loop template', async () => {
    await expect(
      runClosedLoopMission({
        goal: 'bad template',
        stateDir: tmpDir,
        loopTemplate: 'nonexistent-loop-template-xyz',
        loopRunner: passRunner,
      }),
    ).rejects.toThrow(/unknown loop template/i);
  });
});
