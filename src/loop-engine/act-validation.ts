/**
 * ## Roland Execution Reliability Fix
 *
 * Post-Act validation — confirms the coding agent actually wrote files to disk.
 * Prevents silent no-ops where missions complete without deliverables.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { isGreenfieldGoal } from '../rco/goal-scope.js';

const SKIP_DIRS = new Set(['.git', '.roland', 'node_modules', 'dist', 'build', '.next', 'coverage']);

export interface WorkspaceBaseline {
  cwd: string;
  isGitRepo: boolean;
  /** Relative paths present at act start (lowercase keys for case-insensitive compare on Windows). */
  fileSnapshot: Map<string, number>;
}

export interface ActValidationResult {
  ok: boolean;
  filesCreated: string[];
  filesModified: string[];
  missingDeliverables: string[];
  message: string;
}

function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

/** Walk project tree and record relative path → mtimeMs (excluding state dirs). */
function snapshotFiles(cwd: string): Map<string, number> {
  const snapshot = new Map<string, number>();

  function walk(dir: string, prefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (shouldSkipDir(ent.name)) continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel);
      } else if (ent.isFile()) {
        try {
          const stat = fs.statSync(full);
          snapshot.set(rel.toLowerCase(), stat.mtimeMs);
        } catch {
          /* unreadable */
        }
      }
    }
  }

  walk(cwd, '');
  return snapshot;
}

/** Capture workspace state immediately before Act phase dispatch. */
export function captureWorkspaceBaseline(cwd: string): WorkspaceBaseline {
  const resolved = path.resolve(cwd);
  return {
    cwd: resolved,
    isGitRepo: isGitRepo(resolved),
    fileSnapshot: snapshotFiles(resolved),
  };
}

/** Infer deliverable filenames from a greenfield goal string. */
export function inferExpectedDeliverables(goal: string): string[] {
  const expected = new Set<string>();
  const g = goal.toLowerCase();

  const FALSE_FILE_POSITIVE = /^(node|react|vue|next|express)\.(js|ts|jsx|tsx)$/i;

  for (const m of goal.matchAll(/\b([a-zA-Z0-9_/-]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml))\b/g)) {
    const normalized = m[1]!.replace(/\\/g, '/');
    const base = path.basename(normalized);
    if (!base || base.startsWith('.') || FALSE_FILE_POSITIVE.test(base)) continue;
    expected.add(base);
  }

  if (isGreenfieldGoal(goal)) {
    if (/\b(node\.?js|npm|typescript|\bts\b|javascript)\b/.test(g)) {
      expected.add('package.json');
    }
    if (/\btypescript\b|\bts\b/.test(g)) {
      expected.add('tsconfig.json');
    }
  }

  return [...expected];
}

function diffAgainstBaseline(
  cwd: string,
  baseline: WorkspaceBaseline,
): { created: string[]; modified: string[] } {
  const after = snapshotFiles(cwd);
  const created: string[] = [];
  const modified: string[] = [];

  for (const [rel, mtime] of after) {
    const before = baseline.fileSnapshot.get(rel);
    if (before === undefined) {
      created.push(rel);
    } else if (mtime > before + 500) {
      modified.push(rel);
    }
  }

  return { created, modified };
}

export interface ValidateActExecutionOptions {
  cwd: string;
  goal: string;
  baseline: WorkspaceBaseline;
  agentOutput?: string;
  /** Skip validation in loop test stubs / CI without real SDK agents. */
  skipInTestMode?: boolean;
}

/**
 * Validate that Act phase produced real filesystem changes.
 * Greenfield goals additionally require inferred deliverables (package.json, hello-world.ts, etc.).
 */
export function validateActExecution(opts: ValidateActExecutionOptions): ActValidationResult {
  if (opts.skipInTestMode || process.env.ROLAND_LOOP_TEST_MODE === '1') {
    return {
      ok: true,
      filesCreated: [],
      filesModified: [],
      missingDeliverables: [],
      message: 'Act validation skipped (test mode)',
    };
  }

  const cwd = path.resolve(opts.cwd);
  const { created, modified } = diffAgainstBaseline(cwd, opts.baseline);
  const meaningfulCreated = created.filter((f) => !f.startsWith('.roland/'));
  const meaningfulModified = modified.filter((f) => !f.startsWith('.roland/'));
  const hasChanges = meaningfulCreated.length > 0 || meaningfulModified.length > 0;

  const expected = isGreenfieldGoal(opts.goal) ? inferExpectedDeliverables(opts.goal) : [];
  const present = new Set([...meaningfulCreated, ...meaningfulModified].map((f) => path.basename(f).toLowerCase()));
  const missingDeliverables = expected.filter((f) => !present.has(f.toLowerCase()));

  if (missingDeliverables.length > 0) {
    return {
      ok: false,
      filesCreated: meaningfulCreated,
      filesModified: meaningfulModified,
      missingDeliverables,
      message:
        `Act phase incomplete — missing deliverables: ${missingDeliverables.join(', ')}. ` +
        `Agent must write files to ${cwd} using editor tools.`,
    };
  }

  if (!hasChanges && isGreenfieldGoal(opts.goal)) {
    return {
      ok: false,
      filesCreated: meaningfulCreated,
      filesModified: meaningfulModified,
      missingDeliverables: expected,
      message:
        `Act phase no-op — no files created or modified in ${cwd}. ` +
        'Greenfield goals require real files on disk (not plan-only responses).',
    };
  }

  if (!hasChanges) {
    const outputLen = opts.agentOutput?.trim().length ?? 0;
    if (outputLen > 80) {
      return {
        ok: false,
        filesCreated: [],
        filesModified: [],
        missingDeliverables: [],
        message:
          'Act phase no-op — agent produced output but no files changed on disk. ' +
          'Implementation must use file tools, not description-only responses.',
      };
    }
    return {
      ok: false,
      filesCreated: [],
      filesModified: [],
      missingDeliverables: [],
      message: 'Act phase no-op — no files created or modified.',
    };
  }

  const parts = [`Act verified — ${meaningfulCreated.length} created, ${meaningfulModified.length} modified`];
  if (meaningfulCreated.length) parts.push(`created: ${meaningfulCreated.slice(0, 8).join(', ')}`);
  return {
    ok: true,
    filesCreated: meaningfulCreated,
    filesModified: meaningfulModified,
    missingDeliverables: [],
    message: parts.join('; '),
  };
}

/**
 * ## Roland Execution Now Reliable
 *
 * Post-Act validation catches silent no-ops before Verify runs.
 * Test commands:
 *   npx vitest run tests/unit/act-validation.test.ts
 *   npx vitest run tests/unit/loop-agent-dispatch.test.ts
 */
