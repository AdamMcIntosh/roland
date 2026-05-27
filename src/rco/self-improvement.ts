/**
 * Self-Improvement Loop v2 — structured retrospective, active pattern recognition,
 * self-critique, human feedback integration, and smart memory updates.
 *
 * What's new in v2 vs v1:
 *   - Pattern recognition: PM identifies Proven Patterns + Anti-Patterns separately
 *   - Self-critique: PM critiques its own planning + delegation decisions each run
 *   - Human feedback: post-synthesis 1–10 rating collected from the terminal
 *   - Plan citations: parsePlanCitations() extracts which memory entries shaped the plan
 *   - Frequency tracking: recurring patterns get [×N] prefix bumped in project-memory.ts
 *
 * Exports:
 *   buildRetrospectivePrompt   — enhanced v2 PM prompt (pattern recognition + self-critique)
 *   parseRetrospectiveOutput   — parse "## Retrospective Memory Update" block
 *   parseSelfCritique          — extract "## Planning Self-Critique" section
 *   parsePlanCitations         — extract "## Memory Citations" from plan text
 *   collectHumanFeedback       — interactive TTY rating prompt
 *   showMemoryProposal         — interactive TTY diff UI with auto-accept
 *   applyRetroUpdate           — write approved updates to .roland/memory.md
 */

import readline from 'readline';
import { ProjectMemory, MEMORY_SECTIONS } from './project-memory.js';
import type { MemorySection } from './project-memory.js';

// Re-export SectionMap type alias for callers
export type SectionMap = Record<MemorySection, string[]>;

// ── Human Feedback ────────────────────────────────────────────────────────────

export interface HumanFeedback {
  rating: number;   // 1–10
  notes?: string;
}

/**
 * Prompt the user for a quick 1–10 run rating + optional notes.
 * Auto-skips after timeoutSeconds. Returns null when not TTY or user skips.
 *
 * Input format: "7" or "8 parallel waves worked great here"
 */
export async function collectHumanFeedback(
  goal: string,
  opts: { isTTY: boolean; timeoutSeconds: number },
): Promise<HumanFeedback | null> {
  if (!opts.isTTY) return null;

  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const w    = process.stderr.write.bind(process.stderr);

  w('\n');
  w(`  ${bold('💬 Rate this run')}  ${dim(`(auto-skip in ${opts.timeoutSeconds}s)`)}\n`);
  w(`  ${dim('Goal:')} ${goal.slice(0, 72)}${goal.length > 72 ? '…' : ''}\n\n`);
  w(`  ${cyan('1–10')} ${dim('+ optional notes  [Enter to skip]:')}  `);

  return new Promise<HumanFeedback | null>((resolve) => {
    let settled = false;

    const settle = (result: HumanFeedback | null, label?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { rl.close(); } catch { /* already closed */ }
      if (label) w(`${dim(label)}\n`);
      w('\n');
      resolve(result);
    };

    const timer = setTimeout(
      () => settle(null, '(auto-skipped)'),
      opts.timeoutSeconds * 1_000,
    );

    const rl = readline.createInterface({ input: process.stdin, terminal: false });

    rl.once('line', (input) => {
      const trimmed = input.trim();
      if (!trimmed) { settle(null, '(skipped)'); return; }

      // Accept "7" or "8 great run, parallel worked well"
      const m = trimmed.match(/^(\d+)\s*(.*)?$/);
      if (!m) { settle(null, '(skipped — expected a number 1–10)'); return; }

      const rating = parseInt(m[1], 10);
      if (rating < 1 || rating > 10) { settle(null, '(skipped — rating must be 1–10)'); return; }

      const notes = m[2]?.trim() || undefined;
      settle(
        { rating, notes },
        `Recorded ${rating}/10${notes ? ` — "${notes.slice(0, 60)}"` : ''}`,
      );
    });

    rl.once('close', () => settle(null));
  });
}

// ── Plan citation parsing ──────────────────────────────────────────────────────

/**
 * Parse the "## Memory Citations" block from the Lead PM's plan output.
 * The planning prompt asks the PM to write this block when prior memory
 * influenced the task design, so users can see learning-in-action.
 *
 * Returns array of citation strings, e.g.:
 *   '"Never call req.destroy() before HTTP response" → injected constraint into executor task-1'
 */
export function parsePlanCitations(planText: string): string[] {
  const m = planText.match(
    /##\s+Memory Citations?\s*\n([\s\S]*?)(?=\n##\s|\s*```|\s*$)/i,
  );
  if (!m) return [];
  const block = m[1];
  if (/no prior memory/i.test(block)) return [];

  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter((l) => l.length > 5)
    .slice(0, 8);
}

