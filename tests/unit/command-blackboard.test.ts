import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CommandBlackboard, buildEmptyTemplate, BLACKBOARD_SECTIONS } from '../../src/rco/command-blackboard.js';

describe('CommandBlackboard', () => {
  let tmpDir: string;
  let board: CommandBlackboard;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-board-'));
    board = new CommandBlackboard(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates template with all sections', () => {
    const content = fs.readFileSync(path.join(tmpDir, 'command-blackboard.md'), 'utf-8');
    for (const section of BLACKBOARD_SECTIONS) {
      expect(content).toContain(`## ${section}`);
    }
  });

  it('appendBullet deduplicates by prefix', () => {
    board.appendBullet('Key Decisions', '2026-06-04: Use Redis for rate limiting');
    board.appendBullet('Key Decisions', '2026-06-04: Use Redis for rate limiting');
    const snap = board.snapshot();
    const matches = snap.match(/Use Redis for rate limiting/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('setAgentStatus updates callsign row', () => {
    board.setAgentStatus({
      callsign: 'Sparrow',
      state: 'active',
      currentTaskId: 'task-2',
      lastUpdated: Date.now(),
    });
    const snap = board.snapshot();
    expect(snap).toContain('**Sparrow**: active task:task-2');
  });

  it('appendAgentLog adds timestamped entry', () => {
    board.appendAgentLog('Oracle', 'Auth chain mapped');
    const snap = board.snapshot();
    expect(snap).toContain('Auth chain mapped');
    expect(snap).toContain('### Oracle');
  });

  it('extractAndMerge parses synthesis block', () => {
    const added = board.extractAndMerge(`
Some synthesis text

## Command Blackboard Update

**Key Decisions:**
- 2026-06-04: Sliding window in Redis

**Artifacts:**
- PR #142 opened
`);
    expect(added).toBeGreaterThanOrEqual(2);
    const snap = board.snapshot();
    expect(snap).toContain('Sliding window in Redis');
    expect(snap).toContain('PR #142');
  });

  it('smartSnapshot ranks goal-relevant bullets', () => {
    board.appendBullet('Mission Objectives', '[P2 active] Add health check endpoint with tests');
    board.appendBullet('Key Decisions', '2026-01-01: Use PostgreSQL for production');
    board.appendBullet('Key Decisions', 'Health endpoints return JSON with status and uptime fields');

    const snap = board.smartSnapshot('Add health check endpoint with tests');
    expect(snap).toContain('Command Blackboard (smart recall)');
    expect(snap).toContain('health check');
  });

  it('smartSnapshot excludes done and cleared intel', () => {
    board.appendBullet('Active Tasks', '[done] task-1 — Sparrow: Old feature');
    board.appendBullet('Open Intel', '[BLOCKER cleared] schema fixed');
    board.appendBullet('Key Decisions', 'Use pino for structured logging in woody');

    const snap = board.smartSnapshot('Add pino logging to woody Express');
    expect(snap).not.toContain('[done] task-1');
    expect(snap).not.toContain('BLOCKER cleared');
    expect(snap).toContain('pino');
  });

  it('replaceSections updates multiple sections', () => {
    board.replaceSections({
      'Active Tasks': ['[in_progress] task-99 — Sparrow: Current work'],
      'Agent Status': ['**Sparrow**: active task:task-99'],
    });
    const snap = board.snapshot();
    expect(snap).toContain('task-99');
    expect(snap).toContain('**Sparrow**: active');
  });

  it('buildEmptyTemplate is valid markdown', () => {
    const t = buildEmptyTemplate();
    expect(t).toContain('# UNSC Command Blackboard');
    expect(t).toContain('**Roland**: idle');
  });
});
