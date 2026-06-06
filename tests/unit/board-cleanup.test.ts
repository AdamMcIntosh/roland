import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CommandBlackboard } from '../../src/rco/command-blackboard.js';
import { Blackboard } from '../../src/rco/blackboard.js';
import {
  cleanupBoardsForNewMission,
  cleanupCommandBlackboard,
  cleanupMachineBlackboard,
} from '../../src/rco/board-cleanup.js';

const STALE_BOARD = `# UNSC Command Blackboard

## Mission Objectives

- [P1 active] Integrate payment system with Stripe
- [P2 active] Add health check endpoint

## Key Decisions

- 2026-06-04: Use Redis for sessions

## Active Tasks

- [done] task-9 — Sparrow: Implement Stripe integration
- [pending] task-20 follow-up — Sentinel review queue
- [in_progress] task-21 — Sparrow: Add pino logging middleware

## Agent Status

- **Roland**: complete
- **Sparrow**: active task:task-21

## Open Intel

- [BLOCKER cleared] UUID schema mismatch fixed
- Does woody use pino or winston?

## Artifacts

- Branch: feature/stripe

## Agent Logs

### Sparrow
- [2026-06-04T14:18:00.000Z] Landed src/payments/*
`;

describe('board-cleanup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-cleanup-'));
    fs.writeFileSync(path.join(tmpDir, 'command-blackboard.md'), STALE_BOARD, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes done and stale pending tasks from command board', () => {
    const board = new CommandBlackboard(tmpDir);
    const result = cleanupCommandBlackboard(board, {
      goal: 'Add structured request logging middleware using pino to the woody Express server',
    });

    expect(result.activeTasksRemoved.some((t) => t.includes('[done]'))).toBe(true);
    expect(result.activeTasksRemoved.some((t) => t.includes('task-20'))).toBe(true);

    const snap = board.snapshot();
    expect(snap).not.toContain('[done] task-9');
    expect(snap).not.toContain('task-20 follow-up');
    expect(snap).toContain('pino logging');
  });

  it('archives objectives unrelated to new goal', () => {
    const board = new CommandBlackboard(tmpDir);
    const result = cleanupCommandBlackboard(board, {
      goal: 'Add pino request logging to woody Express server',
    });

    expect(result.objectivesArchived.some((o) => o.includes('Stripe'))).toBe(true);
    const snap = board.snapshot();
    expect(snap).not.toMatch(/\[P1 active\] Integrate payment/);
  });

  it('clears resolved intel', () => {
    const board = new CommandBlackboard(tmpDir);
    const result = cleanupCommandBlackboard(board, { goal: 'Add pino logging' });

    expect(result.intelRemoved.some((i) => i.includes('cleared'))).toBe(true);
    expect(board.snapshot()).toContain('pino or winston');
  });

  it('archives stale blackboard.json tasks', () => {
    const bb = new Blackboard(tmpDir);
    bb.post({
      type: 'task',
      title: 'Old pending task',
      content: 'Stripe webhook handler',
      status: 'pending',
      author: 'pm',
      priority: 'medium',
      tags: [],
      relatedIds: [],
    });
    bb.post({
      type: 'task',
      title: 'Logging task',
      content: 'pino middleware for woody express',
      status: 'in_progress',
      author: 'pm',
      priority: 'high',
      tags: [],
      relatedIds: [],
    });

    const { archived, titles } = cleanupMachineBlackboard(bb, {
      goal: 'Add pino logging middleware to woody Express server',
    });

    expect(archived).toBe(1);
    expect(titles[0]).toContain('Old pending');
    expect(bb.read({ status: 'archived' }).length).toBe(1);
  });

  it('cleanupBoardsForNewMission runs both layers', () => {
    const bb = new Blackboard(tmpDir);
    bb.post({
      type: 'task',
      title: 'Done old task',
      content: 'completed',
      status: 'done',
      author: 'pm',
      priority: 'low',
      tags: [],
      relatedIds: [],
    });

    const result = cleanupBoardsForNewMission(tmpDir, 'Add pino logging to woody');
    expect(result.blackboardArchived).toBe(1);
    expect(result.commandBoard.activeTasksRemoved.length).toBeGreaterThan(0);
  });

  it('smartSnapshot excludes stale done tasks', () => {
    const board = new CommandBlackboard(tmpDir);
    const snap = board.smartSnapshot('Add pino logging middleware woody Express');
    expect(snap).not.toContain('[done] task-9');
    expect(snap).not.toContain('BLOCKER cleared');
  });
});