// ── Self-critique parsing ─────────────────────────────────────────────────────

/**
 * Extract the "## Planning Self-Critique" section from the retrospective output.
 * Returns the critique text or null if absent/empty.
 */
export function parseSelfCritique(retroText: string): string | null {
  const m = retroText.match(
    /##\s+Planning Self-Critique\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i,
  );
  if (!m) return null;
  const text = m[1].trim();
  return text.length > 10 ? text : null;
}

// ── Retrospective prompt v2 ───────────────────────────────────────────────────

/**
 * Build the Lead PM retrospective prompt (v2).
 *
 * New vs v1:
 *   - Asks PM to identify recurring Proven Patterns and Anti-Patterns separately
 *   - Asks PM to self-critique its own planning and delegation decisions
 *   - Incorporates optional human feedback (rating + notes) into the analysis context
 *   - Output format includes two new sections + a Planning Self-Critique block
 *
 * @param goal           The run goal
 * @param synthesis      Full PM synthesis (first 2000 chars injected for context)
 * @param taskSummary    One line per task: id [agent]: "title" ✓ or ⚠️ blocker
 * @param currentMemory  Current .roland/memory.md (injected to avoid duplication)
 * @param feedback       Optional human 1–10 rating + notes for this run
 */
export function buildRetrospectivePrompt(
  goal: string,
  synthesis: string,
  taskSummary: string,
  currentMemory: string,
  feedback?: HumanFeedback,
): string {
  const synthExcerpt = synthesis.length > 2_000
    ? synthesis.slice(0, 2_000) + '\n…(truncated)'
    : synthesis;

  const memSection = currentMemory.trim()
    ? `## Current Memory\n\n_Do NOT duplicate these — only write NEW or UPDATED insights:_\n\n${currentMemory}\n\n---\n\n`
    : '';

  const feedbackSection = feedback
    ? `## Human Feedback\n\nThe human rated this run **${feedback.rating}/10**.\n${
        feedback.notes ? `Notes: "${feedback.notes}"` : '_(no additional notes)_'
      }\n\n` +
      `Use this rating to calibrate confidence:\n` +
      `- Rating ≥ 8 → approaches this run are strong Proven Pattern candidates\n` +
      `- Rating ≤ 4 → investigate what fell short; flag as Anti-Patterns or Past Mistakes\n` +
      `- Rating 5–7 → mixed; document specific wins and misses separately\n\n---\n\n`
    : '';

  return `# Lead PM — Retrospective Phase (v2)

You just completed a team run. Perform a **structured retrospective** to actively improve future runs.

This is NOT a repeat of the synthesis — it is a deeper analysis: what patterns emerged, what to do differently, and what lasting lessons should be written to memory.

---

## Run Summary

**Goal:** ${goal}

**Tasks completed:**
${taskSummary}

---

## Synthesis Excerpt

${synthExcerpt}

---

${feedbackSection}${memSection}## Retrospective Questions

Think through each question before writing your output.

### 1. What went well? → Proven Patterns
Which specific approaches, techniques, or task structures produced notably good outcomes?
A Proven Pattern is concrete enough to apply directly next time — not "communication was good"
but "splitting test-author by layer (unit / integration / E2E) let three agents run in parallel."
Are any of these recurring across multiple runs? High-frequency patterns earn [×N] reinforcement.

### 2. What caused blockers or delays? → Anti-Patterns / Past Mistakes
Root causes, not symptoms. Have you seen this class of problem before?
An Anti-Pattern includes: what to avoid, root cause (why it happens), and a concrete example.
Example: "Calling req.destroy() before sending HTTP response — root cause: error handler written
before response finalisation; example: registration endpoint auth middleware."

### 3. What surprised the team or required re-planning? → Past Mistakes / Project Gotchas
Environment quirks, API edge cases, wrong assumptions that forced a pivot.

### 4. Were there new coding standards or user preferences surfaced?
File layout, naming conventions, tooling choices — anything a new engineer must follow.

### 5. Planning Self-Critique (required)
This is the most important question for making Roland demonstrably smarter.

Honestly assess your own planning decisions:
- Was task decomposition efficient, or were tasks too large / too sequential?
- Was parallelism maximized? Could more tasks have run simultaneously?
- Were task descriptions clear and complete, or did agents have to guess context?
- For runs with blockers: could better task descriptions have prevented them?
- What would you do differently next time for a goal like this?

**Be specific and honest** — vague self-praise ("planning was good") is useless.
This section is shown to the user so they can see Roland learning from its own decisions.

---

## Required Output

### Part 1: Memory Update Block

Write a \`## Retrospective Memory Update\` block.

Include ONLY insights that are:
- **New** (not already in Current Memory above)
- **Specific** (concrete, actionable — not vague)
- **Durable** (will matter on future runs, not just this one)

Omit a section entirely if you have nothing new for it.
Maximum 3–4 bullets per section. Keep each bullet under 130 characters.

\`\`\`
## Retrospective Memory Update

**Architecture Decisions:**
- [tech/design choice made this run — what and why in one sentence]

**Coding Standards:**
- [file layout, naming, pattern, or testing convention established this run]

**Past Mistakes:**
- [what went wrong or was nearly wrong] (root cause: [why it happened])

**Preferences:**
- [user/team preference surfaced this run that differs from obvious defaults]

**Project Gotchas:**
- [environment quirk, API edge case, or tooling surprise]

**Proven Patterns:**
- [specific approach that worked well — why it produces good outcomes and should be reused]

**Anti-Patterns:**
- [what to avoid — root cause: why it happens; example: concrete case from this run]
\`\`\`

### Part 2: Planning Self-Critique

Write a \`## Planning Self-Critique\` section (3–5 sentences):

\`\`\`
## Planning Self-Critique

[Honest, specific assessment of your planning and delegation decisions this run.
Cover: decomposition quality, parallelism maximization, task description clarity,
and what you would change next time for a similar goal.]
\`\`\`

---

If the run was smooth with nothing genuinely new to document, write:
\`## Retrospective Memory Update\n_(nothing new to document this run)_\`
Then still write the Planning Self-Critique.
`;
}

