/**
 * PM layer types (Phase 2).
 *
 * A task is a typed *view* over a Blackboard entry { type:'task' } — there is no
 * parallel store, the Blackboard remains the single source of truth. Blockers and
 * artifacts are likewise Blackboard entries. This module adds the PM-semantic
 * shapes and the lifecycle state machine the TaskBoard enforces.
 */
import { z } from 'zod';
import type { BlackboardEntry, Message } from '../coordination/types.js';
import type { Lane, ModelVariant } from './model-policy.js';
/** The subset of Blackboard statuses a task moves through. */
export type LifecycleStatus = 'open' | 'in_progress' | 'blocked' | 'in_review' | 'done' | 'archived';
export type TaskAction = 'assign' | 'block' | 'unblock' | 'complete' | 'accept' | 'reject' | 'archive';
/** Allowed transitions. Any (status, action) pair not covered here is illegal. */
export declare const TRANSITIONS: Record<TaskAction, {
    from: LifecycleStatus[];
    to: LifecycleStatus;
}>;
export declare class IllegalTransitionError extends Error {
    readonly taskKey: string;
    readonly action: TaskAction;
    readonly from: LifecycleStatus;
    constructor(taskKey: string, action: TaskAction, from: LifecycleStatus);
}
export declare const PrioritySchema: z.ZodEnum<["low", "normal", "high"]>;
export type Priority = z.infer<typeof PrioritySchema>;
/**
 * Cursor token-usage rollup. We track usage (tokens/requests), not dollars —
 * the PM team is billed via the Cursor subscription, so cost is always $0.
 */
export declare const UsageSchema: z.ZodObject<{
    inputTokens: z.ZodDefault<z.ZodNumber>;
    outputTokens: z.ZodDefault<z.ZodNumber>;
    requests: z.ZodDefault<z.ZodNumber>;
    model: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    model?: string | undefined;
}, {
    model?: string | undefined;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    requests?: number | undefined;
}>;
export type Usage = z.infer<typeof UsageSchema>;
export declare const TaskValueSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    assignee: z.ZodOptional<z.ZodString>;
    dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
    acceptanceCriteria: z.ZodOptional<z.ZodString>;
    artifactKeys: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    blockerKeys: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    reviewNotes: z.ZodOptional<z.ZodString>;
    /** Cursor token usage attributed to this task (rolled up via report_usage). */
    usage: z.ZodDefault<z.ZodObject<{
        inputTokens: z.ZodDefault<z.ZodNumber>;
        outputTokens: z.ZodDefault<z.ZodNumber>;
        requests: z.ZodDefault<z.ZodNumber>;
        model: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        inputTokens: number;
        outputTokens: number;
        requests: number;
        model?: string | undefined;
    }, {
        model?: string | undefined;
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        requests?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    title: string;
    dependsOn: string[];
    priority: "low" | "normal" | "high";
    artifactKeys: string[];
    blockerKeys: string[];
    usage: {
        inputTokens: number;
        outputTokens: number;
        requests: number;
        model?: string | undefined;
    };
    assignee?: string | undefined;
    acceptanceCriteria?: string | undefined;
    reviewNotes?: string | undefined;
}, {
    description: string;
    title: string;
    assignee?: string | undefined;
    dependsOn?: string[] | undefined;
    priority?: "low" | "normal" | "high" | undefined;
    acceptanceCriteria?: string | undefined;
    artifactKeys?: string[] | undefined;
    blockerKeys?: string[] | undefined;
    reviewNotes?: string | undefined;
    usage?: {
        model?: string | undefined;
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        requests?: number | undefined;
    } | undefined;
}>;
export type TaskValue = z.infer<typeof TaskValueSchema>;
export declare const BlockerValueSchema: z.ZodObject<{
    taskKey: z.ZodString;
    need: z.ZodString;
    raisedBy: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    taskKey: string;
    need: string;
    raisedBy: string;
    resolution?: string | undefined;
}, {
    taskKey: string;
    need: string;
    raisedBy: string;
    resolution?: string | undefined;
}>;
export type BlockerValue = z.infer<typeof BlockerValueSchema>;
export declare const ArtifactValueSchema: z.ZodObject<{
    taskKey: z.ZodString;
    summary: z.ZodString;
    content: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    taskKey: string;
    summary: string;
    content?: string | undefined;
}, {
    taskKey: string;
    summary: string;
    content?: string | undefined;
}>;
export type ArtifactValue = z.infer<typeof ArtifactValueSchema>;
export interface TaskView {
    key: string;
    status: LifecycleStatus;
    rev: number;
    updatedAt: number;
    value: TaskValue;
}
export interface BlockerView {
    key: string;
    status: string;
    value: BlockerValue;
    /** When the blocker was raised — drives the "stale blocker" age hint. */
    createdAt?: number;
}
/** The model-routing decision for a dispatch (Cursor-native, see router.ts). */
export interface DispatchRouting {
    lane: Lane;
    /** Cursor model id the engineer should run on, e.g. "composer-2.5-standard". */
    model: string;
    provider: 'cursor';
    variant: ModelVariant;
    interactive: boolean;
    rationale: string;
}
export interface DispatchPacket {
    taskKey: string;
    /** The engineer persona to run this task as. */
    persona: {
        name: string;
        role_prompt: string;
    };
    /** Cursor model id the engineer should run on (mirror of routing.model). */
    recommendedModel: string;
    /** Why this model — lane and reasoning, for the PM's visibility. */
    routing: DispatchRouting;
    /** Fully assembled instruction the host gives the engineer. */
    brief: string;
    /** Best-effort relevant files for the engineer's context. */
    contextFiles: string[];
    /** How the engineer reports back into the loop. */
    reportingInstructions: string;
    /** Copy-paste-ready, step-by-step instructions to launch this engineer in Cursor. */
    cursorLaunch: string;
}
export type AttentionKind = 'blocker' | 'review' | 'stalled' | 'ready' | 'inbox';
export interface AttentionItem {
    kind: AttentionKind;
    /** Higher = more urgent. Blockers outrank everything so unblocking comes first. */
    priority: number;
    reason: string;
    /** A concrete suggested next tool call. */
    action: string;
    taskKey?: string;
    blockerKey?: string;
}
export interface UsageRollup {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    /** Last model seen for this bucket. */
    model?: string;
}
export interface TeamUsage {
    byEngineer: Record<string, UsageRollup>;
    byModel: Record<string, UsageRollup>;
    byTask: Record<string, UsageRollup>;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    /** Reminder that these are usage figures, not dollar costs. */
    note: string;
}
export interface TeamContext {
    /** One-line marching order, emphasising unblock-before-new-work. */
    directive: string;
    summary: Record<'open' | 'in_progress' | 'blocked' | 'in_review' | 'done', number>;
    /** Sorted most-urgent-first; blockers always lead. */
    needsAttention: AttentionItem[];
    blockers: BlockerView[];
    activeTasks: TaskView[];
    /** Open tasks whose dependencies are all done — safe to start. */
    readyToStart: TaskView[];
    /** Bus messages addressed to lead-pm (peeked, not consumed). */
    inbox: Message[];
    recentDecisions: BlackboardEntry[];
    /** Top suggested tool calls, unblocks first. */
    nextActions: string[];
    /** Cursor token usage attributed across the team. */
    usage: TeamUsage;
}
//# sourceMappingURL=types.d.ts.map