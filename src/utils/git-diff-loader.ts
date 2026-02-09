/**
 * Git Diff Loader - Selective file loading based on recent changes
 *
 * Uses native git commands (via child_process) to identify recently
 * changed files so that the doc-review process focuses on what matters
 * and skips unchanged files.  No external npm dependencies needed.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface GitDiffEntry {
  /** Relative path from repo root */
  file: string;
  /** Status character: A=added, M=modified, D=deleted, R=renamed */
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | string;
  /** Unified diff text (if available) */
  diff?: string;
  /** Number of added lines */
  additions: number;
  /** Number of removed lines */
  deletions: number;
}

export interface DiffLoadOptions {
  /** How far back to look: commit ref, branch, or 'staged' / 'unstaged' */
  scope?: 'staged' | 'unstaged' | 'HEAD~1' | 'HEAD~5' | string;
  /** Only include files matching these extensions */
  extensions?: string[];
  /** Include full diff text in the entries */
  includeDiff?: boolean;
  /** Max diff text per file in characters (to cap token consumption) */
  maxDiffChars?: number;
}

// ============================================================================
// Helpers
// ============================================================================

function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function gitExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,  // 10 MB
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the list of changed files with metadata.
 *
 * @param projectDir - Absolute path to the repository root
 * @param opts - Options to control scope and filtering
 */
export function getChangedFiles(
  projectDir: string,
  opts: DiffLoadOptions = {},
): GitDiffEntry[] {
  const {
    scope = 'HEAD~1',
    extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.md'],
    includeDiff = false,
    maxDiffChars = 4000,
  } = opts;

  const absDir = path.resolve(projectDir);

  if (!isGitRepo(absDir)) {
    logger.warn('[GitDiffLoader] Not a git repository — returning empty diff list');
    return [];
  }

  // Build the diff command based on scope
  let nameStatusCmd: string;
  let diffCmd: string;

  switch (scope) {
    case 'staged':
      nameStatusCmd = 'git diff --cached --name-status';
      diffCmd = 'git diff --cached';
      break;
    case 'unstaged':
      nameStatusCmd = 'git diff --name-status';
      diffCmd = 'git diff';
      break;
    default:
      // e.g. HEAD~1, HEAD~5, main, origin/main
      nameStatusCmd = `git diff ${scope} --name-status`;
      diffCmd = `git diff ${scope}`;
      break;
  }

  const raw = gitExec(nameStatusCmd, absDir);
  if (!raw) {
    logger.info('[GitDiffLoader] No changes detected');
    return [];
  }

  const entries: GitDiffEntry[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    // Format: "M\tsrc/foo.ts" or "R100\told.ts\tnew.ts"
    const parts = line.split('\t');
    const status = parts[0].charAt(0);
    const file = parts.length >= 3 ? parts[2] : parts[1]; // handle renames

    if (!file) continue;

    // Extension filter
    const ext = path.extname(file).toLowerCase();
    if (extensions.length > 0 && !extensions.includes(ext)) continue;

    const entry: GitDiffEntry = {
      file,
      status,
      additions: 0,
      deletions: 0,
    };

    // Count additions/deletions per file
    const numstat = gitExec(
      `${nameStatusCmd.replace('--name-status', '--numstat')} -- "${file}"`,
      absDir,
    );
    if (numstat) {
      const [add, del] = numstat.split('\t');
      entry.additions = parseInt(add, 10) || 0;
      entry.deletions = parseInt(del, 10) || 0;
    }

    // Include actual diff text if requested
    if (includeDiff && status !== 'D') {
      let fileDiff = gitExec(`${diffCmd} -- "${file}"`, absDir);
      if (fileDiff.length > maxDiffChars) {
        fileDiff = fileDiff.slice(0, maxDiffChars) + '\n... (truncated)';
      }
      entry.diff = fileDiff;
    }

    entries.push(entry);
  }

  logger.info(
    `[GitDiffLoader] Found ${entries.length} changed files ` +
    `(+${entries.reduce((s, e) => s + e.additions, 0)} / ` +
    `-${entries.reduce((s, e) => s + e.deletions, 0)})`,
  );

  return entries;
}

/**
 * Read only the changed files' full contents — useful for targeted
 * summarization or doc-review without scanning the whole codebase.
 *
 * Returns a map of { relativePath → fileContents }.
 * Deleted files are excluded.
 */
export function readChangedFiles(
  projectDir: string,
  opts: DiffLoadOptions = {},
): Map<string, string> {
  const absDir = path.resolve(projectDir);
  const entries = getChangedFiles(absDir, opts);
  const result = new Map<string, string>();

  for (const entry of entries) {
    if (entry.status === 'D') continue;

    const fullPath = path.join(absDir, entry.file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      result.set(entry.file, content);
    } catch {
      logger.debug(`[GitDiffLoader] Could not read ${entry.file}`);
    }
  }

  return result;
}

/**
 * Build a concise prompt fragment from changed files — for injection into
 * an LLM prompt so it knows which files were recently modified.
 */
export function changedFilesPrompt(entries: GitDiffEntry[]): string {
  if (entries.length === 0) return '(No recent changes detected)';

  const lines = ['# Recently Changed Files\n'];
  for (const e of entries) {
    const tag =
      e.status === 'A' ? '[NEW]' :
      e.status === 'D' ? '[DELETED]' :
      e.status === 'R' ? '[RENAMED]' :
      '[MODIFIED]';

    lines.push(`- ${tag} ${e.file} (+${e.additions}/-${e.deletions})`);

    if (e.diff) {
      lines.push('```diff');
      lines.push(e.diff);
      lines.push('```');
    }
  }

  return lines.join('\n');
}
