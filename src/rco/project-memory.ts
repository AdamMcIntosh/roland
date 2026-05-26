/**
 * ProjectMemory — structured persistent cross-run knowledge for the Roland PM team.
 *
 * Written to .roland/memory.md after each run's synthesis phase.
 * Read at the start of each run and injected into the Lead PM planning prompt.
 *
 * Format: four persistent sections (Architecture Decisions, Coding Standards,
 * Past Mistakes, Preferences), each containing bullet points that accumulate
 * across runs. New bullets are merged in; duplicates are silently skipped.
 *
 * Lifecycle:
 *   1. runTeam reads the snapshot → injected into Lead PM planning prompt
 *   2. Synthesis prompt asks PM to write a "## Memory Extract" section
 *   3. Orchestrator calls memory.extractAndAppend(synthesis, goal, runId)
 *   4. extractAndAppend parses the four-section format and merges new bullets
 */

import fs from 'fs';
import path from 'path';

export const MEMORY_FILE = 'memory.md';

/** Max chars injected into any PM prompt. */
export const MEMORY_PROMPT_MAX_CHARS = 3_000;

/** Max bullets kept per section before oldest are pruned. */
const MAX_BULLETS_PER_SECTION = 20;

/** The four structured sections in memory.md. */
export const MEMORY_SECTIONS = [
  'Architecture Decisions',
  'Coding Standards',
  'Past Mistakes',
  'Preferences',
] as const;

export type MemorySection = (typeof MEMORY_SECTIONS)[number];

/** Maps aliases used in Memory Extract blocks → canonical section names. */
const SECTION_ALIASES: Record<string, MemorySection> = {
  'architecture decisions': 'Architecture Decisions',
  'architecture':           'Architecture Decisions',
  'decisions':              'Architecture Decisions',
  'decision':               'Architecture Decisions',
  'coding standards':       'Coding Standards',
  'standards':              'Coding Standards',
  'patterns':               'Coding Standards',
  'pattern':                'Coding Standards',
  'past mistakes':          'Past Mistakes',
  'mistakes':               'Past Mistakes',
  'avoid':                  'Past Mistakes',
  'pitfalls':               'Past Mistakes',
  'preferences':            'Preferences',
  'preference':             'Preferences',
  'user preferences':       'Preferences',
};

type SectionMap = Record<MemorySection, string[]>;

// ── Serialisation ─────────────────────────────────────────────────────────────

const FILE_HEADER = '# Roland Project Memory\n\n_Updated automatically after each run. Edit manually at any time._\n';

function emptySections(): SectionMap {
  return {
    'Architecture Decisions': [],
    'Coding Standards':       [],
    'Past Mistakes':          [],
    'Preferences':            [],
  };
}

function serializeSections(sections: SectionMap, runInfo?: string): string {
  let out = FILE_HEADER + '\n';
  for (const section of MEMORY_SECTIONS) {
    const bullets = sections[section];
    out += `## ${section}\n\n`;
    if (bullets.length > 0) {
      out += bullets.map((b) => `- ${b}`).join('\n') + '\n';
    } else {
      out += '_No entries yet._\n';
    }
    out += '\n';
  }
  if (runInfo) {
    out += `---\n\n_Last updated: ${runInfo}_\n`;
  }
  return out;
}

