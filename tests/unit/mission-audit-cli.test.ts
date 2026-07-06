/**
 * Mission audit CLI — timeline reconstruction tests.
 *
 * Run: npx vitest run tests/unit/mission-audit-cli.test.ts
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildMissionAudit,
  formatAuditMarkdown,
  parseMissionAuditArgs,
} from '../../src/rco/mission-audit-cli.js';
import { RUN_STATE_FILE } from '../../src/rco/run-state.js';
import { LOOP_HISTORY_FILE } from '../../src/loop-engine/loop-observability.js';
import { HERMES_HITL_EVENTS_FILE } from '../../src/rco/hitl-hermes.js';

describe('mission-audit-cli', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-audit-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buildMissionAudit merges loop history and HITL events chronologically', () => {
    const runId = 'abc123';
    fs.writeFileSync(
      path.join(tmpDir, RUN_STATE_FILE),
      JSON.stringify({ runId, goal: 'Test goal', status: 'done', startedAt: 1000, updatedAt: 5000 }),
    );
    fs.writeFileSync(
      path.join(tmpDir, LOOP_HISTORY_FILE),
      JSON.stringify({
        entries: [
          { id: '1', templateId: 'standard-code-loop', iteration: 1, phase: 'plan', event: 'start', at: 1100 },
          { id: '2', templateId: 'standard-code-loop', iteration: 1, phase: 'plan', event: 'complete', at: 1200, success: true },
        ],
      }),
    );
    fs.appendFileSync(
      path.join(tmpDir, HERMES_HITL_EVENTS_FILE),
      JSON.stringify({
        id: 'e1',
        timestamp: 1300,
        kind: 'blocker',
        blockerDescription: 'Test blocker',
        currentGate: 'verify',
        suggestedActions: [],
      }) + '\n',
    );

    const report = buildMissionAudit(tmpDir, { runId });
    expect(report).not.toBeNull();
    expect(report!.runId).toBe(runId);
    expect(report!.entries.length).toBeGreaterThanOrEqual(3);
    expect(report!.entries[0]!.timestamp).toBeLessThanOrEqual(report!.entries[1]!.timestamp);
  });

  it('formatAuditMarkdown includes goal and timeline', () => {
    const report = {
      runId: 'x1',
      goal: 'Ship feature',
      stateDir: tmpDir,
      generatedAt: Date.now(),
      entries: [
        { timestamp: 100, source: 'loop-history' as const, kind: 'phase-start', summary: 'plan start' },
      ],
      metrics: null,
      runState: null,
    };
    const md = formatAuditMarkdown(report);
    expect(md).toContain('Ship feature');
    expect(md).toContain('plan start');
  });

  it('parseMissionAuditArgs handles --last and --format', () => {
    const opts = parseMissionAuditArgs(['--last', '--format', 'json', '--state-dir', '.roland']);
    expect(opts.last).toBe(true);
    expect(opts.format).toBe('json');
    expect(opts.stateDir).toBe('.roland');
  });
});
