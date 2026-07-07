/**
 * Dirty worktree guard — refuse repo-modifying commands when uncommitted changes exist.
 *
 * Non-destructive by default. Escape hatches: --force, --auto-stash.
 */

import { execSync } from 'child_process';
import os from 'os';
import { gitStatus } from './git-tools.js';

export interface WorktreeStatus {
  repoRoot: string;
  dirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface WorktreeGuardOptions {
  /** Skip the guard entirely. */
  force?: boolean;
  /** Stash changes before proceeding (foreground missions pop after). */
  autoStash?: boolean;
  /** Label for stash message. */
  stashReason?: string;
}

export class DirtyWorktreeError extends Error {
  readonly status: WorktreeStatus;

  constructor(status: WorktreeStatus, message: string) {
    super(message);
    this.name = 'DirtyWorktreeError';
    this.status = status;
  }
}

/** Resolve git repo root from cwd; returns null when not in a repo. */
export function resolveGitRepoRoot(cwd: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/** Inspect worktree cleanliness relative to repo root. */
export function getWorktreeStatus(cwd: string): WorktreeStatus | null {
  const repoRoot = resolveGitRepoRoot(cwd);
  if (!repoRoot) return null;

  const { staged, unstaged, untracked } = gitStatus(repoRoot);
  const dirty = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;
  return { repoRoot, dirty, staged, unstaged, untracked };
}

export function isWorktreeDirty(cwd: string): boolean {
  return getWorktreeStatus(cwd)?.dirty ?? false;
}

function shellHint(): string {
  if (process.platform === 'win32') {
    return 'PowerShell: git stash push -u -m "before roland mission"';
  }
  return 'bash/zsh: git stash push -u -m "before roland mission"';
}

function formatFileList(files: string[], max = 8): string {
  if (files.length === 0) return '';
  const shown = files.slice(0, max);
  const lines = shown.map((f) => `      • ${f}`);
  if (files.length > max) {
    lines.push(`      • … and ${files.length - max} more`);
  }
  return lines.join('\n');
}

/** Human-friendly error message with platform-aware guidance. */
export function formatDirtyWorktreeMessage(status: WorktreeStatus): string {
  const parts: string[] = [
    '',
    '  ❌  Refusing to start — your git worktree has uncommitted changes.',
    '',
    '  Roland missions can modify files, switch branches, or commit. Running on a',
    '  dirty worktree risks losing uncommitted work.',
    '',
  ];

  if (status.staged.length) {
    parts.push(`  Staged (${status.staged.length}):`, formatFileList(status.staged), '');
  }
  if (status.unstaged.length) {
    parts.push(`  Modified (${status.unstaged.length}):`, formatFileList(status.unstaged), '');
  }
  if (status.untracked.length) {
    parts.push(`  Untracked (${status.untracked.length}):`, formatFileList(status.untracked), '');
  }

  parts.push(
    '  What you can do:',
    '',
    `    1. Commit or stash manually — ${shellHint()}`,
    '    2. Re-run with --auto-stash   (stash before mission, pop after — foreground only)',
    '    3. Re-run with --force        (skip guard — you accept the risk)',
    '',
    `  Repo: ${status.repoRoot}`,
    '',
  );

  return parts.join('\n');
}

const STASH_MARKER = 'roland: auto-stash';

/** Stash all changes including untracked. Returns true when a stash was created. */
export function stashWorktree(repoRoot: string, reason?: string): boolean {
  const message = reason?.trim() || STASH_MARKER;
  try {
    const porcelain = execSync('git status --porcelain', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!porcelain) return false;
    execSync(`git stash push -u -m ${JSON.stringify(message)}`, {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`git stash failed: ${msg}`);
  }
}

/** Pop the most recent roland auto-stash if present. */
export function popAutoStash(repoRoot: string): boolean {
  try {
    const list = execSync('git stash list', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!list) return false;
    const firstLine = list.split('\n')[0] ?? '';
    if (!firstLine.includes(STASH_MARKER)) return false;
    execSync('git stash pop stash@{0}', {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Assert the worktree is clean before a repo-modifying command.
 * Throws DirtyWorktreeError when dirty and no escape hatch is set.
 * Returns repoRoot when proceeding (clean, forced, or stashed).
 */
export function assertCleanWorktree(
  cwd: string,
  opts: WorktreeGuardOptions = {},
): { repoRoot: string; stashed: boolean } {
  const status = getWorktreeStatus(cwd);
  if (!status) {
    // Not a git repo — allow (doctor warns separately).
    return { repoRoot: cwd, stashed: false };
  }

  if (!status.dirty) {
    return { repoRoot: status.repoRoot, stashed: false };
  }

  if (opts.force) {
    return { repoRoot: status.repoRoot, stashed: false };
  }

  if (opts.autoStash) {
    const stashed = stashWorktree(status.repoRoot, opts.stashReason);
    return { repoRoot: status.repoRoot, stashed };
  }

  throw new DirtyWorktreeError(status, formatDirtyWorktreeMessage(status));
}

/** Short platform label for doctor hints. */
export function platformLabel(): string {
  const map: Record<string, string> = {
    win32: 'Windows (PowerShell)',
    darwin: 'macOS (zsh/bash)',
    linux: 'Linux (bash)',
  };
  return map[os.platform()] ?? os.platform();
}
