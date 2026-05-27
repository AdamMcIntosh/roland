/**
 * Self-Improvement Loop — structured retrospective and smart memory updates.
 *
 * After every team run, the Lead PM performs a dedicated retrospective to
 * extract lessons learned and propose categorised memory updates. The human
 * is given a brief interactive window to accept or skip each batch.
 *
 * Exports:
 *   buildRetrospectivePrompt   — PM prompt for post-run structured review
 *   parseRetrospectiveOutput   — parse "## Retrospective Memory Update" block
 *   showMemoryProposal         — interactive TTY diff UI with auto-accept
 *   applyRetroUpdate           — write approved updates to .roland/memory.md
 *
 * The LLM call itself happens in team-orchestrator.ts so that callCursorAgent
 * and usage tracking stay in one place.
 */

import readline from 'readline';
import { ProjectMemory, MEMORY_SECTIONS } from './project-memory.js';
import type { MemorySection } from './project-memory.js';

// Re-export SectionMap type alias for callers
export type SectionMap = Record<MemorySection, string[]>;

// ── Retrospective prompt ───────────────────────────────────────────────────────

/**
 * Build the Lead PM retrospective prompt.
 *
 * @param goal           The run goal
 * @param synthesis      Full PM synthesis (first 2000 chars injected for context)
 * @param taskSummary    One line per task: id [agent]: "title" ✓ or ⚠️ blocker
 * @param currentMemory  Current .roland/memory.md (injected so PM avoids duplication)
 */
export function buildRetrospectivePrompt(
  goal: string,
  synthesis: string,
  taskSummary: string,
  currentMemory: string,
): string {
  const synthExcerpt = synthesis.length > 2_000
    ? synthesis.slice(0, 2_000) + '\n…(truncated)'
    : synthesis;

  const memSection = currentMemory.trim()
    ? `## Current Memory (do NOT duplicate these — only write NEW insights)\n\n${currentMemory}\n\n---\n\n`
    : '';

  return `# Lead PM — Retrospective Phase

You just completed a team run. Your job now is to perform a structured retrospective
and extract **new, specific, actionable** lessons that will make future runs smarter.

This is NOT a repeat of the synthesis — it is a deeper look at what happened and why.

---

## Run Summary

**Goal:** ${goal}

**Tasks:**
${taskSummary}

---

## Synthesis Excerpt (context only)

${synthExcerpt}

---

${memSection}## Retrospective Questions

Think through each question and then produce your output:

1. **What went well?** — patterns, approaches, or tools that worked and should be reinforced
2. **What caused blockers or delays?** — root causes, not just symptoms. Be specific.
3. **What assumptions were wrong?** — things that surprised the team or required re-planning
4. **What environment/tooling/API quirks appeared?** — edge cases that will bite future engineers
5. **What new coding standards or process improvements should be documented?**

---

## Required Output

Write a \`## Retrospective Memory Update\` block containing ONLY insights that are:
- **New** (not already in Current Memory above)
- **Specific** (concrete, actionable, not vague)
- **Durable** (relevant beyond this run)

If you have nothing new for a section, **omit it entirely** — do not write empty sections.
Maximum 4 bullets per section. Keep each bullet under 120 characters.

Use this exact format:

\`\`\`
## Retrospective Memory Update

**Architecture Decisions:**
- [Significant tech/design choice made this run — what was chosen and why in one sentence]

**Coding Standards:**
- [File layout, naming, pattern, or testing convention established this run]

**Past Mistakes:**
- [What went wrong or was nearly wrong] (root cause: [why it happened])

**Preferences:**
- [User/team preference surfaced this run that differs from obvious defaults]

**Project Gotchas:**
- [Environment quirk, API edge case, or tooling surprise that will catch future engineers off guard]
\`\`\`

Be direct. Each bullet should be usable standalone — someone reading it cold should understand
the lesson without extra context. If the run was smooth with nothing genuinely new to document,
write: \`## Retrospective Memory Update\n_(nothing new to document this run)_\`
`;
}

// ── Output parser ─────────────────────────────────────────────────────────────

/**
 * Parse the "## Retrospective Memory Update" block from the PM's output.
 *
 * Returns a SectionMap with bullets grouped by section, or null if
 * the block is absent or contains no actionable bullets.
 */
