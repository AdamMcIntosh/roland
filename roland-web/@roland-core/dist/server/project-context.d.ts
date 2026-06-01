/**
 * Project Context Manager — Cross-session knowledge base for Roland.
 *
 * Persists conventions, patterns, decisions, and error resolutions to
 * `.roland/project-context.json` in the project root. Compounds knowledge
 * over time: repeated observations increase confidence, stale low-confidence
 * entries are pruned automatically.
 *
 * Designed to be wired into SessionContextManager so that knowledge
 * discovered during a session flows automatically into the persistent store.
 */
export interface ConventionEntry {
    id: string;
    category: string;
    description: string;
    examples: string[];
    confidence: number;
    pinned: boolean;
    first_seen: string;
    last_seen: string;
    times_observed: number;
}
export interface PatternEntry {
    id: string;
    name: string;
    description: string;
    files: string[];
    confidence: number;
    pinned: boolean;
    first_seen: string;
    last_seen: string;
    times_observed: number;
}
export interface DecisionEntry {
    id: string;
    description: string;
    rationale: string;
    date: string;
    pinned: boolean;
}
export interface ErrorEntry {
    id: string;
    error_pattern: string;
    resolution: string;
    occurrences: number;
    pinned: boolean;
    first_seen: string;
    last_seen: string;
}
export interface ProjectKnowledge {
    version: '1.0';
    project: {
        name: string;
        language?: string;
        framework?: string;
        test_runner?: string;
    };
    conventions: ConventionEntry[];
    patterns: PatternEntry[];
    decisions: DecisionEntry[];
    errors: ErrorEntry[];
    last_updated: string;
}
export declare class ProjectContextManager {
    private readonly contextPath;
    private readonly rolandDir;
    private knowledge;
    constructor(projectRoot: string);
    /**
     * Synchronous load used in constructor so the manager is ready immediately.
     */
    private loadSync;
    /**
     * Re-read from disk (async). Useful if another process may have written.
     */
    load(): Promise<ProjectKnowledge>;
    /**
     * Atomic-ish write: write to temp file then rename to avoid corruption.
     */
    save(): Promise<void>;
    /**
     * Add or reinforce an entry. Fuzzy-matches on first 50 chars of description.
     * Reinforced entries get confidence += 0.1 (capped at 1.0) and updated last_seen.
     * New entries start at confidence 0.3.
     */
    observe(type: 'convention' | 'pattern' | 'decision' | 'error', data: Record<string, unknown>): void;
    /**
     * Return entries optionally filtered by type.
     */
    query(type?: 'convention' | 'pattern' | 'decision' | 'error'): ConventionEntry[] | PatternEntry[] | DecisionEntry[] | ErrorEntry[] | Record<string, unknown>;
    /**
     * Generate a concise ## Project Knowledge markdown block for prompt injection.
     * Max ~2000 chars, prioritized by confidence.
     */
    formatForPrompt(): string;
    /**
     * Pin an entry by ID across all entry types. Returns true if found.
     */
    pin(id: string): boolean;
    /**
     * Unpin an entry by ID. Returns true if found.
     */
    unpin(id: string): boolean;
    /**
     * Remove an entry by ID. Returns true if removed.
     */
    remove(id: string): boolean;
    /**
     * Remove entries where confidence < 0.2 AND last_seen older than 30 days AND not pinned.
     * Returns count of removed entries.
     */
    prune(): number;
    /**
     * Clear all entries, preserving project metadata.
     */
    reset(): void;
    /**
     * Return a copy of the full knowledge object.
     */
    getKnowledge(): ProjectKnowledge;
    private emptyKnowledge;
    private fuzzyMatch;
    private findByDescription;
    private setPin;
}
//# sourceMappingURL=project-context.d.ts.map