/** Parse the four sections out of an existing memory.md file. */
function parseSections(raw: string): SectionMap {
  const result = emptySections();
  for (const section of MEMORY_SECTIONS) {
    // Match "## Section Name" … up to next "##" heading or end of file
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const m = raw.match(re);
    if (!m) continue;
    result[section] = m[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-') || l.startsWith('*'))
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter((l) => l.length > 5);
  }
  return result;
}

/** Canonicalise a raw section name from a Memory Extract block. */
function canonicalSection(raw: string): MemorySection | null {
  const key = raw.toLowerCase().trim();
  if (SECTION_ALIASES[key]) return SECTION_ALIASES[key];
  // Partial match fallback
  for (const [alias, canonical] of Object.entries(SECTION_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return canonical;
  }
  return null;
}

/**
 * Parse the "## Memory Extract" block from synthesis output into a SectionMap.
 * Handles both the new four-section format and the legacy Decisions/Patterns/Avoid format.
 */
export function parseMemoryExtract(synthesis: string): SectionMap | null {
  const match = synthesis.match(/##\s+Memory Extract\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i);
  if (!match) return null;

  const extractContent = match[1];
  const result = emptySections();

  // Parse **Section Name:** bullet blocks
  const blockRe = /\*\*([^:*\n]+):\*\*\s*\n([\s\S]*?)(?=\*\*[^:*\n]+:\*\*|$)/g;
  let m: RegExpExecArray | null;
  let totalBullets = 0;

  while ((m = blockRe.exec(extractContent)) !== null) {
    const rawSection = m[1].trim();
    const rawContent = m[2];
    const canonical  = canonicalSection(rawSection);
    if (!canonical) continue;

    const bullets = rawContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-') || l.startsWith('*'))
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter((l) => l.length > 5);

    result[canonical].push(...bullets);
    totalBullets += bullets.length;
  }

  return totalBullets > 0 ? result : null;
}

/** Merge incoming bullets into existing sections, deduplicating by prefix match. */
function mergeSections(existing: SectionMap, incoming: SectionMap): SectionMap {
  const result = emptySections();
  for (const section of MEMORY_SECTIONS) {
    const current  = existing[section] ?? [];
    const newItems = incoming[section] ?? [];

    const merged = [...current];
    for (const bullet of newItems) {
      const key = bullet.toLowerCase().slice(0, 50);
      const isDup = current.some((e) => e.toLowerCase().slice(0, 50) === key);
      if (!isDup && bullet.length > 5) merged.push(bullet);
    }

    // Prune to most recent MAX_BULLETS_PER_SECTION
    result[section] = merged.slice(-MAX_BULLETS_PER_SECTION);
  }
  return result;
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

  /** True if the memory file exists and has content. */
  hasMemory(): boolean {
    try {
      return fs.readFileSync(this.filePath, 'utf-8').trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Parse the "## Memory Extract" section from a synthesis string, merge the
   * new bullets into the existing four-section memory file, and write the result.
   *
   * Returns true if at least one new bullet was written.
   */
  extractAndAppend(synthesis: string, goal: string, runId: string): boolean {
    const incoming = parseMemoryExtract(synthesis);
    if (!incoming) return false;

    // Load and parse existing sections
    let existing = emptySections();
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      existing = parseSections(raw);
    } catch {
      // No file yet — start fresh.
    }

    const merged = mergeSections(existing, incoming);

    // Count new bullets added
    let added = 0;
    for (const s of MEMORY_SECTIONS) {
      added += Math.max(0, merged[s].length - (existing[s]?.length ?? 0));
    }
    if (added === 0) return false;

    const runInfo = `${new Date().toISOString().slice(0, 10)} · run ${runId} · ${goal.slice(0, 60)}`;
    const newContent = serializeSections(merged, runInfo);

    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, newContent, 'utf-8');
    } catch (err) {
      console.error('[Memory] Failed to write memory file:', (err as Error).message);
      return false;
    }

    return true;
  }

  /**
   * Manually append a bullet to a specific section.
   * Useful for `roland note "..."` or programmatic seeding.
   */
  addBullet(section: MemorySection, bullet: string): void {
    let existing = emptySections();
    try {
      existing = parseSections(fs.readFileSync(this.filePath, 'utf-8'));
    } catch { /* new file */ }

    const key = bullet.toLowerCase().slice(0, 50);
    if (!existing[section].some((e) => e.toLowerCase().slice(0, 50) === key)) {
      existing[section].push(bullet);
      if (existing[section].length > MAX_BULLETS_PER_SECTION) {
        existing[section] = existing[section].slice(-MAX_BULLETS_PER_SECTION);
      }
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, serializeSections(existing), 'utf-8');
  }

  /** Return a structured summary grouped by section for the PM planning prompt. */
  structuredSnapshot(): string {
    try {
      return fs.readFileSync(this.filePath, 'utf-8').trim();
    } catch {
      return '';
    }
  }
}
