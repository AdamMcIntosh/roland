import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildBoardStatusReport,
  formatConciseUnscSummary,
  parseCallsignRoster,
} from '../../src/rco/board-report.js';
import { CommandBlackboard } from '../../src/rco/command-blackboard.js';
import { Blackboard } from '../../src/rco/blackboard.js';

describe('board-report', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-board-report-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parseCallsignRoster reads agent status bullets', () => {
    const board = new CommandBlackboard(tmpDir);
    board.setAgentStatus({
      callsign: 'Sparrow',
      state: 'active',
      currentTaskId: 'task-2',
      lastUpdated: Date.now(),
      note: 'Implement endpoint',
    });
    board.setAgentStatus({
      callsign: 'Vanguard',
      state: 'complete',
      lastUpdated: Date.now(),
    });
    const content = fs.readFileSync(path.join(tmpDir, 'command-blackboard.md'), 'utf-8');
    const roster = parseCallsignRoster(content);
    const sparrow = roster.find((r) => r.callsign === 'Sparrow');
    const vanguard = roster.find((r) => r.callsign === 'Vanguard');
    expect(sparrow?.state).toBe('active');
    expect(sparrow?.currentTaskId).toBe('task-2');
    expect(vanguard?.state).toBe('complete');
  });

  it('formatConciseUnscSummary is blockers-first and includes roster', () => {
    const board = new CommandBlackboard(tmpDir);
    board.appendBullet('Mission Objectives', '[P2 active] Add health check endpoint');
    board.setAgentStatus({ callsign: 'Roland', state: 'complete', lastUpdated: Date.now() });
    board.setAgentStatus({ callsign: 'Sparrow', state: 'complete', lastUpdated: Date.now() });

    const bb = new Blackboard(tmpDir);
    bb.post({
      type: 'blocker',
      title: 'BLOCKER: Vanguard on "run tests"',
      content: 'Cannot find vitest config',
      status: 'pending',
      author: 'test-executor',
      priority: 'critical',
      tags: ['blocker'],
      relatedIds: [],
    });

    const report = buildBoardStatusReport(tmpDir, 'Add health check endpoint');
    const summary = formatConciseUnscSummary(report);

    expect(summary).toContain('UNSC Mission Status');
    expect(summary).toContain('Blockers');
    expect(summary).toContain('Vanguard');
    expect(summary).toContain('Roland ✓');
    expect(summary.indexOf('Blockers')).toBeLessThan(summary.indexOf('Roland ✓'));
  });

  it('buildBoardStatusReport handles empty state', () => {
    const report = buildBoardStatusReport(tmpDir);
    expect(report.counts.total).toBe(0);
    expect(report.roster.length).toBe(7);
    expect(formatConciseUnscSummary(report)).toContain('_(none)_');
  });
});
