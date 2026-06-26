/**
 * git-commit HITL between-iterations integration (mocked approval).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runBetweenIterations } from '../../src/loop-engine/between-iterations.js';
import type { LoopMemory } from '../../src/loop-engine/loop-memory.js';
import type { ResolvedBetweenIterationsHook } from '../../src/loop-engine/loop-template-resolution.js';
import { GitCommitApprovalQueue } from '../../src/loop-engine/git-commit-approval.js';

function mockMemory(): LoopMemory {
  const runs: unknown[] = [];
  return {
    recordBetweenIteration: (run: unknown) => {
      runs.push(run);
    },
  } as unknown as LoopMemory;
}

describe('runBetweenIterations git-commit HITL', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-between-'));
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('rejects commit when operator rejects approval', async () => {
    const hook: ResolvedBetweenIterationsHook = {
      command: '',
      label: 'git-commit',
      timeoutMs: 5000,
      optional: true,
      dryRun: false,
      exitOnFailure: false,
      noOp: false,
      source: 'template',
      action: 'git-commit',
      gitCommit: {
        messageTemplate: 'test({iteration})',
        autoStage: false,
        dryRun: false,
        requireApproval: true,
        approvalTimeoutMs: 3_000,
        autoRejectOnTimeout: true,
      },
    };

    const pending = vi.fn();
    const resolved = vi.fn();

    const runPromise = runBetweenIterations({
      hook,
      iteration: 1,
      cwd: process.cwd(),
      memory: mockMemory(),
      stateDir,
      onApprovalPending: pending,
      onApprovalResolved: resolved,
    });

    await new Promise((r) => setTimeout(r, 80));
    const queue = new GitCommitApprovalQueue(stateDir);
    const req = queue.read();
    expect(req?.status).toBe('pending');
    expect(pending).toHaveBeenCalled();

    queue.decide(req!.id, 'reject', { reason: 'operator said no' });

    const result = await runPromise;
    expect(result.success).toBe(true); // optional hook
    expect(result.run.stderr).toContain('HITL');
    expect(resolved).toHaveBeenCalled();
  });
});
