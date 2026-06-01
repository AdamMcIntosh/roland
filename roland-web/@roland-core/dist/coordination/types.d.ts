/**
 * Coordination substrate types (Phase 1).
 *
 * Zod-first, mirroring src/rco/types.ts conventions. These describe the two
 * shared-awareness primitives the host (Lead PM) and sub-agents communicate
 * through: the Blackboard (durable shared facts/tasks) and the Message Bus
 * (poll-based peer-to-peer mailbox).
 */
import { z } from 'zod';
/** e.g. "lead-pm", "executor#3", "researcher". Free-form, host-assigned. */
export declare const AgentIdSchema: z.ZodString;
export type AgentId = z.infer<typeof AgentIdSchema>;
export declare const BlackboardEntryTypeSchema: z.ZodEnum<["fact", "decision", "task", "artifact", "blocker", "status"]>;
export declare const BlackboardStatusSchema: z.ZodEnum<["open", "in_progress", "blocked", "in_review", "done", "archived"]>;
export declare const BlackboardEntrySchema: z.ZodObject<{
    /** Stable id, e.g. "task:auth-refactor". Re-posting the same key updates it. */
    key: z.ZodString;
    type: z.ZodEnum<["fact", "decision", "task", "artifact", "blocker", "status"]>;
    /** Arbitrary JSON payload. */
    value: z.ZodUnknown;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    author: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<["open", "in_progress", "blocked", "in_review", "done", "archived"]>>;
    /** Optimistic-concurrency counter; bumped on every write. */
    rev: z.ZodDefault<z.ZodNumber>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "status" | "task" | "decision" | "fact" | "artifact" | "blocker";
    key: string;
    createdAt: number;
    tags: string[];
    author: string;
    rev: number;
    updatedAt: number;
    value?: unknown;
    status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
}, {
    type: "status" | "task" | "decision" | "fact" | "artifact" | "blocker";
    key: string;
    createdAt: number;
    author: string;
    updatedAt: number;
    value?: unknown;
    status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
    tags?: string[] | undefined;
    rev?: number | undefined;
}>;
export type BlackboardEntry = z.infer<typeof BlackboardEntrySchema>;
export type BlackboardEntryType = z.infer<typeof BlackboardEntryTypeSchema>;
export type BlackboardStatus = z.infer<typeof BlackboardStatusSchema>;
/** Input to Blackboard.post — create or update an entry. */
export declare const BlackboardPostInputSchema: z.ZodObject<{
    key: z.ZodString;
    type: z.ZodEnum<["fact", "decision", "task", "artifact", "blocker", "status"]>;
    value: z.ZodUnknown;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    author: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<["open", "in_progress", "blocked", "in_review", "done", "archived"]>>;
    /** If set and the existing entry's rev differs, the post is rejected. */
    expectedRev: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "status" | "task" | "decision" | "fact" | "artifact" | "blocker";
    key: string;
    author: string;
    value?: unknown;
    status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
    tags?: string[] | undefined;
    expectedRev?: number | undefined;
}, {
    type: "status" | "task" | "decision" | "fact" | "artifact" | "blocker";
    key: string;
    author: string;
    value?: unknown;
    status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
    tags?: string[] | undefined;
    expectedRev?: number | undefined;
}>;
export type BlackboardPostInput = z.infer<typeof BlackboardPostInputSchema>;
/** Input to Blackboard.patch — partial update of an existing entry. */
export declare const BlackboardPatchInputSchema: z.ZodObject<{
    key: z.ZodString;
    changes: z.ZodEffects<z.ZodObject<{
        type: z.ZodOptional<z.ZodEnum<["fact", "decision", "task", "artifact", "blocker", "status"]>>;
        value: z.ZodOptional<z.ZodUnknown>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        status: z.ZodOptional<z.ZodEnum<["open", "in_progress", "blocked", "in_review", "done", "archived"]>>;
    }, "strip", z.ZodTypeAny, {
        value?: unknown;
        type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
        status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
        tags?: string[] | undefined;
    }, {
        value?: unknown;
        type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
        status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
        tags?: string[] | undefined;
    }>, {
        value?: unknown;
        type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
        status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
        tags?: string[] | undefined;
    }, {
        value?: unknown;
        type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
        status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
        tags?: string[] | undefined;
    }>;
    author: z.ZodString;
    expectedRev: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    key: string;
    changes: {
        value?: unknown;
        type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
        status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
        tags?: string[] | undefined;
    };
    author: string;
    expectedRev?: number | undefined;
}, {
    key: string;
    changes: {
        value?: unknown;
        type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
        status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
        tags?: string[] | undefined;
    };
    author: string;
    expectedRev?: number | undefined;
}>;
export type BlackboardPatchInput = z.infer<typeof BlackboardPatchInputSchema>;
/** Filter for Blackboard.read. All fields optional → match-all. */
export declare const BlackboardQuerySchema: z.ZodObject<{
    key: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["fact", "decision", "task", "artifact", "blocker", "status"]>>;
    /** Match-any: an entry matches if it carries at least one of these tags. */
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    author: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["open", "in_progress", "blocked", "in_review", "done", "archived"]>>;
    /** Only entries with updatedAt >= since. */
    since: z.ZodOptional<z.ZodNumber>;
    /** Include archived entries (default false). */
    includeArchived: z.ZodOptional<z.ZodBoolean>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
    status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
    key?: string | undefined;
    tags?: string[] | undefined;
    author?: string | undefined;
    since?: number | undefined;
    includeArchived?: boolean | undefined;
}, {
    limit?: number | undefined;
    type?: "status" | "task" | "decision" | "fact" | "artifact" | "blocker" | undefined;
    status?: "in_progress" | "open" | "blocked" | "in_review" | "done" | "archived" | undefined;
    key?: string | undefined;
    tags?: string[] | undefined;
    author?: string | undefined;
    since?: number | undefined;
    includeArchived?: boolean | undefined;
}>;
export type BlackboardQuery = z.infer<typeof BlackboardQuerySchema>;
/** On-disk shape of blackboard.json. */
export interface BlackboardStore {
    entries: Record<string, BlackboardEntry>;
}
export declare const MessageSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    /** A specific agent id, or "*" to broadcast to everyone but the sender. */
    to: z.ZodUnion<[z.ZodString, z.ZodLiteral<"*">]>;
    topic: z.ZodDefault<z.ZodString>;
    body: z.ZodString;
    /** Id of the message this one replies to, if any. */
    replyTo: z.ZodOptional<z.ZodString>;
    ts: z.ZodNumber;
    /** Agent ids that have already drained this message via an ack'd poll. */
    deliveredTo: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    to: string;
    from: string;
    id: string;
    topic: string;
    body: string;
    ts: number;
    deliveredTo: string[];
    replyTo?: string | undefined;
}, {
    to: string;
    from: string;
    id: string;
    body: string;
    ts: number;
    topic?: string | undefined;
    replyTo?: string | undefined;
    deliveredTo?: string[] | undefined;
}>;
export type Message = z.infer<typeof MessageSchema>;
export declare const BusSendInputSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodUnion<[z.ZodString, z.ZodLiteral<"*">]>;
    topic: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
    replyTo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    to: string;
    from: string;
    body: string;
    topic?: string | undefined;
    replyTo?: string | undefined;
}, {
    to: string;
    from: string;
    body: string;
    topic?: string | undefined;
    replyTo?: string | undefined;
}>;
export type BusSendInput = z.infer<typeof BusSendInputSchema>;
export declare const BusPollInputSchema: z.ZodObject<{
    recipient: z.ZodString;
    /** Only messages with ts >= since. */
    since: z.ZodOptional<z.ZodNumber>;
    topic: z.ZodOptional<z.ZodString>;
    /** Mark returned messages as delivered to recipient (default true). */
    ack: z.ZodOptional<z.ZodBoolean>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    recipient: string;
    limit?: number | undefined;
    since?: number | undefined;
    topic?: string | undefined;
    ack?: boolean | undefined;
}, {
    recipient: string;
    limit?: number | undefined;
    since?: number | undefined;
    topic?: string | undefined;
    ack?: boolean | undefined;
}>;
export type BusPollInput = z.infer<typeof BusPollInputSchema>;
/** On-disk shape of bus.json. */
export interface BusStore {
    messages: Message[];
}
/** Thrown when an expectedRev guard does not match the stored rev. */
export declare class ConcurrencyError extends Error {
    readonly key: string;
    readonly expected: number;
    readonly actual: number;
    constructor(key: string, expected: number, actual: number);
}
//# sourceMappingURL=types.d.ts.map