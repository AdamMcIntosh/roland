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
/** Maximum total characters injected into any PM prompt. */
export declare const MAX_KNOWLEDGE_CHARS = 12000;
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
export declare function loadProjectKnowledge(projectRoot?: string): ProjectKnowledge;
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
export declare function parseKnowledgeUpdate(synthesis: string): string[];
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
export declare function appendDecisions(synthesis: string, goal: string, runId: string, projectRoot?: string): number;
//# sourceMappingURL=project-knowledge.d.ts.map