export function parseRetrospectiveOutput(text: string): SectionMap | null {
  const blockMatch = text.match(
    /##\s+Retrospective Memory Update\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i,
  );
  if (!blockMatch) return null;

  const block = blockMatch[1];

  // Detect the "nothing new" shorthand
  if (/nothing new to document/i.test(block)) return null;

  // Reuse the same section aliases from project-memory by re-implementing here
  // (avoid importing private helpers; canonical mapping is sufficient)
  const SECTION_MAP: Record<string, MemorySection> = {
    'architecture decisions': 'Architecture Decisions',
    'architecture':           'Architecture Decisions',
    'decisions':              'Architecture Decisions',
    'coding standards':       'Coding Standards',
    'standards':              'Coding Standards',
    'patterns':               'Coding Standards',
    'past mistakes':          'Past Mistakes',
    'mistakes':               'Past Mistakes',
    'avoid':                  'Past Mistakes',
    'pitfalls':               'Past Mistakes',
    'preferences':            'Preferences',
    'preference':             'Preferences',
    'project gotchas':        'Project Gotchas',
    'gotchas':                'Project Gotchas',
    'gotcha':                 'Project Gotchas',
    'quirks':                 'Project Gotchas',
    'environment':            'Project Gotchas',
  };

  // Build an empty result
  const result: SectionMap = Object.fromEntries(
    MEMORY_SECTIONS.map((s) => [s, [] as string[]]),
  ) as unknown as SectionMap;

  // Match **Section Name:** bullet blocks
  const blockRe = /\*\*([^:*\n]+):\*\*\s*\n([\s\S]*?)(?=\*\*[^:*\n]+:\*\*|$)/g;
  let m: RegExpExecArray | null;
  let totalBullets = 0;

  while ((m = blockRe.exec(block)) !== null) {
    const rawSection = m[1].trim().toLowerCase();
    const canonical  = SECTION_MAP[rawSection]
      ?? Object.entries(SECTION_MAP).find(([k]) => rawSection.includes(k))?.[1];
    if (!canonical) continue;

    const bullets = m[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-') || l.startsWith('*'))
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter((l) => l.length > 10);

    result[canonical].push(...bullets);
    totalBullets += bullets.length;
  }

  return totalBullets > 0 ? result : null;
}

// ── Human oversight UI ────────────────────────────────────────────────────────

export interface MemoryProposalOptions {
  /** Auto-accept without showing UI when true. */
  quiet: boolean;
  /** Auto-accept without showing UI when false (non-interactive terminal). */
  isTTY: boolean;
  /** Seconds before auto-accept fires. Default 15. */
  timeoutSeconds: number;
}

/**
 * Show the user a diff of proposed new memory bullets and ask whether to
 * accept them. Auto-accepts after `timeoutSeconds` if no input.
 *
 * Returns 'accepted' immediately when `quiet` or `!isTTY` (no interaction).
 * Returns 'accepted' when there are 0 genuinely new bullets (nothing to review).
 */
export async function showMemoryProposal(
  proposed: SectionMap,
  existing: SectionMap,
  opts: MemoryProposalOptions,
): Promise<'accepted' | 'skipped'> {
  // Compute diff — only bullets not already in memory
  const diff: Partial<Record<MemorySection, string[]>> = {};
  let totalNew = 0;

  for (const section of MEMORY_SECTIONS) {
    const existingKeys = new Set(
      (existing[section] ?? []).map((b) => b.toLowerCase().slice(0, 60)),
    );
    const fresh = (proposed[section] ?? []).filter(
      (b) => !existingKeys.has(b.toLowerCase().slice(0, 60)),
    );
    if (fresh.length > 0) {
      diff[section] = fresh;
      totalNew += fresh.length;
    }
  }

  if (totalNew === 0) return 'accepted'; // nothing genuinely new
  if (!opts.isTTY || opts.quiet) return 'accepted'; // non-interactive — auto-accept silently

  // ── Render the proposal ──────────────────────────────────────────────────
  const cols  = Math.min(
    ((process.stderr as NodeJS.WriteStream & { columns?: number }).columns ?? 80),
    90,
  );
  const hr    = '─'.repeat(cols - 4);
  const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;

  const w = process.stderr.write.bind(process.stderr);

  w('\n');
  w(`  ${bold('Roland — Proposed Memory Updates')}  ${dim(`(${totalNew} new ${totalNew === 1 ? 'entry' : 'entries'})`)}\n`);
  w(`  ${hr}\n\n`);

  for (const section of MEMORY_SECTIONS) {
    const bullets = diff[section];
    if (!bullets?.length) continue;
    w(`  ${cyan(section)}\n`);
    for (const b of bullets) {
      w(`    ${green('+')} ${b}\n`);
    }
    w('\n');
  }

  w(`  ${hr}\n`);

  // ── Wait for input with timeout ──────────────────────────────────────────
  return new Promise<'accepted' | 'skipped'>((resolve) => {
    let settled = false;

    const settle = (result: 'accepted' | 'skipped', label: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { rl.close(); } catch { /* already closed */ }
      w(`  ${dim(label)}\n\n`);
      resolve(result);
    };

    // Timeout — auto-accept
    const timer = setTimeout(() => {
      w(`\n`);
      settle('accepted', 'Auto-accepted.');
    }, opts.timeoutSeconds * 1_000);

    const rl = readline.createInterface({
      input:    process.stdin,
      terminal: false,
    });

    w(`  ${dim(`[Enter] Accept all   [s] Skip   (auto-accept in ${opts.timeoutSeconds}s)`)}  `);

    rl.once('line', (input) => {
      const s = input.trim().toLowerCase();
      if (s === 's' || s === 'skip') {
        settle('skipped', 'Skipped — memory unchanged.');
      } else {
        settle('accepted', 'Accepted.');
      }
    });

    rl.once('close', () => settle('accepted', 'Auto-accepted (stdin closed).'));
  });
}

// ── Apply updates ─────────────────────────────────────────────────────────────

/**
 * Merge an approved SectionMap into .roland/memory.md and return the count
 * of new bullets actually written.
 *
 * Creates a new ProjectMemory instance internally so callers don't need to
 * manage it.
 */
export function applyRetroUpdate(
  incoming: SectionMap,
  stateDir: string,
  goal: string,
  runId: string,
): number {
  const memory = new ProjectMemory(stateDir);
  return memory.mergeAndWrite(incoming, goal, runId);
}
