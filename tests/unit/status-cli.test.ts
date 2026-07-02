/**
 * CLI-first status printers — unit tests
 * Scoped run: npx vitest run tests/unit/status-cli.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printHitlStatus, printMissionSummary, printHitlEvents } from '../../src/rco/status-cli.js';
import { emitHermesHitlEvent, emitHermesMissionComplete, buildMissionCompletionReport } from '../../src/rco/hitl-hermes.js';
import { HitlQueue } from '../../src/rco/hitl.js';

describe('status-cli', () => {
  let tmpDir: string;
  let stateDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-status-cli-'));
    stateDir = path.join(tmpDir, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('printHitlStatus outputs summary and markdown', () => {
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

    printHitlStatus(stateDir);

    const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(stderr).toContain('HITL Status');
    expect(stderr).toContain('roland resume');
    expect(stdoutSpy).toHaveBeenCalled();
    const md = String(stdoutSpy.mock.calls[0]![0]);
    expect(md).toContain('## HITL Status');
  });

  it('printHitlStatus --json writes structured payload to stdout', () => {
    printHitlStatus(stateDir, { json: true });
    expect(stdoutSpy).toHaveBeenCalled();
    const payload = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(payload).toHaveProperty('waitingOnHitl');
    expect(payload).toHaveProperty('summary');
  });

  it('printMissionSummary reports found completion', () => {
    const report = buildMissionCompletionReport(stateDir, { goal: 'Ship feature X' });
    emitHermesMissionComplete(stateDir, report);

    printMissionSummary(stateDir);

    const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(stderr).toContain('Mission Summary');
    expect(stdoutSpy).toHaveBeenCalled();
    expect(String(stdoutSpy.mock.calls[0]![0])).toContain('## Mission Complete');
  });

  it('printHitlEvents lists new events since timestamp', () => {
    const t0 = Date.now();
    emitHermesHitlEvent(stateDir, {
      kind: 'blocker',
      blockerDescription: 'Cannot reach API',
      currentGate: 'blocker',
    });

    printHitlEvents(stateDir, { since: t0 - 1000 });

    const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(stderr).toContain('blocker');
  });
});
