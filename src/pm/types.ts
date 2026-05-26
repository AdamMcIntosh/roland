/**
 * PM layer types (Phase 2).
 *
 * A task is a typed *view* over a Blackboard entry { type:'task' } — there is no
 * parallel store, the Blackboard remains the single source of truth. Blockers and
 * artifacts are likewise Blackboard entries. This module adds the PM-semantic
 * shapes and the lifecycle state machine the TaskBoard enforces.
 */

import { z } from 'zod';
import type { AgentId, BlackboardEntry, Message } from '../coordination/types.js';
import type { Lane, ModelVariant } from './model-policy.js';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** The subset of Blackboard statuses a task moves through. */
export type LifecycleStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'done'
  | 'archived';

export type TaskAction = 'assign' | 'block' | 'unblock' | 'complete' | 'accept' | 'reject' | 'archive';

/** Allowed transitions. Any (status, action) pair not covered here is illegal. */
export const TRANSITIONS: Record<TaskAction, { from: LifecycleStatus[]; to: LifecycleStatus }> = {
  assign: { from: ['open', 'in_progress'], to: 'in_progress' },
  block: { from: ['in_progress'], to: 'blocked' },
  unblock: { from: ['blocked'], to: 'in_progress' },
  complete: { from: ['in_progress'], to: 'in_review' },
  accept: { from: ['in_review'], to: 'done' },
  reject: { from: ['in_review'], to: 'in_progress' },
  archive: { from: ['done'], to: 'archived' },
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly taskKey: string,
    public readonly action: TaskAction,
    public readonly from: LifecycleStatus
  ) {
    super(
      `Illegal transition on "${taskKey}": cannot ${action} a task in "${from}" (allowed from: ${TRANSITIONS[action].from.join(', ')}).`
    );
    this.name = 'IllegalTransitionError';
  }
}

// ---------------------------------------------------------------------------
// Task / Blocker / Artifact payloads (the `value` of a Blackboard entry)
// ---------------------------------------------------------------------------

export const PrioritySchema = z.enum(['low', 'normal', 'high']);
export type Priority = z.infer<typeof PrioritySchema>;

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
export type Usage = z.infer<typeof UsageSchema>;

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
export type TaskValue = z.infer<typeof TaskValueSchema>;

export const BlockerValueSchema = z.object({
  taskKey: z.string(),
  need: z.string(),
  raisedBy: z.string(),
  resolution: z.string().optional(),
});
export type BlockerValue = z.infer<typeof BlockerValueSchema>;

export const ArtifactValueSchema = z.object({
  taskKey: z.string(),
  summary: z.string(),
  content: z.string().optional(),
});
export type ArtifactValue = z.infer<typeof ArtifactValueSchema>;

// ---------------------------------------------------------------------------
// Views (entry + parsed value), returned to callers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dispatch packet — the bridge: Roland advises, the host launches the engineer
// ---------------------------------------------------------------------------

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
  persona: { name: string; role_prompt: string };
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

// ---------------------------------------------------------------------------
// Team context — the PM dashboard digest (get_team_context)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Cursor usage attribution (get_team_usage)
// ---------------------------------------------------------------------------

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
