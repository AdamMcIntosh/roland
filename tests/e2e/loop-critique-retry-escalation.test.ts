/**
 * LoopEngine E2E — standard-code-loop Verify → Critique → Retry → Escalation.
 *
 * Forces verification failure via injected CommandRunner, then asserts:
 *   - Critique always runs after Verify (even on failure)
 *   - critique summary + retryDecision persisted to loop-state.json
 *   - onStateChange syncs lastCritique + loopRetryCount to run-state.json
 *   - phaseHistory records critique transitions
 *   - After retry budget (maxRetries=3) critique escalates to operator (HITL)
 *
 * Scoped run: npx vitest run tests/e2e/loop-critique-retry-escalation.test.ts
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
          strengths: loopState.lastCritique.strengths,
          issues: loopState.lastCritique.issues,
          suggestions: loopState.lastCritique.suggestions,
        }
      : undefined,
  });
}

/** Map shell command to verification strategy type (matches DEFAULT_VERIFICATION_STRATEGIES). */
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

function handlersWithMockVerify(runner: CommandRunner) {
  const map = createDefaultHandlers();
  map.set(Phase.Verify, new VerifyPhaseHandler({ runner }));
  return map;
}

describe('LoopEngine — standard-code-loop critique → retry → escalation E2E', () => {
  let tmpDir: string;
  let templates: LoopTemplates;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-critique-e2e-'));
    templates = new LoopTemplates();
    clearLoopEngineConfigCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearLoopEngineConfigCache();
  });

  it('verify fail → critique → retry cycles → escalate after retry budget with persisted state', async () => {
    const template = templates.get('standard-code-loop');
    expect(template).toBeDefined();
    expect(template!.maxRetries).toBe(3);
    expect(template!.phases.map((p) => p.phase)).toEqual([
      Phase.Plan,
      Phase.Act,
      Phase.Verify,
      Phase.Critique,
      Phase.Retry,
      Phase.Observe,
    ]);

    const goal = 'E2E: verify fail → critique → retry → escalate';
    const blackboard = new Blackboard(tmpDir);
    const runState = new RunStateWriter(tmpDir, goal);

    const phaseStarts: string[] = [];
    const verifyToCritiquePairs: Array<{ verifyIdx: number; critiqueIdx: number }> = [];

    // Fail only unit — localized failure → retry_focused + Composer lane on early cycles.
    const runner = createSelectiveFailRunner(new Set(['unit']));

    const engine = new LoopEngine({
      stateDir: tmpDir,
      template: template!,
      goal,
      blackboard,
      handlers: handlersWithMockVerify(runner),
      hooks: {
        onPhaseStart: (phase) => phaseStarts.push(phase),
        onStateChange: (state) => syncLoopStateToRun(runState, state),
      },
    });

    const result = await engine.run({ hadBlockers: false });

    // ── Final run outcome ─────────────────────────────────────────────────────
    expect(result.status).toBe('escalated');
    expect(result.state.status).toBe('escalated');
    expect(result.state.retryCount).toBe(3);
    expect(result.state.lastVerification?.pass).toBe(false);
    expect(result.state.lastCritique?.retryDecision).toBe('escalate');
    expect(result.state.lastCritique?.summary).toMatch(/escalate to operator/i);

    // ── Critique history across iterations ────────────────────────────────────
    expect(result.state.critiqueHistory?.length).toBe(4);
    const firstCritique = result.state.critiqueHistory![0]!;
    const penultimateCritique = result.state.critiqueHistory![2]!;
    const finalCritique = result.state.critiqueHistory!.at(-1)!;

    expect(firstCritique.retryDecision).toBe('retry_focused');
    expect(firstCritique.model).toBe('composer');
    expect(firstCritique.summary).toMatch(/focused retry on unit/i);
    expect(firstCritique.issues.length).toBeGreaterThan(0);
    expect(firstCritique.suggestions.length).toBeGreaterThan(0);

    expect(penultimateCritique.retryDecision).toBe('retry_focused');
    expect(finalCritique.retryDecision).toBe('escalate');

    // ── Verify always precedes Critique in phase starts ───────────────────────
    for (let i = 0; i < phaseStarts.length - 1; i++) {
      if (phaseStarts[i] === Phase.Verify && phaseStarts[i + 1] === Phase.Critique) {
        verifyToCritiquePairs.push({ verifyIdx: i, critiqueIdx: i + 1 });
      }
    }
    expect(verifyToCritiquePairs.length).toBeGreaterThanOrEqual(4);

    const completedCritiques = result.state.phaseHistory.filter(
      (t) => t.phase === Phase.Critique && t.completedAt !== undefined,
    );
    expect(completedCritiques.length).toBe(4);
    expect(completedCritiques.every((t) => t.summary && t.summary.length > 0)).toBe(true);

    const completedRetries = result.state.phaseHistory.filter(
      (t) => t.phase === Phase.Retry && t.completedAt !== undefined,
    );
    expect(completedRetries.length).toBe(3);

    const completedVerifies = result.state.phaseHistory.filter(
      (t) => t.phase === Phase.Verify && t.completedAt !== undefined,
    );
    expect(completedVerifies.length).toBe(4);
    expect(completedVerifies.every((t) => t.success === false)).toBe(true);

    // ── loop-state.json on disk ───────────────────────────────────────────────
    const loopStatePath = path.join(tmpDir, LOOP_STATE_FILE);
    expect(fs.existsSync(loopStatePath)).toBe(true);

    const persistedLoop = readLoopState(tmpDir);
    expect(persistedLoop).not.toBeNull();
    expect(persistedLoop!.status).toBe('escalated');
    expect(persistedLoop!.templateId).toBe('standard-code-loop');
    expect(persistedLoop!.retryCount).toBe(3);
    expect(persistedLoop!.lastCritique).toMatchObject({
      retryDecision: 'escalate',
      model: expect.stringMatching(/^(grok|composer)$/),
      summary: expect.stringMatching(/escalate/i),
    });
    expect(persistedLoop!.critiqueHistory?.length).toBe(4);
    expect(persistedLoop!.lastVerification?.pass).toBe(false);

    // ── Blackboard critique entries ───────────────────────────────────────────
    const loopEntries = blackboard.read().filter((e) => e.tags.includes('loop'));
    const critiqueDecisionEntries = loopEntries.filter((e) => e.tags.includes('retry-decision'));
    const critiqueDetailEntries = loopEntries.filter((e) => e.tags.includes('critique-detail'));

    expect(critiqueDecisionEntries.length).toBeGreaterThanOrEqual(4);
    expect(critiqueDetailEntries.length).toBeGreaterThanOrEqual(4);

    const firstDecisionEntry = critiqueDecisionEntries[0]!;
    expect(firstDecisionEntry.type).toBe('result');
    expect(firstDecisionEntry.content).toMatch(/RETRY_FOCUSED|retry_focused/i);

    const lastDecisionEntry = critiqueDecisionEntries.at(-1)!;
    expect(lastDecisionEntry.content).toMatch(/ESCALATE|escalate/i);
    expect(lastDecisionEntry.status).toBe('blocked');
    expect(lastDecisionEntry.priority).toBe('critical');

    // ── run-state.json loop fields (team-cli sync path) ───────────────────────
    const runStatePath = path.join(tmpDir, RUN_STATE_FILE);
    expect(fs.existsSync(runStatePath)).toBe(true);

    const persistedRun = readRunState(tmpDir);
    expect(persistedRun).not.toBeNull();
    expect(persistedRun!.loopTemplateId).toBe('standard-code-loop');
    expect(persistedRun!.loopRetryCount).toBe(3);
    expect(persistedRun!.loopIteration).toBe(4);
    expect(persistedRun!.lastVerification?.pass).toBe(false);
    expect(persistedRun!.lastCritique).toMatchObject({
      retryDecision: 'escalate',
      summary: expect.stringMatching(/escalate/i),
      issueCount: expect.any(Number),
    });
    expect(persistedRun!.lastCritique!.issueCount).toBeGreaterThan(0);
  });
});
