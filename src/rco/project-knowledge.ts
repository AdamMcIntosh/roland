/**
 * ProjectKnowledge — automatic discovery and injection of project-level
 * technical documentation files into the Lead PM's planning prompt.
 *
 * Scans the project root (cwd) for well-known knowledge files in priority
 * order, loads them, allocates a character budget proportionally by weight,
 * and returns a ready-to-inject prompt block.
 *
 * Files discovered (in priority order):
 *   ROLAND.md         — project-specific instructions, constraints, preferences
 *   ARCHITECTURE.md   — high-level design, patterns, decisions
 *   TECH-STACK.md     — frameworks, libraries, versions, conventions, gotchas
 *   REQUIREMENTS.md   — business rules, user stories, acceptance criteria
 *   SPECS.md          — alternative requirements / spec file
 *   DECISIONS.md      — architecture decision records (ADRs)
 *
 * After synthesis, the PM's Knowledge Update block is parsed and new
 * decisions are appended to DECISIONS.md (created if absent).
 */

import fs   from 'fs';
import path from 'path';

/** Maximum total characters injected into any PM prompt. */
export const MAX_KNOWLEDGE_CHARS = 12_000;

/** Minimum characters allocated to any single file (avoids 2-line stubs). */
const MIN_FILE_CHARS = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeFile {
  /** Filename without path, e.g. "ROLAND.md" */
  filename: string;
  /** Human-readable label for the prompt section header. */
  label: string;
  /** Absolute path on disk. */
  filepath: string;
  /** Full raw content (may be longer than budget). */
  content: string;
  /** Character budget allocated to this file in the injection block. */
  budget: number;
}

export interface ProjectKnowledge {
  /** Discovered files in priority order. */
  files: KnowledgeFile[];
  /** Ready-to-inject string. Empty string when no files found. */
  injectionBlock: string;
  /** Actual characters in the injection block. */
  totalChars: number;
  /** True if any file was truncated to fit the budget. */
  truncated: boolean;
  /** One-line summary for stderr logging. */
  summary: string;
}

// ── File definitions ──────────────────────────────────────────────────────────

/**
 * Knowledge file definitions in priority order.
 * `weight` drives the proportional character budget allocation.
 * Higher weight = more of the budget if all files are present.
 */
const KNOWLEDGE_FILE_DEFS = [
  { filename: 'ROLAND.md',       label: 'ROLAND.md — Project Instructions & Constraints',  weight: 30 },
  { filename: 'ARCHITECTURE.md', label: 'ARCHITECTURE.md — System Architecture & Patterns', weight: 25 },
  { filename: 'TECH-STACK.md',   label: 'TECH-STACK.md — Technology Stack & Conventions',   weight: 25 },
  { filename: 'REQUIREMENTS.md', label: 'REQUIREMENTS.md — Requirements & Business Rules',  weight: 15 },
  { filename: 'SPECS.md',        label: 'SPECS.md — Specifications',                         weight: 15 },
  { filename: 'DECISIONS.md',    label: 'DECISIONS.md — Architecture Decision Records',     weight: 10 },
] as const;

type KnowledgeFileDef = typeof KNOWLEDGE_FILE_DEFS[number];

// ── Discovery & loading ───────────────────────────────────────────────────────

/**
 * Discover and load project knowledge files.
 *
 * Algorithm:
 *   1. Scan for each known filename in `projectRoot`.
 *   2. Skip missing files or files with < MIN_FILE_CHARS content.
 *   3. Allocate total budget (MAX_KNOWLEDGE_CHARS) proportionally by weight
 *      across the files that were actually found.
 *   4. Render each file's snippet, truncating at its budget if needed.
 *   5. Return a single injection block ready for the PM prompt.
 *
 * @param projectRoot  Directory to scan (defaults to process.cwd())
 */
