/**
 * Lead PM prompts for team-mode orchestration.
 *
 * The Lead PM runs on gpt-5.4-nano and acts as Engineering Manager.
 * It never writes code — it decomposes goals, dispatches tasks, reviews
 * outputs, and synthesizes results. Three prompts cover the full PM loop:
 *
 *   buildLeadPMPlanningPrompt    — planning phase (goal → task plan)
 *   buildLeadPMReviewPrompt      — wave review (results → continue / adjust)
 *   buildLeadPMSynthesisPrompt   — synthesis phase (all results → deliverable)
 *   buildFallbackSynthesisPrompt — minimal recovery synthesis when full synthesis fails twice
 */
import type { AgentYaml } from './types.js';
export interface PlanningContext {
    goal: string;
    blackboardSnapshot: string;
    roster: AgentYaml[];
    inboxMessages?: string;
    /** Capped snapshot of .roland/memory.md from prior runs (injected when present). */
    projectMemory?: string;
    /** Injection block from project knowledge files (ROLAND.md, ARCHITECTURE.md, etc.). */
    projectKnowledge?: string;
}
export interface SynthesisContext extends PlanningContext {
    taskResults: Record<string, {
        taskTitle: string;
        agent: string;
        output: string;
    }>;
}
/**
 * Planning prompt: the Lead PM reads the goal, the current Blackboard, and
 * the team roster, then outputs a structured task plan as a JSON code block.
 */
export declare function buildLeadPMPlanningPrompt(ctx: PlanningContext): string;
/**
 * Synthesis prompt: after all workers have completed, the Lead PM reviews
 * every output and produces the final coherent deliverable.
 */
export declare function buildLeadPMSynthesisPrompt(ctx: SynthesisContext): string;
/**
 * Fallback synthesis prompt: used when the full synthesis fails twice (empty response
 * or "no detail" error). Asks only for the three essentials so the developer can continue.
 */
export declare function buildFallbackSynthesisPrompt(ctx: SynthesisContext): string;
/**
 * System prompt for interactive Cursor chat sessions where Roland acts as
 * the Lead PM in-chat. Unlike the batch terminal mode, this variant:
 *  - handles small tasks directly (file edits, explanations)
 *  - delegates complex goals to the PM team via `roland_run_team`
 *  - operates turn-by-turn with the user
 *
 * Used by the `.cursor/rules/roland.mdc` persona and exported for the
 * `roland_hello` MCP tool to surface as part of its welcome payload.
 */
export declare function buildCursorSessionPMPrompt(): string;
/** Minimal task shape used in review context (avoids circular imports). */
export interface ReviewTask {
    id: string;
    title: string;
    agent: string;
    description: string;
    dependsOn: string[];
    priority: string;
}
/** A single completed task result passed into the review prompt. */
export interface WaveResult {
    taskId: string;
    taskTitle: string;
    agent: string;
    output: string;
    /** True if the agent signalled a blocker in their output. */
    hasBlocker?: boolean;
}
/** Everything the PM needs to review a completed wave. */
export interface ReviewContext {
    goal: string;
    waveNumber: number;
    waveResults: WaveResult[];
    remainingTasks: ReviewTask[];
    blackboardSnapshot: string;
    roster: AgentYaml[];
    inboxMessages?: string;
    /** Blocker descriptions detected in this wave's agent outputs. */
    detectedBlockers?: string[];
}
/**
 * What the PM can decide after reviewing a wave.
 *
 * - `continue`  — everything is on track; proceed with the next wave as planned.
 * - `adjust`    — one or more of: spawn new tasks, unblock/message an agent,
 *                 or re-scope a pending task.
 */
export interface ReviewDecision {
    decision: 'continue' | 'adjust';
    newTasks?: ReviewTask[];
    unblocks?: Array<{
        forAgent: string;
        message: string;
    }>;
    rescopes?: Array<{
        taskId: string;
        newDescription: string;
    }>;
    pmNotes?: string;
}
export declare function isReviewDecision(v: unknown): v is ReviewDecision;
/**
 * Wave review prompt. Short and action-oriented — the PM has already done
 * the planning; this is a quick check-in, not a full re-plan.
 */
export declare function buildLeadPMReviewPrompt(ctx: ReviewContext): string;
//# sourceMappingURL=pm-prompts.d.ts.map