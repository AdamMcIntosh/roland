/**
 * Coordination substrate types (Phase 1).
 *
 * Zod-first, mirroring src/rco/types.ts conventions. These describe the two
 * shared-awareness primitives the host (Lead PM) and sub-agents communicate
 * through: the Blackboard (durable shared facts/tasks) and the Message Bus
 * (poll-based peer-to-peer mailbox).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

/** e.g. "lead-pm", "executor#3", "researcher". Free-form, host-assigned. */
export const AgentIdSchema = z.string().min(1);
export type AgentId = z.infer<typeof AgentIdSchema>;

// ---------------------------------------------------------------------------
// Blackboard
// ---------------------------------------------------------------------------

export const BlackboardEntryTypeSchema = z.enum([
  'fact',
  'decision',
  'task',
  'artifact',
  'blocker',
  'status',
]);

export const BlackboardStatusSchema = z.enum([
  'open',
  'in_progress',
  'blocked',
  'in_review', // Phase 2: PM review step in the task lifecycle. Back-compat: never set on pre-existing entries.
  'done',
  'archived',
]);

export const BlackboardEntrySchema = z.object({
  /** Stable id, e.g. "task:auth-refactor". Re-posting the same key updates it. */
  key: z.string().min(1),
  type: BlackboardEntryTypeSchema,
  /** Arbitrary JSON payload. */
  value: z.unknown(),
  tags: z.array(z.string()).default([]),
  author: AgentIdSchema,
  status: BlackboardStatusSchema.optional(),
  /** Optimistic-concurrency counter; bumped on every write. */
  rev: z.number().int().default(1),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type BlackboardEntry = z.infer<typeof BlackboardEntrySchema>;
export type BlackboardEntryType = z.infer<typeof BlackboardEntryTypeSchema>;
export type BlackboardStatus = z.infer<typeof BlackboardStatusSchema>;

/** Input to Blackboard.post — create or update an entry. */
export const BlackboardPostInputSchema = z.object({
  key: z.string().min(1),
  type: BlackboardEntryTypeSchema,
  value: z.unknown(),
  tags: z.array(z.string()).optional(),
  author: AgentIdSchema,
  status: BlackboardStatusSchema.optional(),
  /** If set and the existing entry's rev differs, the post is rejected. */
  expectedRev: z.number().int().optional(),
});
export type BlackboardPostInput = z.infer<typeof BlackboardPostInputSchema>;

/** Input to Blackboard.patch — partial update of an existing entry. */
export const BlackboardPatchInputSchema = z.object({
  key: z.string().min(1),
  changes: z
    .object({
      type: BlackboardEntryTypeSchema.optional(),
      value: z.unknown().optional(),
      tags: z.array(z.string()).optional(),
      status: BlackboardStatusSchema.optional(),
    })
    .refine((c) => Object.keys(c).length > 0, 'changes must not be empty'),
  author: AgentIdSchema,
  expectedRev: z.number().int().optional(),
});
export type BlackboardPatchInput = z.infer<typeof BlackboardPatchInputSchema>;

/** Filter for Blackboard.read. All fields optional → match-all. */
export const BlackboardQuerySchema = z.object({
  key: z.string().optional(),
  type: BlackboardEntryTypeSchema.optional(),
  /** Match-any: an entry matches if it carries at least one of these tags. */
  tags: z.array(z.string()).optional(),
  author: AgentIdSchema.optional(),
  status: BlackboardStatusSchema.optional(),
  /** Only entries with updatedAt >= since. */
  since: z.number().optional(),
  /** Include archived entries (default false). */
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type BlackboardQuery = z.infer<typeof BlackboardQuerySchema>;

/** On-disk shape of blackboard.json. */
export interface BlackboardStore {
  entries: Record<string, BlackboardEntry>;
}

// ---------------------------------------------------------------------------
// Message Bus
// ---------------------------------------------------------------------------

export const MessageSchema = z.object({
  id: z.string(),
  from: AgentIdSchema,
  /** A specific agent id, or "*" to broadcast to everyone but the sender. */
  to: z.union([AgentIdSchema, z.literal('*')]),
  topic: z.string().default('general'),
  body: z.string(),
  /** Id of the message this one replies to, if any. */
  replyTo: z.string().optional(),
  ts: z.number(),
  /** Agent ids that have already drained this message via an ack'd poll. */
  deliveredTo: z.array(AgentIdSchema).default([]),
});
export type Message = z.infer<typeof MessageSchema>;

export const BusSendInputSchema = z.object({
  from: AgentIdSchema,
  to: z.union([AgentIdSchema, z.literal('*')]),
  topic: z.string().optional(),
  body: z.string(),
  replyTo: z.string().optional(),
});
export type BusSendInput = z.infer<typeof BusSendInputSchema>;

export const BusPollInputSchema = z.object({
  recipient: AgentIdSchema,
  /** Only messages with ts >= since. */
  since: z.number().optional(),
  topic: z.string().optional(),
  /** Mark returned messages as delivered to recipient (default true). */
  ack: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type BusPollInput = z.infer<typeof BusPollInputSchema>;

/** On-disk shape of bus.json. */
export interface BusStore {
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when an expectedRev guard does not match the stored rev. */
export class ConcurrencyError extends Error {
  constructor(
    public readonly key: string,
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(
      `Concurrency conflict on "${key}": expected rev ${expected}, found ${actual}. Re-read and retry.`
    );
    this.name = 'ConcurrencyError';
  }
}
