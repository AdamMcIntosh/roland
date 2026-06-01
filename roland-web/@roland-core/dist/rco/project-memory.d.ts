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
export declare const MEMORY_FILE = "memory.md";
/** Max chars injected into any PM prompt. */
export declare const MEMORY_PROMPT_MAX_CHARS = 3000;
/** All structured sections. Order determines display order in memory.md. */
export declare const MEMORY_SECTIONS: readonly ["Architecture Decisions", "Coding Standards", "Past Mistakes", "Preferences", "Project Gotchas", "Proven Patterns", "Anti-Patterns"];
export type MemorySection = (typeof MEMORY_SECTIONS)[number];
/**
 * Strip the [×N] frequency prefix from a bullet, returning the bare text.
 * Example: "[×3] always use parallel waves" → "always use parallel waves"
 */
export declare function stripFrequency(bullet: string): string;
type SectionMap = Record<MemorySection, string[]>;
/**
 * Parse the "## Memory Extract" block from synthesis output into a SectionMap.
 * Handles both the original 5-section format and the new 7-section v2 format.
 */
export declare function parseMemoryExtract(synthesis: string): SectionMap | null;
export declare class ProjectMemory {
    private readonly filePath;
    constructor(stateDir: string);
    /**
     * Returns the current memory file content, capped to MEMORY_PROMPT_MAX_CHARS.
     * Returns empty string if no memory file exists yet.
     */
    snapshot(): string;
    /**
     * Returns the parsed SectionMap for the current memory file.
     * Returns empty sections if the file does not exist.
     */
    parsedSections(): SectionMap;
    /**
     * Merge an incoming SectionMap into the existing memory file and write it.
     * Deduplication uses the first-50-char prefix of the stripped (frequency-free) text.
     * Returns count of genuinely new bullets added (frequency bumps don't count).
     */
    mergeAndWrite(incoming: SectionMap, goal: string, runId: string): number;
    /** True when any frequency-tracked section has changed (indicating pattern reinforcement). */
    private hasFrequencyBumps;
    /**
     * Returns a relevance-scored subset of the memory file tailored to the current goal.
     *
     * Scoring: keyword overlap with goal + small recency bonus + frequency bonus for
     * Proven Patterns and Anti-Patterns (high-frequency entries surface more readily).
     *
     * At most MAX_PER_SECTION bullets per section; total capped at maxChars.
     */
    smartSnapshot(goal: string, maxChars?: number): string;
    /** True if the memory file exists and has content. */
    hasMemory(): boolean;
    /**
     * Parse the "## Memory Extract" section from a synthesis string, merge the
     * new bullets into the existing memory file, and write the result.
     *
     * Returns true if at least one new bullet was written.
     */
    extractAndAppend(synthesis: string, goal: string, runId: string): boolean;
    /**
     * Manually append a bullet to a specific section.
     * Useful for `roland note "..."` or programmatic seeding.
     */
    addBullet(section: MemorySection, bullet: string): void;
    /** Return a structured summary grouped by section for the PM planning prompt. */
    structuredSnapshot(): string;
}
export {};
//# sourceMappingURL=project-memory.d.ts.map