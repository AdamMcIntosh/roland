/**
 * ProjectMemory — structured persistent cross-run knowledge for the Roland PM team.
 *
 * Written to .roland/memory.md after each run's synthesis phase.
 * Read at the start of each run and injected into the Lead PM planning prompt.
 *
 * Sections (7 total):
 *   Architecture Decisions  — tech stack choices, patterns adopted
 *   Coding Standards        — file layout, naming, testing conventions
 *   Past Mistakes           — "never do X" bullets with root causes
 *   Preferences             — explicit user/team preferences
 *   Project Gotchas         — environment quirks, API edge cases
 *   Proven Patterns         — NEW v2: reusable approaches with [×N] frequency tracking
 *   Anti-Patterns           — NEW v2: recurring mistakes, sorted by frequency
 *
 * Lifecycle:
 *   1. runTeam reads the snapshot → injected into Lead PM planning prompt
 *   2. Synthesis prompt asks PM to write a "## Memory Extract" section
 *   3. Orchestrator calls memory.extractAndAppend(synthesis, goal, runId)
 *   4. extractAndAppend parses the section format and merges new bullets
 *   5. Retrospective writes Proven Patterns / Anti-Patterns; frequency is bumped on recurrence
 */
import fs from 'fs';
import path from 'path';
export const MEMORY_FILE = 'memory.md';
/** Max chars injected into any PM prompt. */
export const MEMORY_PROMPT_MAX_CHARS = 3_000;
/** Max bullets kept per section before oldest are pruned. */
const MAX_BULLETS_PER_SECTION = 20;
/** All structured sections. Order determines display order in memory.md. */
export const MEMORY_SECTIONS = [
    'Architecture Decisions',
    'Coding Standards',
    'Past Mistakes',
    'Preferences',
    'Project Gotchas',
    'Proven Patterns',
    'Anti-Patterns',
];
/**
 * Sections where bullets are sorted by [×N] frequency descending.
 * These sections track recurring patterns across multiple runs.
 */
const FREQUENCY_SORTED = new Set([
    'Proven Patterns',
    'Anti-Patterns',
]);
/** Maps aliases used in Memory Extract / Retrospective blocks → canonical section names. */
const SECTION_ALIASES = {
    'architecture decisions': 'Architecture Decisions',
    'architecture': 'Architecture Decisions',
    'decisions': 'Architecture Decisions',
    'decision': 'Architecture Decisions',
    'coding standards': 'Coding Standards',
    'standards': 'Coding Standards',
    'patterns': 'Coding Standards',
    'pattern': 'Coding Standards',
    'past mistakes': 'Past Mistakes',
    'mistakes': 'Past Mistakes',
    'avoid': 'Past Mistakes',
    'pitfalls': 'Past Mistakes',
    'preferences': 'Preferences',
    'preference': 'Preferences',
    'user preferences': 'Preferences',
    'project gotchas': 'Project Gotchas',
    'gotchas': 'Project Gotchas',
    'gotcha': 'Project Gotchas',
    'quirks': 'Project Gotchas',
    'environment quirks': 'Project Gotchas',
    'environment': 'Project Gotchas',
    // v2 — pattern tracking sections
    'proven patterns': 'Proven Patterns',
    'proven': 'Proven Patterns',
    'good patterns': 'Proven Patterns',
    'what worked': 'Proven Patterns',
    'patterns that worked': 'Proven Patterns',
    'anti-patterns': 'Anti-Patterns',
    'anti patterns': 'Anti-Patterns',
    'antipatterns': 'Anti-Patterns',
    'anti-pattern': 'Anti-Patterns',
    'recurring mistakes': 'Anti-Patterns',
};
// ── Frequency tracking helpers ────────────────────────────────────────────────
/**
 * Strip the [×N] frequency prefix from a bullet, returning the bare text.
 * Example: "[×3] always use parallel waves" → "always use parallel waves"
 */
export function stripFrequency(bullet) {
    return bullet.replace(/^\[×\d+\]\s*/, '').trim();
}
function getFrequency(bullet) {
    const m = bullet.match(/^\[×(\d+)\]/);
    return m ? parseInt(m[1], 10) : 1;
}
/**
 * Try to find an existing bullet in arr that matches incoming (first-50-char prefix)
 * and increment its [×N] frequency counter in-place.
 * Returns true if a match was found and bumped; false if the bullet is new.
 */
