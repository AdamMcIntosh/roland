/**
 * LoopEngine E2E — team-cli / coordinator wiring (standard-code-loop).
 *
 * Exercises production paths without calling LoopEngine.run() in isolation:
 *   parseTeamArgs (--loop-template) → team-orchestrator options shape
 *   LoopEngineCoordinator lifecycle (onMissionStart → waves → synthesis)
 *   onLoopStateChange → RunStateWriter.updateLoopState (run-state.json dashboard fields)
 *   runFullLoop() with team state sync — 2+ Plan→Act→Verify→Critique→Retry cycles
 *
 * Scoped run: npx vitest run tests/e2e/loop-full-team-coordinator.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LoopEngine,
  LoopEngineCoordinator,
  LoopTemplates,
  LOOP_STATE_FILE,
  readLoopState,
  Phase,
  createDefaultHandlers,
  VerifyPhaseHandler,
  RetryPhaseHandler,
  type LoopState,
  type PhaseTransition,
  type CommandRunner,
} from '../../src/loop-engine/index.js';
import { Blackboard } from '../../src/rco/blackboard.js';
import { RunStateWriter, readRunState, RUN_STATE_FILE } from '../../src/rco/run-state.js';
import { parseTeamArgs } from '../../src/rco/team-cli.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';

/** Mirrors team-cli.ts syncLoopStateToRun — dashboard-visible loop fields. */
function syncLoopStateToRun(runState: RunStateWriter, loopState: LoopState): void {
  const recentHistory = loopState.phaseHistory.slice(-12).map((t) => ({
    phase: t.phase,
    success: t.success,
    summary: t.summary?.slice(0, 80),
    startedAt: t.startedAt,
    completedAt: t.completedAt,
  }));
  runState.updateLoopState({
    loopTemplateId: loopState.templateId,
    loopPhase: loopState.currentPhase,
    loopIteration: loopState.iteration,
    loopRetryCount: loopState.retryCount,
    loopStatus: loopState.status,
    loopPhaseHistory: recentHistory,
    lastVerification: loopState.lastVerification,
    lastCritique: loopState.lastCritique
      ? {
          summary: loopState.lastCritique.summary,
          retryDecision: loopState.lastCritique.retryDecision,
          model: loopState.lastCritique.model,
          at: loopState.lastCritique.at,
          iteration: loopState.lastCritique.iteration,
          issueCount: loopState.lastCritique.issues?.length,
          strengths: loopState.lastCritique.strengths,
          issues: loopState.lastCritique.issues,
          suggestions: loopState.lastCritique.suggestions,
        }
      : undefined,
    lastRetry: loopState.lastRetry
      ? {
          attempt: loopState.lastRetry.attempt,
          strategy: loopState.lastRetry.strategy,
          focusAreas: loopState.lastRetry.focusAreas,
          backoffMs: loopState.lastRetry.backoffMs,
          at: loopState.lastRetry.at,
        }
      : undefined,
  });
}

function strategyTypeFromCommand(command: string): 'unit' | 'lint' | 'typecheck' | 'unknown' {
  if (command.includes('test:run')) return 'unit';
  if (command.includes('lint')) return 'lint';
  if (command.includes('build')) return 'typecheck';
  return 'unknown';
}

function createSelectiveFailRunner(failTypes: Set<string>): CommandRunner {
  return async (command) => {
    const type = strategyTypeFromCommand(command);
    if (failTypes.has(type)) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `FAIL ${type} — AssertionError: expected false to be true`,
      };
    }
    return { exitCode: 0, stdout: `${type} ok\n`, stderr: '' };
  };
}

/** Fail unit for the first N verify phases, then pass (counts unit invocations per phase). */
function createFailThenPassRunner(failVerifyPhases: number): CommandRunner {
  let unitInvocations = 0;
  return async (command) => {
    const type = strategyTypeFromCommand(command);
    if (type === 'unit') {
      unitInvocations++;
      if (unitInvocations <= failVerifyPhases) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'FAIL unit — AssertionError: expected false to be true',
        };
      }
    }
    return { exitCode: 0, stdout: `${type} ok\n`, stderr: '' };
  };
}

function handlersWithMockVerify(runner: CommandRunner) {
  const map = createDefaultHandlers();
  map.set(Phase.Verify, new VerifyPhaseHandler({ runner }));
  map.set(Phase.Retry, new RetryPhaseHandler({ skipDelay: true }));
  return map;
}

/** Count completed Plan→Act→Verify→Critique→Retry subsequences in phase history. */
function countPacvrCycles(phaseHistory: PhaseTransition[]): number {
  const completed = phaseHistory
    .filter((t) => t.completedAt !== undefined)
    .map((t) => t.phase);
  const target = [Phase.Plan, Phase.Act, Phase.Verify, Phase.Critique, Phase.Retry];
  let count = 0;
  for (let i = 0; i <= completed.length - target.length; i++) {
    if (target.every((phase, j) => completed[i + j] === phase)) count++;
  }
  return count;
}

