/**
 * Loop observability + checkpoint + health unit tests.
 * Scoped: npx vitest run tests/unit/loop-observability.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LoopEngine,
  LoopTemplates,
  LoopObservability,
  computeLoopMetrics,
  summarizeHistory,
  LOOP_METRICS_FILE,
  LOOP_HISTORY_FILE,
  saveLoopCheckpoint,
  readLoopCheckpoint,
  tryRecoverLoopState,
  buildLoopHealthReport,
  isRateLimitOrUnavailableError,
  loopDegradationPolicy,
  Phase,
  createDefaultHandlers,
  createInitialLoopState,
  readLoopState,
  VerifyPhaseHandler,
  type CommandRunner,
} from '../../src/loop-engine/index.js';
import { Blackboard } from '../../src/rco/blackboard.js';

const mockPassRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'ok\n',
  stderr: '',
});

function handlersWithMockVerify() {
  const map = createDefaultHandlers();
  map.set(Phase.Verify, new VerifyPhaseHandler({ runner: mockPassRunner }));
  return map;
}

describe('Loop observability', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-obs-'));
    loopDegradationPolicy.reset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists metrics and history during a minimal loop run', async () => {
    const templates = new LoopTemplates();
    const template = templates.get('minimal-3-phase');
    expect(template).toBeDefined();

    const blackboard = new Blackboard(tmpDir);
    const engine = new LoopEngine({
      stateDir: tmpDir,
      template: template!,
      goal: 'observability test',
      blackboard,
      recoverOnStart: false,
      handlers: handlersWithMockVerify(),
    });

    await engine.run();

    const metricsPath = path.join(tmpDir, LOOP_METRICS_FILE);
    const historyPath = path.join(tmpDir, LOOP_HISTORY_FILE);
    expect(fs.existsSync(metricsPath)).toBe(true);
    expect(fs.existsSync(historyPath)).toBe(true);

    const obs = new LoopObservability(tmpDir, blackboard);
    const metrics = obs.readMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics!.phasesCompleted).toBeGreaterThanOrEqual(3);
    expect(metrics!.successRate).toBeGreaterThanOrEqual(0);

    const history = obs.readHistory();
    expect(history.entries.length).toBeGreaterThanOrEqual(6);
    expect(summarizeHistory(history)).toMatch(/transitions/);

    const loopEntries = blackboard.read().filter((e) => e.tags.includes('loop-history'));
    expect(loopEntries.length).toBeGreaterThan(0);
  });

  it('computeLoopMetrics captures failure reasons from phase history', () => {
    const state = createInitialLoopState('test', 'goal', Phase.Plan);
    state.phaseHistory.push(
      { phase: Phase.Verify, startedAt: 1000, completedAt: 2000, success: false, summary: 'unit failed' },
      { phase: Phase.Critique, startedAt: 2000, completedAt: 2500, success: true, summary: 'retry_focused' },
    );
    const metrics = computeLoopMetrics(state);
    expect(metrics.phasesFailed).toBe(1);
    expect(metrics.failureReasons[0]).toMatch(/unit failed/);
  });
});

describe('Loop checkpoint + recovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-recovery-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and recovers checkpoint for running loop', async () => {
    const state = createInitialLoopState('standard-code-loop', 'recovery test', Phase.Plan);
    state.iteration = 2;
    state.retryCount = 1;
    saveLoopCheckpoint(tmpDir, Phase.Verify, state);

    const checkpoint = readLoopCheckpoint(tmpDir);
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.phase).toBe(Phase.Verify);
    expect(checkpoint!.state.iteration).toBe(2);

    const recovery = tryRecoverLoopState(tmpDir);
    expect(recovery.recovered).toBe(true);
    expect(recovery.source).toBe('checkpoint');
    expect(recovery.state?.retryCount).toBe(1);
  });

  it('LoopEngine recovers from checkpoint on start', async () => {
    const templates = new LoopTemplates();
    const template = templates.get('minimal-3-phase');
    const state = createInitialLoopState('minimal-3-phase', 'resume goal', Phase.Act);
    state.iteration = 2;
    saveLoopCheckpoint(tmpDir, Phase.Act, state);
    fs.writeFileSync(
      path.join(tmpDir, 'loop-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8',
    );

    const engine = new LoopEngine({
      stateDir: tmpDir,
      template: template!,
      goal: 'resume goal',
      blackboard: new Blackboard(tmpDir),
      recoverOnStart: true,
    });

    expect(engine.getState().iteration).toBe(2);
    expect(engine.getState().currentPhase).toBe(Phase.Act);
  });
});

describe('Loop health + resilience', () => {
  it('buildLoopHealthReport returns idle when no loop state', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-health-'));
    try {
      const report = buildLoopHealthReport(tmpDir);
      expect(report.status).toBe('idle');
      expect(report.templates.length).toBeGreaterThanOrEqual(3);
      expect(report.actions.hitlResumeCmd).toBe('roland resume');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects rate-limit errors and degrades model selection', () => {
    expect(isRateLimitOrUnavailableError('HTTP 429 Too Many Requests')).toBe(true);
    expect(isRateLimitOrUnavailableError('all good')).toBe(false);
    const fallback = loopDegradationPolicy.recordFailure('grok', 'rate limit exceeded');
    expect(fallback).toBe('composer');
    expect(loopDegradationPolicy.selectModel('grok')).toBe('composer');
  });
});
