/**
 * git-commit HITL approval queue tests (mocked file I/O via temp dir).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  GitCommitApprovalQueue,
  GIT_COMMIT_APPROVAL_FILE,
} from '../../src/loop-engine/git-commit-approval.js';

describe('GitCommitApprovalQueue', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-approval-'));
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('submit writes pending request to disk', () => {
    const queue = new GitCommitApprovalQueue(stateDir);
    const req = queue.submit({
      iteration: 2,
      hookLabel: 'git-commit',
      message: 'feat: iteration 2',
      statusPreview: 'git status --short:\n M file.ts',
      cwd: process.cwd(),
      autoRejectOnTimeout: true,
      timeoutMs: 60_000,
    });
    expect(req.status).toBe('pending');
    expect(fs.existsSync(path.join(stateDir, GIT_COMMIT_APPROVAL_FILE))).toBe(true);
    const read = queue.read();
    expect(read?.id).toBe(req.id);
    expect(read?.message).toBe('feat: iteration 2');
  });

  it('decide approve resolves with edited message', async () => {
    const queue = new GitCommitApprovalQueue(stateDir);
    const req = queue.submit({
      iteration: 1,
      hookLabel: 'git-commit',
      message: 'original message',
      statusPreview: '(clean)',
      cwd: process.cwd(),
      autoRejectOnTimeout: true,
      timeoutMs: 5_000,
    });

    const ok = queue.decide(req.id, 'approve', { message: 'edited message' });
    expect(ok).toBe(true);

    const result = await queue.waitForDecision(req.id, 1_000, 50);
    expect(result.approved).toBe(true);
    expect(result.message).toBe('edited message');
    expect(result.rejected).toBe(false);
  });

  it('decide reject resolves as rejected', async () => {
    const queue = new GitCommitApprovalQueue(stateDir);
    const req = queue.submit({
      iteration: 1,
      hookLabel: 'git-commit',
      message: 'do not commit',
      statusPreview: '(dirty)',
      cwd: process.cwd(),
      autoRejectOnTimeout: true,
      timeoutMs: 5_000,
    });

    queue.decide(req.id, 'reject', { reason: 'not ready' });

    const result = await queue.waitForDecision(req.id, 1_000, 50);
    expect(result.approved).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('not ready');
  });

  it('auto-rejects on timeout when enabled', async () => {
    const queue = new GitCommitApprovalQueue(stateDir);
    const req = queue.submit({
      iteration: 1,
      hookLabel: 'git-commit',
      message: 'slow approval',
      statusPreview: '(dirty)',
      cwd: process.cwd(),
      autoRejectOnTimeout: true,
      timeoutMs: 100,
    });

    const result = await queue.waitForDecision(req.id, 500, 50);
    expect(result.approved).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(queue.read()?.status).toBe('timeout');
  });
});
