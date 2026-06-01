/**
 * PM layer types (Phase 2).
 *
 * A task is a typed *view* over a Blackboard entry { type:'task' } — there is no
 * parallel store, the Blackboard remains the single source of truth. Blockers and
 * artifacts are likewise Blackboard entries. This module adds the PM-semantic
 * shapes and the lifecycle state machine the TaskBoard enforces.
 */
import { z } from 'zod';
/** Allowed transitions. Any (status, action) pair not covered here is illegal. */
export const TRANSITIONS = {
    assign: { from: ['open', 'in_progress'], to: 'in_progress' },
    block: { from: ['in_progress'], to: 'blocked' },
    unblock: { from: ['blocked'], to: 'in_progress' },
    complete: { from: ['in_progress'], to: 'in_review' },
    accept: { from: ['in_review'], to: 'done' },
    reject: { from: ['in_review'], to: 'in_progress' },
    archive: { from: ['done'], to: 'archived' },
};
export class IllegalTransitionError extends Error {
    taskKey;
    action;
    from;
    constructor(taskKey, action, from) {
        super(`Illegal transition on "${taskKey}": cannot ${action} a task in "${from}" (allowed from: ${TRANSITIONS[action].from.join(', ')}).`);
        this.taskKey = taskKey;
        this.action = action;
        this.from = from;
        this.name = 'IllegalTransitionError';
    }
}
// ---------------------------------------------------------------------------
// Task / Blocker / Artifact payloads (the `value` of a Blackboard entry)
// ---------------------------------------------------------------------------
export const PrioritySchema = z.enum(['low', 'normal', 'high']);
/**
 * Cursor token-usage rollup. We track usage (tokens/requests), not dollars —
 * the PM team is billed via the Cursor subscription, so cost is always $0.
 */
export const UsageSchema = z.object({
    inputTokens: z.number().default(0),
    outputTokens: z.number().default(0),
    requests: z.number().default(0),
    model: z.string().optional(),
});
export const TaskValueSchema = z.object({
    title: z.string(),
    description: z.string(),
    assignee: z.string().optional(),
    dependsOn: z.array(z.string()).default([]),
    priority: PrioritySchema.default('normal'),
    acceptanceCriteria: z.string().optional(),
    artifactKeys: z.array(z.string()).default([]),
    blockerKeys: z.array(z.string()).default([]),
    reviewNotes: z.string().optional(),
    /** Cursor token usage attributed to this task (rolled up via report_usage). */
    usage: UsageSchema.default({ inputTokens: 0, outputTokens: 0, requests: 0 }),
});
export const BlockerValueSchema = z.object({
    taskKey: z.string(),
    need: z.string(),
    raisedBy: z.string(),
    resolution: z.string().optional(),
});
export const ArtifactValueSchema = z.object({
    taskKey: z.string(),
    summary: z.string(),
    content: z.string().optional(),
});
//# sourceMappingURL=types.js.map