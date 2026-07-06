/**
 * ## P1 Honesty & Consolidation
 *
 * Coordination substrate tools: Blackboard + Message Bus.
 */

import { ConcurrencyError } from '../../coordination/index.js';
import { PROJECT_CONTEXT_SCHEMA, type McpToolContext, type McpToolRegistrar } from './types.js';

export function registerCoordinationTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'blackboard_post',
    'Publish or update a shared entry on the team Blackboard (a fact, decision, task, artifact, blocker, or status). Re-posting the same key updates it and bumps its rev. Pass expectedRev to guard against overwriting a concurrent change.',
    async (args: Record<string, unknown>) => {
      try {
        const entry = ctx.scopedCoordination(args).blackboard.post({
          key: args.key as string,
          type: args.type as never,
          value: args.value,
          tags: args.tags as string[] | undefined,
          author: args.author as string,
          status: args.status as never,
          expectedRev: args.expectedRev as number | undefined,
        });
        return { ok: true, entry };
      } catch (err) {
        if (err instanceof ConcurrencyError) {
          return { ok: false, conflict: { key: err.key, expected: err.expected, actual: err.actual } };
        }
        throw err;
      }
    },
    {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Stable id for the entry, e.g. "task:auth-refactor". Re-posting updates it.' },
        type: { type: 'string', enum: ['fact', 'decision', 'task', 'artifact', 'blocker', 'status'], description: 'Kind of entry.' },
        value: { description: 'Arbitrary JSON payload (string, object, etc.).' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering.' },
        author: { type: 'string', description: 'Agent id posting this, e.g. "lead-pm" or "executor#3".' },
        status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'archived'], description: 'Optional lifecycle status (most useful for tasks/blockers).' },
        expectedRev: { type: 'number', description: 'If set and the stored rev differs, the post is rejected with a concurrency error.' },
        ...PROJECT_CONTEXT_SCHEMA,
      },
      required: ['key', 'type', 'value', 'author'],
    },
  );

  registrar.registerTool(
    'blackboard_read',
    'Read entries from the team Blackboard, newest first. All filters are optional; with none, returns the most recent entries. Use this to get shared awareness of tasks, decisions, and blockers across the team.',
    async (args: Record<string, unknown>) => {
      const entries = ctx.scopedCoordination(args).blackboard.read({
        key: args.key as string | undefined,
        type: args.type as never,
        tags: args.tags as string[] | undefined,
        author: args.author as string | undefined,
        status: args.status as never,
        since: args.since as number | undefined,
        includeArchived: args.includeArchived as boolean | undefined,
        limit: (args.limit as number | undefined) ?? 50,
      });
      return { count: entries.length, entries };
    },
    {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Exact key to fetch.' },
        type: { type: 'string', enum: ['fact', 'decision', 'task', 'artifact', 'blocker', 'status'] },
        tags: { type: 'array', items: { type: 'string' }, description: 'Match-any: entry matches if it has at least one of these tags.' },
        author: { type: 'string' },
        status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'archived'] },
        since: { type: 'number', description: 'Only entries updated at or after this epoch-ms timestamp.' },
        includeArchived: { type: 'boolean', description: 'Include archived entries (default false).' },
        limit: { type: 'number', description: 'Max entries to return (default 50, max 200).' },
        ...PROJECT_CONTEXT_SCHEMA,
      },
      required: [],
    },
  );

  registrar.registerTool(
    'blackboard_patch',
    'Partially update an existing Blackboard entry (e.g. transition a task status to in_progress/done, or revise its value). Bumps rev. Fails if the key does not exist.',
    async (args: Record<string, unknown>) => {
      try {
        const entry = ctx.scopedCoordination(args).blackboard.patch({
          key: args.key as string,
          author: args.author as string,
          changes: (args.changes as Record<string, unknown>) ?? {},
          expectedRev: args.expectedRev as number | undefined,
        });
        return { ok: true, entry };
      } catch (err) {
        if (err instanceof ConcurrencyError) {
          return { ok: false, conflict: { key: err.key, expected: err.expected, actual: err.actual } };
        }
        throw err;
      }
    },
    {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key of the entry to update.' },
        author: { type: 'string', description: 'Agent id making the change.' },
        changes: {
          type: 'object',
          description: 'Fields to change.',
          properties: {
            type: { type: 'string', enum: ['fact', 'decision', 'task', 'artifact', 'blocker', 'status'] },
            value: { description: 'New JSON payload.' },
            tags: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'archived'] },
          },
        },
        expectedRev: { type: 'number', description: 'Optional optimistic-concurrency guard.' },
      },
      required: ['key', 'author', 'changes'],
    },
  );

  registrar.registerTool(
    'bus_send',
    'Send a message on the team Message Bus to a specific agent, or to "*" to broadcast to everyone but the sender. Use this for direct peer-to-peer coordination that does not belong on the shared Blackboard.',
    async (args: Record<string, unknown>) => {
      const message = ctx.scopedCoordination(args).bus.send({
        from: args.from as string,
        to: args.to as string,
        topic: args.topic as string | undefined,
        body: args.body as string,
        replyTo: args.replyTo as string | undefined,
      });
      return { ok: true, message };
    },
    {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Sender agent id.' },
        to: { type: 'string', description: 'Recipient agent id, or "*" to broadcast.' },
        topic: { type: 'string', description: 'Optional topic/channel (default "general").' },
        body: { type: 'string', description: 'Message content.' },
        replyTo: { type: 'string', description: 'Optional id of the message this replies to.' },
      },
      required: ['from', 'to', 'body'],
    },
  );

  registrar.registerTool(
    'bus_poll',
    'Drain undelivered messages addressed to an agent (directly or via broadcast). By default acknowledges them so they are not returned again. Returns messages oldest-first plus a nextSince cursor for the next poll.',
    async (args: Record<string, unknown>) => {
      const messages = ctx.scopedCoordination(args).bus.poll({
        recipient: args.recipient as string,
        since: args.since as number | undefined,
        topic: args.topic as string | undefined,
        ack: args.ack as boolean | undefined,
        limit: args.limit as number | undefined,
      });
      const nextSince = messages.length > 0 ? messages[messages.length - 1].ts + 1 : (args.since as number | undefined);
      return { count: messages.length, messages, nextSince };
    },
    {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Agent id whose mailbox to drain.' },
        since: { type: 'number', description: 'Only messages at or after this epoch-ms timestamp.' },
        topic: { type: 'string', description: 'Restrict to a single topic.' },
        ack: { type: 'boolean', description: 'Mark returned messages delivered to this recipient (default true). Set false to peek.' },
        limit: { type: 'number', description: 'Max messages to return (1-200).' },
      },
      required: ['recipient'],
    },
  );
}
