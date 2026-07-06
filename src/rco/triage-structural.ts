/**
 * ## P2 Polish & Reach
 *
 * Cheap structural signals for loop template selection — git diff stats,
 * file types, and repo familiarity. Used by triage-router to complement regex scoring.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface StructuralSignals {
  /** Estimated changed file count (0 when unknown). */
  filesChanged: number;
  /** Approximate diff line count (insertions + deletions). */
  diffLines: number;
  /** Fraction of changed paths that look like tests (0–1). */
  testFileRatio: number;
  /** Fraction of changed paths recently touched in git log (0–1). */
  familiarityRatio: number;
  /** Primary file extensions involved. */
  extensions: string[];
  /** Whether structural data was available. */
  available: boolean;
}

export interface StructuralTemplateBias {
  /** Additive score toward heavier verification templates. */
  verificationWeight: number;
  /** Additive score toward small-fix-loop. */
  smallFixWeight: number;
  /** Additive score toward research-and-plan-loop. */
  researchWeight: number;
  reasons: string[];
}

const TEST_PATH_PATTERN = /(?:^|\/)(?:tests?|__tests__|spec|e2e)(?:\/|$)|\.(?:test|spec)\.[a-z]+$/i;

function safeGit(cwd: string, args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

function parseNumStat(output: string | null): { files: number; lines: number; paths: string[] } {
  if (!output) return { files: 0, lines: 0, paths: [] };
  const paths: string[] = [];
  let lines = 0;
  for (const line of output.split('\n')) {
    const m = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    lines += Number(m[1]) + Number(m[2]);
    paths.push(m[3]!);
  }
  return { files: paths.length, lines, paths };
}

function extensionOf(filePath: string): string {
  const base = path.basename(filePath);
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Gather cheap structural signals from the working tree (best-effort). */
export function gatherStructuralSignals(projectRoot: string = process.cwd()): StructuralSignals {
  const gitDir = path.join(projectRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    return {
      filesChanged: 0,
      diffLines: 0,
      testFileRatio: 0,
      familiarityRatio: 0,
      extensions: [],
      available: false,
    };
  }

  const numstat = parseNumStat(safeGit(projectRoot, 'diff --numstat HEAD'));
  const unstaged = parseNumStat(safeGit(projectRoot, 'diff --numstat'));
  const staged = parseNumStat(safeGit(projectRoot, 'diff --cached --numstat'));

  const pathSet = new Set([...numstat.paths, ...unstaged.paths, ...staged.paths]);
  const paths = [...pathSet];
  const filesChanged = paths.length;
  const diffLines = numstat.lines + unstaged.lines + staged.lines;

  const testCount = paths.filter((p) => TEST_PATH_PATTERN.test(p)).length;
  const testFileRatio = filesChanged > 0 ? testCount / filesChanged : 0;

  const recentLog = safeGit(projectRoot, 'log --name-only --pretty=format: -20');
  const recentPaths = new Set(
    (recentLog ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('commit')),
  );
  const familiarCount = paths.filter((p) => recentPaths.has(p)).length;
  const familiarityRatio = filesChanged > 0 ? familiarCount / filesChanged : 0;

  const extCounts = new Map<string, number>();
  for (const p of paths) {
    const ext = extensionOf(p);
    if (ext) extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }
  const extensions = [...extCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext]) => ext);

  return {
    filesChanged,
    diffLines,
    testFileRatio,
    familiarityRatio,
    extensions,
    available: filesChanged > 0 || diffLines > 0,
  };
}

/** Convert structural signals into template selection bias (lower regex weight companion). */
export function structuralTemplateBias(signals: StructuralSignals): StructuralTemplateBias {
  const reasons: string[] = [];
  let verificationWeight = 0;
  let smallFixWeight = 0;
  let researchWeight = 0;

  if (!signals.available) {
    return { verificationWeight, smallFixWeight, researchWeight, reasons };
  }

  if (signals.filesChanged <= 2 && signals.diffLines < 80) {
    smallFixWeight += 3;
    reasons.push(`Structural: small diff (${signals.filesChanged} files, ~${signals.diffLines} lines)`);
  } else if (signals.filesChanged >= 8 || signals.diffLines >= 400) {
    verificationWeight += 3;
    reasons.push(`Structural: large diff (${signals.filesChanged} files, ~${signals.diffLines} lines)`);
  }

  if (signals.testFileRatio >= 0.5) {
    verificationWeight += 2;
    reasons.push(`Structural: test-heavy change (${Math.round(signals.testFileRatio * 100)}% test paths)`);
  }

  if (signals.familiarityRatio >= 0.6 && signals.filesChanged <= 5) {
    smallFixWeight += 1;
    reasons.push('Structural: recently touched files (familiar scope)');
  } else if (signals.familiarityRatio < 0.2 && signals.filesChanged >= 4) {
    researchWeight += 1;
    reasons.push('Structural: unfamiliar multi-file scope');
  }

  const docOnly =
    signals.extensions.length > 0 &&
    signals.extensions.every((e) => ['md', 'txt', 'rst', 'adoc'].includes(e));
  if (docOnly) {
    smallFixWeight += 2;
    reasons.push('Structural: documentation-only extensions');
  }

  return { verificationWeight, smallFixWeight, researchWeight, reasons };
}
