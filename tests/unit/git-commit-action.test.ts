/**
 * git-commit built-in hook action tests.
 */

import { describe, it, expect } from 'vitest';
import { runGitCommitAction } from '../../src/loop-engine/git-commit-action.js';
import path from 'path';

describe('runGitCommitAction', () => {
  it('dry_run previews message and does not commit', () => {
    const result = runGitCommitAction({
      cwd: path.resolve(process.cwd()),
      messageTemplate: 'loop({iteration}): {goal}',
      dryRun: true,
      vars: { iteration: 2, goal: 'Ship feature X' },
    });
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.message).toBe('loop(2): Ship feature X');
    expect(result.stdout).toContain('Proposed message');
    expect(result.stdout).toContain('git status --short');
  });

  it('literalMessage bypasses template interpolation', () => {
    const result = runGitCommitAction({
      cwd: path.resolve(process.cwd()),
      messageTemplate: 'ignored {goal}',
      dryRun: true,
      literalMessage: 'exact commit message',
      vars: { goal: 'X' },
    });
    expect(result.message).toBe('exact commit message');
  });
});