/** Count completed Act→Verify→Critique→Retry subsequences (coordinator per-wave path). */
function countAvcrCycles(phaseHistory: PhaseTransition[]): number {
  const completed = phaseHistory
    .filter((t) => t.completedAt !== undefined)
    .map((t) => t.phase);
  const target = [Phase.Act, Phase.Verify, Phase.Critique, Phase.Retry];
  let count = 0;
  for (let i = 0; i <= completed.length - target.length; i++) {
    if (target.every((phase, j) => completed[i + j] === phase)) count++;
  }
  return count;
}

interface TeamLoopStack {
  engine: LoopEngine;
  coordinator: LoopEngineCoordinator;
  runState: RunStateWriter;
  runSnapshots: Array<{
    iteration: number;
    retryCount: number;
    historyLen: number;
    loopPhaseHistoryLen: number;
  }>;
}

/** Mirrors team-orchestrator loop engine + coordinator construction. */
function createTeamLoopStack(
  tmpDir: string,
  goal: string,
  template: NonNullable<ReturnType<LoopTemplates['get']>>,
  runner: CommandRunner,
  opts: { isTestMode?: boolean } = {},
): TeamLoopStack {
  const blackboard = new Blackboard(tmpDir);
  const runState = new RunStateWriter(tmpDir, goal);
  const runSnapshots: TeamLoopStack['runSnapshots'] = [];

  const engine = new LoopEngine({
    stateDir: tmpDir,
    template,
    goal,
    blackboard,
    isTestMode: opts.isTestMode,
    skipBackoff: true,
    handlers: handlersWithMockVerify(runner),
    hooks: {
      onStateChange: (state) => {
        syncLoopStateToRun(runState, state);
        const persisted = readRunState(tmpDir);
        runSnapshots.push({
          iteration: state.iteration,
          retryCount: state.retryCount,
          historyLen: state.phaseHistory.length,
          loopPhaseHistoryLen: persisted?.loopPhaseHistory?.length ?? 0,
        });
      },
    },
  });

  const coordinator = new LoopEngineCoordinator(engine);
  return { engine, coordinator, runState, runSnapshots };
}

async function simulateCoordinatorWaves(
  coordinator: LoopEngineCoordinator,
  waves: Array<{ hadBlockers: boolean }>,
): Promise<void> {
  await coordinator.onMissionStart();
  await coordinator.onPlanningComplete();
  for (let i = 0; i < waves.length; i++) {
    const waveNumber = i + 1;
    await coordinator.onWaveStart(waveNumber);
    await coordinator.onWaveComplete(waveNumber, waves[i]!.hadBlockers);
  }
  await coordinator.onSynthesisStart();
}

