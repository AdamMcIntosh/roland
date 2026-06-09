/**
 * ## Assumptions
 * - Spec/checklist files use GitHub-flavored markdown task lists (`- [ ]` / `- [x]`).
 * - Paths in loop templates are relative to the loop cwd (project root by default).
 * - `specFile` and `checklistPath` are aliases — first non-empty wins.
 * - Progress is derived by re-reading the file from disk at gate/plan boundaries.
 */

import fs from 'fs';
import path from 'path';
import type { LoopTemplate } from './loop-phases.js';
import type { CustomCriterion } from './evaluation-gate.js';

/** A single markdown checkbox item from a spec/checklist file. */
export interface SpecTaskItem {
  line: number;
  text: string;
  complete: boolean;
}

/** Aggregated progress for a spec/checklist markdown file. */
export interface SpecProgress {
  specPath: string;
  total: number;
  completed: number;
  percentComplete: number;
  items: SpecTaskItem[];
  allComplete: boolean;
  updatedAt: number;
}

const TASK_LINE_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;

/**
 * Parse markdown task list items from file content.
 * Ignores non-checkbox list items and nested content.
 */
export function parseMarkdownTaskList(content: string): SpecTaskItem[] {
  const items: SpecTaskItem[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_LINE_RE);
    if (!match) continue;
    items.push({
      line: i + 1,
      text: match[3].trim(),
      complete: match[2].toLowerCase() === 'x',
    });
  }
  return items;
}

/** Resolve spec path from template — `specFile` takes precedence over `checklistPath`. */
export function resolveSpecPath(template: LoopTemplate, cwd: string): string | null {
  const raw = template.specFile ?? template.checklistPath;
  if (!raw?.trim()) return null;
  return path.isAbsolute(raw) ? raw : path.join(cwd, raw);
}

/** Read and compute spec progress from disk. Returns null when file missing or has no tasks. */
export function computeSpecProgress(specPath: string): SpecProgress | null {
  let content: string;
  try {
    content = fs.readFileSync(specPath, 'utf-8');
  } catch {
    return null;
  }

  const items = parseMarkdownTaskList(content);
  if (items.length === 0) {
    return {
      specPath,
      total: 0,
      completed: 0,
      percentComplete: 0,
      items: [],
      allComplete: false,
      updatedAt: Date.now(),
    };
  }

  const completed = items.filter((i) => i.complete).length;
  const total = items.length;
  const percentComplete = Math.round((completed / total) * 1000) / 10;

  return {
    specPath,
    total,
    completed,
    percentComplete,
    items,
    allComplete: completed === total,
    updatedAt: Date.now(),
  };
}

/** Load spec file content for planner context. Returns empty string on failure. */
export function readSpecContent(specPath: string): string {
  try {
    return fs.readFileSync(specPath, 'utf-8');
  } catch {
    return '';
  }
}

/** Format spec progress as a concise summary for logs and blackboard posts. */
export function formatSpecProgressSummary(progress: SpecProgress): string {
  if (progress.total === 0) {
    return `Spec ${progress.specPath}: no task-list items found`;
  }
  const pending = progress.items
    .filter((i) => !i.complete)
    .slice(0, 5)
    .map((i) => i.text);
  const pendingNote =
    pending.length > 0 ? ` — pending: ${pending.join('; ')}` : '';
  return (
    `Spec ${progress.percentComplete}% (${progress.completed}/${progress.total})` +
    pendingNote
  );
}

/**
 * Custom EvaluationGate criterion — passes when all checklist items are marked complete.
 * When the spec file has no task items, the gate is skipped (passes with note).
 */
export function createSpecCompletionCriterion(specPath: string): CustomCriterion {
  return {
    name: 'spec_complete',
    weight: 2,
    evaluate: () => {
      const progress = computeSpecProgress(specPath);
      if (!progress) {
        return { pass: false, message: `Spec file not found or unreadable: ${specPath}` };
      }
      if (progress.total === 0) {
        return {
          pass: true,
          message: `Spec file has no task-list items — gate skipped (${specPath})`,
        };
      }
      if (progress.allComplete) {
        return {
          pass: true,
          message: `All ${progress.total} spec/checklist items complete`,
        };
      }
      const incomplete = progress.items.filter((i) => !i.complete).slice(0, 8);
      return {
        pass: false,
        message:
          `${progress.completed}/${progress.total} spec items complete — ` +
          `incomplete: ${incomplete.map((i) => i.text).join('; ')}`,
      };
    },
  };
}

/**
 * ## Reflection + Spec-First Integration Complete
 *
 * Usage:
 * ```typescript
 * import { computeSpecProgress, createSpecCompletionCriterion, resolveSpecPath } from './spec-progress.js';
 *
 * const specPath = resolveSpecPath(template, process.cwd());
 * if (specPath) {
 *   const progress = computeSpecProgress(specPath);
 *   const criterion = createSpecCompletionCriterion(specPath);
 * }
 * ```
 */