function bumpFrequency(arr, incoming) {
    const key = stripFrequency(incoming).toLowerCase().slice(0, 50);
    const idx = arr.findIndex((e) => stripFrequency(e).toLowerCase().slice(0, 50) === key);
    if (idx === -1)
        return false;
    const count = getFrequency(arr[idx]) + 1;
    arr[idx] = `[×${count}] ${stripFrequency(arr[idx])}`;
    return true;
}
// ── Smart recall helpers ──────────────────────────────────────────────────────
const STOP_WORDS = new Set([
    'this', 'that', 'with', 'from', 'have', 'will', 'been', 'when', 'where',
    'what', 'which', 'they', 'them', 'their', 'then', 'than', 'into', 'each',
    'also', 'some', 'more', 'most', 'other', 'just', 'should', 'would', 'could',
    'must', 'need', 'used', 'uses', 'make', 'made', 'only', 'very', 'like',
    'such', 'about', 'after', 'before', 'these', 'those', 'always', 'never', 'every',
]);
function tokenize(text) {
    return new Set(text.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w)));
}
function scoreRelevance(bullet, goalTokens) {
    // Score against the bare text (strip [×N] prefix before tokenising)
    const bt = tokenize(stripFrequency(bullet));
    if (bt.size === 0)
        return 0;
    return [...bt].filter((w) => goalTokens.has(w)).length / bt.size;
}
// ── Serialisation ─────────────────────────────────────────────────────────────
const FILE_HEADER = '# Roland Project Memory\n\n_Updated automatically after each run. Edit manually at any time._\n';
function emptySections() {
    return Object.fromEntries(MEMORY_SECTIONS.map((s) => [s, []]));
}
function serializeSections(sections, runInfo) {
    let out = FILE_HEADER + '\n';
    for (const section of MEMORY_SECTIONS) {
        const bullets = sections[section];
        out += `## ${section}\n\n`;
        if (bullets.length > 0) {
            out += bullets.map((b) => `- ${b}`).join('\n') + '\n';
        }
        else {
            out += '_No entries yet._\n';
        }
        out += '\n';
    }
    if (runInfo) {
        out += `---\n\n_Last updated: ${runInfo}_\n`;
    }
    return out;
}
/** Parse all sections out of an existing memory.md file. */
function parseSections(raw) {
    const result = emptySections();
    for (const section of MEMORY_SECTIONS) {
        const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
        const m = raw.match(re);
        if (!m)
            continue;
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
function canonicalSection(raw) {
    const key = raw.toLowerCase().trim();
    if (SECTION_ALIASES[key])
        return SECTION_ALIASES[key];
    for (const [alias, canonical] of Object.entries(SECTION_ALIASES)) {
        if (key.includes(alias) || alias.includes(key))
            return canonical;
    }
    return null;
}
/**
 * Parse the "## Memory Extract" block from synthesis output into a SectionMap.
 * Handles both the original 5-section format and the new 7-section v2 format.
 */
export function parseMemoryExtract(synthesis) {
    const match = synthesis.match(/##\s+Memory Extract\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i);
    if (!match)
        return null;
    const extractContent = match[1];
    const result = emptySections();
    const blockRe = /\*\*([^:*\n]+):\*\*\s*\n([\s\S]*?)(?=\*\*[^:*\n]+:\*\*|$)/g;
    let m;
    let totalBullets = 0;
    while ((m = blockRe.exec(extractContent)) !== null) {
        const rawSection = m[1].trim();
        const rawContent = m[2];
        const canonical = canonicalSection(rawSection);
        if (!canonical)
            continue;
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
/**
 * Merge incoming bullets into existing sections.
 *
 * For all sections: duplicate detection uses the first-50-char prefix of the
 * stripped (frequency-free) text.
 *
 * For Proven Patterns and Anti-Patterns: when a duplicate is found the existing
 * bullet's [×N] counter is bumped instead of adding a second copy. These sections
 * are then sorted by frequency descending so high-impact patterns surface first.
 */
function mergeSections(existing, incoming) {
    const result = emptySections();
    for (const section of MEMORY_SECTIONS) {
        const current = [...(existing[section] ?? [])];
        const newItems = incoming[section] ?? [];
        for (const bullet of newItems) {
            const bumped = bumpFrequency(current, bullet);
            if (!bumped && bullet.length > 5) {
                current.push(bullet);
            }
        }
        // Frequency-tracked sections: sort highest-frequency first
        const sorted = FREQUENCY_SORTED.has(section)
            ? [...current].sort((a, b) => getFrequency(b) - getFrequency(a))
            : current;
        result[section] = sorted.slice(-MAX_BULLETS_PER_SECTION);
    }
    return result;
}
// ── ProjectMemory class ───────────────────────────────────────────────────────
export class ProjectMemory {
    filePath;
    constructor(stateDir) {
        this.filePath = path.join(stateDir, MEMORY_FILE);
    }
    /**
     * Returns the current memory file content, capped to MEMORY_PROMPT_MAX_CHARS.
     * Returns empty string if no memory file exists yet.
     */
    snapshot() {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
            if (!raw)
                return '';
            return raw.length > MEMORY_PROMPT_MAX_CHARS
                ? raw.slice(0, MEMORY_PROMPT_MAX_CHARS) + '\n…(older entries omitted)'
                : raw;
        }
        catch {
            return '';
        }
    }
    /**
     * Returns the parsed SectionMap for the current memory file.
     * Returns empty sections if the file does not exist.
     */
    parsedSections() {
        try {
            return parseSections(fs.readFileSync(this.filePath, 'utf-8'));
        }
        catch {
            return emptySections();
        }
    }
    /**
     * Merge an incoming SectionMap into the existing memory file and write it.
     * Deduplication uses the first-50-char prefix of the stripped (frequency-free) text.
     * Returns count of genuinely new bullets added (frequency bumps don't count).
     */
    mergeAndWrite(incoming, goal, runId) {
        let existing = emptySections();
        try {
            existing = parseSections(fs.readFileSync(this.filePath, 'utf-8'));
        }
        catch { /* new file */ }
        const merged = mergeSections(existing, incoming);
        // Count truly new bullets (not frequency bumps)
        let added = 0;
        for (const s of MEMORY_SECTIONS) {
            const existingKeys = new Set((existing[s] ?? []).map((e) => stripFrequency(e).toLowerCase().slice(0, 50)));
            for (const b of merged[s]) {
                if (!existingKeys.has(stripFrequency(b).toLowerCase().slice(0, 50)))
                    added++;
            }
        }
        // Also write when frequency counters changed (pattern reinforcement)
        const hadBumps = this.hasFrequencyBumps(existing, merged);
        if (added === 0 && !hadBumps)
            return 0;
        const runInfo = `${new Date().toISOString().slice(0, 10)} · run ${runId} · ${goal.slice(0, 60)}`;
        const newContent = serializeSections(merged, runInfo);
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(this.filePath, newContent, 'utf-8');
        }
        catch (e) {
            console.error('[Memory] Failed to write memory file:', e.message);
            return 0;
        }
        return added;
    }
    /** True when any frequency-tracked section has changed (indicating pattern reinforcement). */
    hasFrequencyBumps(existing, merged) {
        for (const s of MEMORY_SECTIONS) {
            if (!FREQUENCY_SORTED.has(s))
                continue;
            if ((existing[s] ?? []).join('|') !== (merged[s] ?? []).join('|'))
                return true;
        }
        return false;
    }
    /**
     * Returns a relevance-scored subset of the memory file tailored to the current goal.
     *
     * Scoring: keyword overlap with goal + small recency bonus + frequency bonus for
     * Proven Patterns and Anti-Patterns (high-frequency entries surface more readily).
     *
     * At most MAX_PER_SECTION bullets per section; total capped at maxChars.
     */
    smartSnapshot(goal, maxChars = MEMORY_PROMPT_MAX_CHARS) {
        if (!this.hasMemory())
            return '';
        let raw = '';
        try {
            raw = fs.readFileSync(this.filePath, 'utf-8');
        }
        catch {
            return '';
        }
        const sections = parseSections(raw);
        const goalTokens = tokenize(goal);
        const MAX_PER_SECTION = 4;
        const lines = ['# Roland Project Memory (Smart Recall)\n'];
        for (const section of MEMORY_SECTIONS) {
            const bullets = sections[section];
            if (bullets.length === 0)
                continue;
            const scored = bullets
                .map((bullet, idx) => ({
                bullet,
                score: scoreRelevance(bullet, goalTokens)
                    + (idx / Math.max(bullets.length, 1)) * 0.1
                    + (FREQUENCY_SORTED.has(section) ? getFrequency(bullet) * 0.05 : 0),
            }))
                .sort((a, b) => b.score - a.score);
            const top = scored.slice(0, MAX_PER_SECTION).map((s) => s.bullet);
            const remaining = bullets.length - top.length;
            const note = remaining > 0 ? ` _(+${remaining} more in .roland/memory.md)_` : '';
            lines.push(`## ${section}${note}\n`);
            for (const b of top)
                lines.push(`- ${b}`);
            lines.push('');
        }
        const result = lines.join('\n');
        return result.length > maxChars
            ? result.slice(0, maxChars) + '\n…(older entries omitted)'
            : result;
    }
    /** True if the memory file exists and has content. */
    hasMemory() {
        try {
            return fs.readFileSync(this.filePath, 'utf-8').trim().length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Parse the "## Memory Extract" section from a synthesis string, merge the
     * new bullets into the existing memory file, and write the result.
     *
     * Returns true if at least one new bullet was written.
     */
    extractAndAppend(synthesis, goal, runId) {
        const incoming = parseMemoryExtract(synthesis);
        if (!incoming)
            return false;
        return this.mergeAndWrite(incoming, goal, runId) > 0;
    }
    /**
     * Manually append a bullet to a specific section.
     * Useful for `roland note "..."` or programmatic seeding.
     */
    addBullet(section, bullet) {
        let existing = emptySections();
        try {
            existing = parseSections(fs.readFileSync(this.filePath, 'utf-8'));
        }
        catch { /* new file */ }
        const key = stripFrequency(bullet).toLowerCase().slice(0, 50);
        if (!existing[section].some((e) => stripFrequency(e).toLowerCase().slice(0, 50) === key)) {
            existing[section].push(bullet);
            if (existing[section].length > MAX_BULLETS_PER_SECTION) {
                existing[section] = existing[section].slice(-MAX_BULLETS_PER_SECTION);
            }
        }
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, serializeSections(existing), 'utf-8');
    }
    /** Return a structured summary grouped by section for the PM planning prompt. */
    structuredSnapshot() {
        try {
            return fs.readFileSync(this.filePath, 'utf-8').trim();
        }
        catch {
            return '';
        }
    }
}
//# sourceMappingURL=project-memory.js.map