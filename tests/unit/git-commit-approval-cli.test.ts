/**
 * CLI git-commit approval verb tests (mocked file I/O via temp dir).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GitCommitApprovalQueue } from '../../src/loop-engine/git-commit-approval.js';
import {
  decideGitCommitApprovalCli,
  readPendingGitCommitApproval,
  resolveGitCommitApprovalId,
  runApproveCommitCli,
  runRejectCommitCli,
} from '../../src/rco/git-commit-approval-cli.js';

describe('git-commit-approval-cli', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-gc-cli-'));
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  function submitPending(message = 'feat: test commit') {
    const queue = new GitCommitApprovalQueue(stateDir);
    return queue.submit({
      iteration: 3,
      hookLabel: 'git-commit',
      message,
      statusPreview: ' M src/foo.ts',
      cwd: process.cwd(),
      autoRejectOnTimeout: true,
      timeoutMs: 60_000,
    });
  }

  it('readPendingGitCommitApproval returns pending request', () => {
    const req = submitPending();
    const pending = readPendingGitCommitApproval(stateDir);
    expect(pending?.id).toBe(req.id);
    expect(pending?.status).toBe('pending');
  });

  it('resolveGitCommitApprovalId uses pending id when omitted', () => {
    const req = submitPending();
    const resolved = resolveGitCommitApprovalId(stateDir);
    expect('id' in resolved && resolved.id).toBe(req.id);
  });

  it('resolveGitCommitApprovalId rejects id mismatch', () => {
    submitPending();
    const resolved = resolveGitCommitApprovalId(stateDir, 'wrong-id');
    expect('error' in resolved).toBe(true);
    if ('error' in resolved) {
      expect(resolved.error).toContain('mismatch');
      expect(resolved.exitCode).toBe(1);
    }
  });

  it('decideGitCommitApprovalCli approve with edited message', () => {
    const req = submitPending('original');
    const result = decideGitCommitApprovalCli('approve', {
      stateDir,
      id: req.id,
      message: 'edited subject',
      interactive: false,
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe('edited subject');

    const queue = new GitCommitApprovalQueue(stateDir);
    expect(queue.read()?.status).toBe('approved');
  });

  it('decideGitCommitApprovalCli reject with reason', () => {
    const req = submitPending();
    const result = decideGitCommitApprovalCli('reject', {
      stateDir,
      id: req.id,
      reason: 'not ready',
      interactive: false,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toContain('not ready');

    const queue = new GitCommitApprovalQueue(stateDir);
    expect(queue.read()?.status).toBe('rejected');
  });

  it('decideGitCommitApprovalCli handles missing approval gracefully', () => {
    const result = decideGitCommitApprovalCli('approve', {
      stateDir,
      id: 'missing',
      interactive: false,
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
  });

  it('decideGitCommitApprovalCli handles already-resolved approval', () => {
    const req = submitPending();
    const queue = new GitCommitApprovalQueue(stateDir);
    queue.decide(req.id, 'approve');

    const result = decideGitCommitApprovalCli('approve', {
      stateDir,
      id: req.id,
      interactive: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('already approved');
  });

  it('runApproveCommitCli approves without explicit id when one pending', () => {
    submitPending('ship it');
    const code = runApproveCommitCli(['--state-dir', stateDir]);
    expect(code).toBe(0);

    const queue = new GitCommitApprovalQueue(stateDir);
    expect(queue.read()?.status).toBe('approved');
  });

  it('runRejectCommitCli rejects with reason', () => {
    submitPending();
    const code = runRejectCommitCli(['--state-dir', stateDir, '--reason', 'wip']);
    expect(code).toBe(0);

    const queue = new GitCommitApprovalQueue(stateDir);
    expect(queue.read()?.reason).toBe('wip');
  });

  it('concurrent decide returns failure when already decided', () => {
    const req = submitPending();
    const queue = new GitCommitApprovalQueue(stateDir);
    expect(queue.decide(req.id, 'approve')).toBe(true);
    expect(queue.decide(req.id, 'reject')).toBe(false);
  });
});