describe('LoopEngine — team-cli / coordinator full-loop E2E', () => {
  let tmpDir: string;
  let templates: LoopTemplates;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-team-coordinator-e2e-'));
    templates = new LoopTemplates();
    clearLoopEngineConfigCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearLoopEngineConfigCache();
  });

  it('parseTeamArgs wires --loop-template standard-code-loop for team orchestrator', () => {
    const goal = 'E2E: coordinator wiring via roland team --loop-template';
    const parsed = parseTeamArgs([
      'team',
      goal,
      '--loop-template',
      'standard-code-loop',
      '--state-dir',
      tmpDir,
      '--quiet',
    ]);

    expect(parsed.goal).toBe(goal);
    expect(parsed.loopTemplate).toBe('standard-code-loop');
    expect(parsed.stateDir).toBe(tmpDir);
    expect(parsed.quiet).toBe(true);
  });

  it('LoopEngineCoordinator syncs loopPhaseHistory across 2 failing team waves', async () => {
    const template = templates.get('standard-code-loop');
    expect(template).toBeDefined();

    const goal = 'E2E: coordinator verify→critique→retry across waves';
    const runner = createSelectiveFailRunner(new Set(['unit']));
    const { coordinator, engine, runSnapshots } = createTeamLoopStack(
      tmpDir,
      goal,
      template!,
      runner,
    );

    await simulateCoordinatorWaves(coordinator, [
      { hadBlockers: false },
      { hadBlockers: false },
      { hadBlockers: false },
    ]);

    const state = engine.getState();

    // Coordinator: Plan once, then Act→Verify→Critique→Retry per failing wave.
    expect(countAvcrCycles(state.phaseHistory)).toBeGreaterThanOrEqual(2);

    const completedRetries = state.phaseHistory.filter(
      (t) => t.phase === Phase.Retry && t.completedAt !== undefined,
    );
    expect(completedRetries.length).toBeGreaterThanOrEqual(2);

    const completedVerifies = state.phaseHistory.filter(
      (t) => t.phase === Phase.Verify && t.completedAt !== undefined,
    );
    expect(completedVerifies.length).toBeGreaterThanOrEqual(3);
    expect(completedVerifies.filter((t) => t.success === false).length).toBeGreaterThanOrEqual(2);

    // run-state.json dashboard fields updated across onLoopStateChange callbacks.
    expect(runSnapshots.length).toBeGreaterThan(10);
    const firstSnapshot = runSnapshots[0]!;
    const midSnapshot = runSnapshots[Math.floor(runSnapshots.length / 2)]!;
    const lastSnapshot = runSnapshots.at(-1)!;
    expect(midSnapshot.historyLen).toBeGreaterThan(firstSnapshot.historyLen);
    expect(lastSnapshot.loopPhaseHistoryLen).toBeGreaterThan(firstSnapshot.loopPhaseHistoryLen);

    const persistedRun = readRunState(tmpDir);
    expect(persistedRun).not.toBeNull();
    expect(persistedRun!.loopTemplateId).toBe('standard-code-loop');
    expect(persistedRun!.loopPhaseHistory?.length).toBeGreaterThanOrEqual(4);
    expect(persistedRun!.lastCritique?.retryDecision).toMatch(/retry_focused|retry/);
    expect(persistedRun!.lastRetry?.strategy).toBe('focused');
    expect(persistedRun!.lastRetry!.attempt).toBeGreaterThanOrEqual(1);

    const persistedLoop = readLoopState(tmpDir);
    expect(persistedLoop?.templateId).toBe('standard-code-loop');
    expect(persistedLoop?.retryHistory?.length).toBeGreaterThanOrEqual(2);
    expect(fs.existsSync(path.join(tmpDir, LOOP_STATE_FILE))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, RUN_STATE_FILE))).toBe(true);
  });

  it('runFullLoop via team state sync completes 2+ PACVR cycles (success after retries)', async () => {
    const template = templates.get('standard-code-loop');
    expect(template).toBeDefined();
    expect(template!.maxIterations).toBeGreaterThanOrEqual(3);

    const goal = 'E2E: runFullLoop 2 iterations with retry then success';
    const runner = createFailThenPassRunner(2);
    const { engine, runSnapshots } = createTeamLoopStack(tmpDir, goal, template!, runner, {
      isTestMode: true,
    });

    const result = await engine.runFullLoop({ hadBlockers: false });

    expect(result.status).toBe('completed');
    expect(result.iterationsRun).toBeGreaterThanOrEqual(3);
    expect(result.state.status).toBe('completed');
    expect(result.state.retryCount).toBe(2);
    expect(result.state.lastVerification?.pass).toBe(true);
    expect(result.state.lastCritique?.retryDecision).toBe('proceed');

    // At least 2 full Plan→Act→Verify→Critique→Retry transitions.
    expect(countPacvrCycles(result.state.phaseHistory)).toBeGreaterThanOrEqual(2);

    const retryFocused = result.state.critiqueHistory?.filter(
      (c) => c.retryDecision === 'retry_focused',
    );
    expect(retryFocused?.length).toBe(2);

    const completedRetries = result.state.phaseHistory.filter(
      (t) => t.phase === Phase.Retry && t.completedAt !== undefined,
    );
    expect(completedRetries.length).toBe(2);

    // Dashboard-visible counters moved across the run (not stuck at initial values).
    const iterationValues = [...new Set(runSnapshots.map((s) => s.iteration))];
    const retryValues = [...new Set(runSnapshots.map((s) => s.retryCount))];
    expect(iterationValues.length).toBeGreaterThan(1);
    expect(retryValues.length).toBeGreaterThan(1);
    expect(Math.max(...retryValues)).toBe(2);

    const persistedRun = readRunState(tmpDir);
    expect(persistedRun!.loopTemplateId).toBe('standard-code-loop');
    expect(persistedRun!.loopIteration).toBeGreaterThanOrEqual(3);
    expect(persistedRun!.loopRetryCount).toBe(2);
    expect(persistedRun!.loopStatus).toBe('completed');
    expect(persistedRun!.loopPhaseHistory?.length).toBeGreaterThanOrEqual(8);
    expect(persistedRun!.lastVerification?.pass).toBe(true);
    expect(persistedRun!.lastCritique?.retryDecision).toBe('proceed');
    expect(persistedRun!.lastRetry?.attempt).toBe(2);

    const historyPhases = persistedRun!.loopPhaseHistory!.map((t) => t.phase);
    expect(historyPhases).toContain(Phase.Plan);
    expect(historyPhases).toContain(Phase.Act);
    expect(historyPhases).toContain(Phase.Verify);
    expect(historyPhases).toContain(Phase.Critique);
    expect(historyPhases).toContain(Phase.Retry);
  });
});