// ── Output parser ─────────────────────────────────────────────────────────────

/**
 * Parse the "## Retrospective Memory Update" block from the PM's output.
 *
 * Returns a SectionMap with bullets grouped by section, or null if
 * the block is absent or contains no actionable bullets.
 *
 * Handles both the original 5-section format (v1) and the new 7-section format (v2).
 */
export function parseRetrospectiveOutput(text: string): SectionMap | null {
  const blockMatch = text.match(
    /##\s+Retrospective Memory Update\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i,
  );
  if (!blockMatch) return null;

  const block = blockMatch[1];
  if (/nothing new to document/i.test(block)) return null;

  const SECTION_MAP: Record<string, MemorySection> = {
    'architecture decisions': 'Architecture Decisions',
    'architecture':           'Architecture Decisions',
    'decisions':              'Architecture Decisions',
    'coding standards':       'Coding Standards',
    'standards':              'Coding Standards',
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
    // v2 sections
    'proven patterns':        'Proven Patterns',
    'proven':                 'Proven Patterns',
    'good patterns':          'Proven Patterns',
    'what worked':            'Proven Patterns',
    'anti-patterns':          'Anti-Patterns',
    'anti patterns':          'Anti-Patterns',
    'antipatterns':           'Anti-Patterns',
    'anti-pattern':           'Anti-Patterns',
    'recurring mistakes':     'Anti-Patterns',
  };

  const result: SectionMap = Object.fromEntries(
    MEMORY_SECTIONS.map((s) => [s, [] as string[]]),
  ) as unknown as SectionMap;

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
  // Compute diff — only bullets not already in memory (strip [×N] before compare)
  const diff: Partial<Record<MemorySection, string[]>> = {};
  let totalNew = 0;

  for (const section of MEMORY_SECTIONS) {
    const existingKeys = new Set(
      (existing[section] ?? []).map((b) => b.toLowerCase().replace(/^\[×\d+\]\s*/, '').slice(0, 60)),
    );
    const fresh = (proposed[section] ?? []).filter(
      (b) => !existingKeys.has(b.toLowerCase().replace(/^\[×\d+\]\s*/, '').slice(0, 60)),
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
  const mg    = (s: string) => `\x1b[35m${s}\x1b[0m`;

  const w = process.stderr.write.bind(process.stderr);

  w('\n');
  w(`  ${bold('Roland — Proposed Memory Updates')}  ${dim(`(${totalNew} new ${totalNew === 1 ? 'entry' : 'entries'})`)}\n`);
  w(`  ${hr}\n\n`);

  for (const section of MEMORY_SECTIONS) {
    const bullets = diff[section];
    if (!bullets?.length) continue;
    // Colour-code: Proven Patterns in cyan, Anti-Patterns in magenta, rest in cyan
    const labelColor = section === 'Anti-Patterns' ? mg : cyan;
    w(`  ${labelColor(section)}\n`);
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
