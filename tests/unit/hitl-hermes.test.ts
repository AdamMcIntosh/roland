/**
 * HITL → Hermes propagation — unit tests
 * Scoped run: npx vitest run tests/unit/hitl-hermes.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildHitlStatusReport,
  emitHermesHitlEvent,
  formatHermesHitlSummary,
  pollHermesHitlEvents,
  HERMES_HITL_EVENTS_FILE,
} from '../../src/rco/hitl-hermes.js';
import { HitlQueue } from '../../src/rco/hitl.js';
import { GitCommitApprovalQueue } from '../../src/loop-engine/git-commit-approval.js';

describe('hitl-hermes', () => {
  let tmpDir: string;
  let stateDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-hitl-hermes-'));
    stateDir = path.join(tmpDir, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emitHermesHitlEvent appends to jsonl and poll returns new events', () => {
    const t0 = Date.now();
    const ev = emitHermesHitlEvent(stateDir, {
      kind: 'loop-escalation',
      blockerDescription: 'Retry budget exhausted',
      currentGate: 'escalation',
      suggestedActions: ['roland resume'],
    });

    expect(ev.id).toMatch(/^hitl-/);
    expect(fs.existsSync(path.join(stateDir, HERMES_HITL_EVENTS_FILE))).toBe(true);

    const all = pollHermesHitlEvents(stateDir, 0);
    expect(all.length).toBe(1);
    expect(all[0]!.kind).toBe('loop-escalation');

    const none = pollHermesHitlEvents(stateDir, t0 + 60_000);
    expect(none.length).toBe(0);
  });

  it('buildHitlStatusReport detects paused run', () => {
    fs.writeFileSync(
      path.join(stateDir, 'run-state.json'),
      JSON.stringify({ runId: 'r1', goal: 'Test goal', status: 'running', updatedAt: Date.now() }),
    );
    fs.writeFileSync(
      path.join(stateDir, 'supervisor.pid'),
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    );
    const q = new HitlQueue(stateDir);
    q.setPaused(true);

    const report = buildHitlStatusReport(stateDir);
    expect(report.waitingOnHitl).toBe(true);
    expect(report.currentGate).toBe('pause');
    expect(report.suggestedActions).toContain('roland resume');
  });

  it('buildHitlStatusReport detects pending git-commit approval', () => {
    fs.writeFileSync(
      path.join(stateDir, 'run-state.json'),
      JSON.stringify({ runId: 'r1', goal: 'Commit test', status: 'running', updatedAt: Date.now() }),
    );
    fs.writeFileSync(
      path.join(stateDir, 'supervisor.pid'),
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    );
    const queue = new GitCommitApprovalQueue(stateDir);
    queue.submit({
      iteration: 1,
      hookLabel: 'commit',
      message: 'feat: add tests',
      statusPreview: 'M file.ts',
      cwd: tmpDir,
      autoRejectOnTimeout: true,
      timeoutMs: 60_000,
    });

    const report = buildHitlStatusReport(stateDir);
    expect(report.waitingOnHitl).toBe(true);
    expect(report.currentGate).toBe('git-commit');
    expect(report.gitCommitApproval?.message).toContain('feat: add tests');
  });

  it('formatHermesHitlSummary produces Master Chief one-liner', () => {
    const report = buildHitlStatusReport(stateDir);
    expect(formatHermesHitlSummary(report)).toMatch(/idle|No active mission/i);

    fs.writeFileSync(
      path.join(stateDir, 'run-state.json'),
      JSON.stringify({ runId: 'r1', goal: 'Ship feature', status: 'running', updatedAt: Date.now() }),
    );
    fs.writeFileSync(
      path.join(stateDir, 'supervisor.pid'),
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    );
    const queue = new GitCommitApprovalQueue(stateDir);
    queue.submit({
      iteration: 1,
      hookLabel: 'commit',
      message: 'feat: ship',
      statusPreview: 'M file.ts',
      cwd: tmpDir,
      autoRejectOnTimeout: true,
      timeoutMs: 60_000,
    });

    const active = buildHitlStatusReport(stateDir);
    const summary = formatHermesHitlSummary(active);
    expect(summary).toMatch(/Mission blocked|git-commit/i);
  });
});