export function loadProjectKnowledge(projectRoot = process.cwd()): ProjectKnowledge {
  // Step 1–2: discover present files
  const found: Array<{ def: KnowledgeFileDef; content: string; filepath: string }> = [];

  for (const def of KNOWLEDGE_FILE_DEFS) {
    const filepath = path.join(projectRoot, def.filename);
    try {
      const content = fs.readFileSync(filepath, 'utf-8').trim();
      if (content.length >= MIN_FILE_CHARS) {
        found.push({ def, content, filepath });
      }
    } catch {
      // File absent — silently skip
    }
  }

  if (found.length === 0) {
    return {
      files: [], injectionBlock: '', totalChars: 0,
      truncated: false, summary: 'no knowledge files found',
    };
  }

  // Step 3: proportional budget allocation
  const totalWeight = found.reduce((s, f) => s + f.def.weight, 0);
  const files: KnowledgeFile[] = found.map(({ def, content, filepath }) => {
    const budget = Math.max(
      MIN_FILE_CHARS,
      Math.floor((def.weight / totalWeight) * MAX_KNOWLEDGE_CHARS),
    );
    return { filename: def.filename, label: def.label, filepath, content, budget };
  });

  // Step 4: render sections with per-file truncation
  const sections: string[] = [];
  let totalChars = 0;
  let truncated  = false;
  let remaining  = MAX_KNOWLEDGE_CHARS;

  for (const f of files) {
    if (remaining < MIN_FILE_CHARS) break;

    const allocated = Math.min(f.budget, remaining);
    let   snippet   = f.content;

    if (snippet.length > allocated) {
      truncated = true;
      snippet   = snippet.slice(0, allocated);
      // Back up to a clean line break rather than mid-sentence
      const lastNl = snippet.lastIndexOf('\n');
      if (lastNl > allocated * 0.75) snippet = snippet.slice(0, lastNl);
      snippet += `\n\n> _(content truncated — full file at \`${f.filename}\`)_`;
    }

    sections.push(`### ${f.label}\n\n${snippet}`);
    totalChars += snippet.length;
    remaining  -= snippet.length;
  }

  // Step 5: assemble injection block
  const truncatedNote = truncated
    ? '\n\n> **Context budget note:** Some files were trimmed. ' +
      `Full versions are in the project root: ` +
      files
        .filter((f) => f.content.length > f.budget)
        .map((f) => `\`${f.filename}\``)
        .join(', ') + '.'
    : '';

  const injectionBlock =
    `## Project Knowledge\n\n` +
    `The following project documentation files were found and loaded. ` +
    `They define the **constraints, architecture, and conventions** that govern all work on this project. ` +
    `Read each section carefully — your task descriptions must align with these files.\n\n` +
    sections.join('\n\n---\n\n') +
    truncatedNote;

  const summary =
    `${files.length} file(s) loaded: ${files.map((f) => f.filename).join(', ')}` +
    (truncated ? ' (some truncated)' : '');

  return { files, injectionBlock, totalChars, truncated, summary };
}

// ── DECISIONS.md updater ──────────────────────────────────────────────────────

const DECISIONS_FILENAME = 'DECISIONS.md';

/**
 * Parse the `## Knowledge Update` block from the PM's synthesis output.
 *
 * Expected format in synthesis:
 * ```
 * ## Knowledge Update
 * **DECISIONS.md:**
 * - Decision 1
 * - Decision 2
 * ```
 *
 * Also accepts a bare bullet list with no sub-header (fallback).
 * Returns an array of decision bullet strings (without leading `- `).
 */
export function parseKnowledgeUpdate(synthesis: string): string[] {
  const blockMatch = synthesis.match(/##\s+Knowledge Update\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i);
  if (!blockMatch) return [];

  const block = blockMatch[1];

  // Preferred: **DECISIONS.md:** sub-section
  const decisionsMatch = block.match(
    /\*\*DECISIONS\.md:\*\*\s*\n([\s\S]*?)(?=\*\*[A-Z]|\s*$)/i,
  );
  const rawLines = decisionsMatch ? decisionsMatch[1] : block;

  return rawLines
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-') || l.startsWith('*'))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l.length > 10);
}

/**
 * Append new decision bullets extracted from the PM's synthesis to DECISIONS.md.
 * Creates the file with a standard header if it doesn't exist.
 * Deduplicates against existing content (first 60 chars).
 *
 * @param synthesis    Full PM synthesis text
 * @param goal         Run goal (used in the section header)
 * @param runId        Short run ID
 * @param projectRoot  Directory to write DECISIONS.md into (defaults to cwd)
 * @returns            Number of new bullets appended (0 = nothing written)
 */
export function appendDecisions(
  synthesis: string,
  goal: string,
  runId: string,
  projectRoot = process.cwd(),
): number {
  const bullets = parseKnowledgeUpdate(synthesis);
  if (bullets.length === 0) return 0;

  const filepath = path.join(projectRoot, DECISIONS_FILENAME);
  let existing = '';
  try {
    existing = fs.readFileSync(filepath, 'utf-8');
  } catch {
    // File will be created fresh below
  }

  // Deduplicate: skip any bullet whose first 60 chars already appear in the file
  const newBullets = bullets.filter((b) => {
    const key = b.toLowerCase().slice(0, 60);
    return !existing.toLowerCase().includes(key);
  });
  if (newBullets.length === 0) return 0;

  const date     = new Date().toISOString().slice(0, 10);
  const goalSnip = goal.slice(0, 80);
  const section  = [
    '',
    `## ${date} — ${goalSnip}${runId ? ` _(run ${runId})_` : ''}`,
    '',
    ...newBullets.map((b) => `- ${b}`),
    '',
  ].join('\n');

  if (!existing.trim()) {
    const header =
      `# Architecture Decision Records\n\n` +
      `_Auto-updated by Roland after each run. Edit manually at any time._\n` +
      `_Each section corresponds to one Roland run that produced new decisions._\n`;
    fs.writeFileSync(filepath, header + section, 'utf-8');
  } else {
    fs.appendFileSync(filepath, section, 'utf-8');
  }

  return newBullets.length;
}
