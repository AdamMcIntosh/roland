/**
 * Mission Complete footer — promotes Next Steps to a prominent end-of-run section.
 *
 * Used by team-orchestrator (roland team) and exported for orchestrate post-processing.
 */
export interface MissionCompleteContext {
    goal: string;
    blockersEncountered: number;
    wavesRun: number;
    taskCount: number;
    /** When true, use abbreviated footer and strip verbose synthesis sections. */
    minimalGoal?: boolean;
}
/** Strip any prior Mission Complete footer the PM may have written despite instructions. */
export declare function stripMissionCompleteFooter(synthesis: string): string;
/**
 * Extract a Next Steps section from synthesis body (if present).
 * Returns stripped body and extracted step content (without the header).
 */
export declare function extractNextStepsSection(synthesis: string): {
    body: string;
    nextSteps: string | null;
};
/** Remove hardening-themed false blockers from minimal-task synthesis. */
export declare function sanitizeReleaseBlockersForMinimalGoal(body: string): string;
/** Compact synthesis body before the Mission Complete footer is appended. */
export declare function compactSynthesisBody(body: string, goal: string): string;
/** Build the prominent Mission Complete footer (always the last section of stdout). */
export declare function formatMissionCompleteFooter(ctx: MissionCompleteContext, nextSteps: string | null): string;
/** Ensure nothing appears after the canonical Mission Complete footer block. */
export declare function ensureFooterIsTerminal(output: string): string;
/**
 * Strip any prior Mission Complete footer, extract Next Steps from the body,
 * compact the synthesis, and append the standardized Mission Complete section.
 */
export declare function finalizeSynthesisOutput(synthesis: string, ctx: MissionCompleteContext): string;
//# sourceMappingURL=mission-complete.d.ts.map