/**
 * ProjectMemory — persistent cross-run knowledge for the Roland PM team.
 *
 * Written to .roland/memory.md after each run's synthesis phase.
 * Read at the start of each run and injected into the Lead PM planning prompt
 * so the team knows the project's established patterns, tech stack, and decisions.
 *
 * Format: append-only Markdown with timestamped entries. Humans can edit it too.
 *
 * Lifecycle:
 *   1. runTeam reads the snapshot (capped) → injected into planning prompt
 *   2. Synthesis prompt instructs the PM to write a "## Memory Extract" section
 *   3. After synthesis, orchestrator calls memory.extractAndAppend(synthesis, goal, runId)
 */

import fs from 'fs';
import path from 'path';

export const MEMORY_FILE = 'memory.md';

/** Max chars of memory injected into the planning prompt. */
export const MEMORY_PROMPT_MAX_CHARS = 2_000;

/** Max entries kept in the memory file before oldest are pruned. */
const MAX_ENTRIES = 20;

// ── Entry parsing ─────────────────────────────────────────────────────────────

export interface MemoryEntry {
  date: string;    // ISO date string
  goal: string;
  runId: string;
  content: string; // raw markdown block (decisions / patterns / avoid)
}

// ── ProjectMemory class ───────────────────────────────────────────────────────

export class ProjectMemory {
  private readonly filePath: string;

  constructor(stateDir: string) {
    this.filePath = path.join(stateDir, MEMORY_FILE);
  }

  /**
   * Returns the current memory file content, capped to MEMORY_PROMPT_MAX_CHARS.
   * Returns empty string if no memory file exists yet.
   */
  snapshot(): string {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
      if (!raw) return '';
      return raw.length > MEMORY_PROMPT_MAX_CHARS
        ? raw.slice(0, MEMORY_PROMPT_MAX_CHARS) + '\n…(older entries omitted)'
        : raw;
    } catch {
      return '';
    }
  }

  /** True if the memory file exists and has at least one entry. */
  hasMemory(): boolean {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
      return raw.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Parse the "## Memory Extract" section from a synthesis string and append
   * it to the memory file. Gracefully handles synthesis with no extract section.
   *
   * Returns true if an entry was appended.
   */
  extractAndAppend(synthesis: string, goal: string, runId: string): boolean {
    const extract = parseMemoryExtract(synthesis);
    if (!extract) return false;

    const date = new Date().toISOString().slice(0, 10);
    const header = `## ${date} — ${runId}\n\n**Goal:** ${goal.slice(0, 120)}`;
    const entry = `${header}\n\n${extract.trim()}`;

    this.append(entry);
    return true;
  }

  /**
   * Manually append a pre-formatted Markdown block.
   * Prunes oldest entries if MAX_ENTRIES is exceeded.
   */
  append(block: string): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

      let existing = '';
      try {
        existing = fs.readFileSync(this.filePath, 'utf-8');
      } catch {
        // New file — add header.
        existing = '# Roland Project Memory\n\n_Updated automatically after each run. You can also edit this file manually._\n\n---\n';
      }

      // Prune: keep only the last MAX_ENTRIES-1 entries to make room for the new one.
      const pruned = pruneEntries(existing, MAX_ENTRIES - 1);

      const newContent = pruned.trimEnd() + '\n\n---\n\n' + block + '\n';
      fs.writeFileSync(this.filePath, newContent, 'utf-8');
    } catch (err) {
      console.error('[Memory] Failed to append entry:', (err as Error).message);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the content of the "## Memory Extract" section from the synthesis output.
 * Returns null if the section is absent or empty.
 */
export function parseMemoryExtract(synthesis: string): string | null {
  // Match ## Memory Extract ... up to the next ## heading or end of string
  const match = synthesis.match(/##\s+Memory Extract\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i);
  if (!match) return null;
  const content = match[1].trim();
  return content.length >= 20 ? content : null; // ignore trivially short extracts
}

/**
 * Keep only the most recent `limit` dated entries (separated by --- dividers).
 * Always preserves the file header (content before the first ---).
 */
function pruneEntries(content: string, limit: number): string {
  const divider = '\n\n---\n\n';
  const parts = content.split('---');
  if (parts.length <= 2) return content; // header + 0 or 1 entries — nothing to prune

  const header = parts[0];
  const entries = parts.slice(1).map((p) => p.trim()).filter((p) => p.startsWith('##'));

  if (entries.length <= limit) return content;

  const kept = entries.slice(entries.length - limit);
  return header + divider + kept.join(divider) + '\n';
}
