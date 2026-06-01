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
import type { MemorySection } from './project-memory.js';
export type SectionMap = Record<MemorySection, string[]>;
export interface HumanFeedback {
    rating: number;
    notes?: string;
}
/**
 * Prompt the user for a quick 1–10 run rating + optional notes.
 * Auto-skips after timeoutSeconds. Returns null when not TTY or user skips.
 *
 * Input format: "7" or "8 parallel waves worked great here"
 *
 * Pass `rl` to reuse the caller's readline interface instead of creating a
 * competing one on stdin (which would close stdin and kill the outer REPL).
 */
export declare function collectHumanFeedback(goal: string, opts: {
    isTTY: boolean;
    timeoutSeconds: number;
    rl?: readline.Interface;
}): Promise<HumanFeedback | null>;
/**
 * Parse the "## Memory Citations" block from the Lead PM's plan output.
 * The planning prompt asks the PM to write this block when prior memory
 * influenced the task design, so users can see learning-in-action.
 *
 * Returns array of citation strings, e.g.:
 *   '"Never call req.destroy() before HTTP response" → injected constraint into executor task-1'
 */
export declare function parsePlanCitations(planText: string): string[];
/**
 * Extract the "## Planning Self-Critique" section from the retrospective output.
 * Returns the critique text or null if absent/empty.
 */
export declare function parseSelfCritique(retroText: string): string | null;
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
export declare function buildRetrospectivePrompt(goal: string, synthesis: string, taskSummary: string, currentMemory: string, feedback?: HumanFeedback): string;
/**
 * Parse the "## Retrospective Memory Update" block from the PM's output.
 *
 * Returns a SectionMap with bullets grouped by section, or null if
 * the block is absent or contains no actionable bullets.
 *
 * Handles both the original 5-section format (v1) and the new 7-section format (v2).
 */
export declare function parseRetrospectiveOutput(text: string): SectionMap | null;
export interface MemoryProposalOptions {
    /** Auto-accept without showing UI when true. */
    quiet: boolean;
    /** Auto-accept without showing UI when false (non-interactive terminal). */
    isTTY: boolean;
    /** Seconds before auto-accept fires. Default 15. */
    timeoutSeconds: number;
    /**
     * Reuse an existing readline interface instead of creating a competing one
     * on stdin. Required when called from the chat REPL to prevent closing stdin.
     */
    rl?: readline.Interface;
}
/**
 * Show the user a diff of proposed new memory bullets and ask whether to
 * accept them. Auto-accepts after `timeoutSeconds` if no input.
 *
 * Returns 'accepted' immediately when `quiet` or `!isTTY` (no interaction).
 * Returns 'accepted' when there are 0 genuinely new bullets (nothing to review).
 */
export declare function showMemoryProposal(proposed: SectionMap, existing: SectionMap, opts: MemoryProposalOptions): Promise<'accepted' | 'skipped'>;
/**
 * Merge an approved SectionMap into .roland/memory.md and return the count
 * of new bullets actually written.
 */
export declare function applyRetroUpdate(incoming: SectionMap, stateDir: string, goal: string, runId: string): number;
//# sourceMappingURL=self-improvement.d.ts.map