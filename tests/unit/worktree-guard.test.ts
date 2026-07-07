/**
 * worktree-guard — dirty git worktree protection.
 *
 * Scoped: npm run test:run -- tests/unit/worktree-guard.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import {
  getWorktreeStatus,
  isWorktreeDirty,
  assertCleanWorktree,
  DirtyWorktreeError,
  formatDirtyWorktreeMessage,
  stashWorktree,
  popAutoStash,
} from '../../src/utils/worktree-guard.js';

function initRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@roland.local"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Roland Test"', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf-8');
  execSync('git add README.md', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: dir, stdio: 'pipe' });
}

describe('worktree-guard', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-git-'));
    initRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports clean worktree after initial commit', () => {
    const status = getWorktreeStatus(tmpDir);
    expect(status).not.toBeNull();
    expect(status!.dirty).toBe(false);
    expect(isWorktreeDirty(tmpDir)).toBe(false);
  });

  it('detects untracked files as dirty', () => {
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'hello', 'utf-8');
    expect(isWorktreeDirty(tmpDir)).toBe(true);
  });

  it('throws DirtyWorktreeError when dirty and no escape hatch', () => {
    fs.writeFileSync(path.join(tmpDir, 'dirty.txt'), 'x', 'utf-8');
    expect(() => assertCleanWorktree(tmpDir)).toThrow(DirtyWorktreeError);
  });

  it('allows dirty worktree with --force equivalent', () => {
    fs.writeFileSync(path.join(tmpDir, 'dirty.txt'), 'x', 'utf-8');
    const result = assertCleanWorktree(tmpDir, { force: true });
    expect(result.repoRoot).toBeTruthy();
  });

  it('auto-stash clears dirty state', () => {
    fs.writeFileSync(path.join(tmpDir, 'dirty.txt'), 'x', 'utf-8');
    const status = getWorktreeStatus(tmpDir)!;
    expect(status.dirty).toBe(true);

    const result = assertCleanWorktree(tmpDir, { autoStash: true, stashReason: 'roland: auto-stash test' });
    expect(result.stashed).toBe(true);
    expect(isWorktreeDirty(tmpDir)).toBe(false);

    const popped = popAutoStash(tmpDir);
    expect(popped).toBe(true);
    expect(isWorktreeDirty(tmpDir)).toBe(true);
  });

  it('formatDirtyWorktreeMessage lists changed files', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a', 'utf-8');
    const status = getWorktreeStatus(tmpDir)!;
    const msg = formatDirtyWorktreeMessage(status);
    expect(msg).toContain('uncommitted changes');
    expect(msg).toContain('--auto-stash');
    expect(msg).toContain('--force');
    expect(msg).toContain('a.txt');
  });

  it('stashWorktree returns false on clean tree', () => {
    expect(stashWorktree(tmpDir)).toBe(false);
  });
});
