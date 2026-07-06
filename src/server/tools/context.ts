/**
 * ## P1 Honesty & Consolidation
 *
 * Session, project, and migration context tools.
 */

import fs from 'fs';
import path from 'path';
import { McpToolError } from '../../utils/errors.js';
import {
  buildContextBlock,
  appendRule,
  appendDecision,
  appendTestPattern,
  appendCustomSection,
  readContext,
  writeRcoState,
  readRcoState,
} from '../../utils/migration-context.js';
import type { McpToolContext, McpToolRegistrar } from './types.js';

export function registerContextTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registerLoadMigrationContext(registrar);
  registerUpdateMigrationContext(registrar);
  registerSessionContext(registrar, ctx);
  registerProjectContext(registrar, ctx);
  registerReadContext(registrar);
}

function registerLoadMigrationContext(registrar: McpToolRegistrar): void {
  registrar.registerTool(
    'load_migration_context',
    'Load the project migration context (roland-context.json + .rco-state.json) and return a prompt-ready markdown block. Call this at the start of every session to inject mapping rules, past decisions, and test patterns. Optionally initialise a new session ID.',
    async (args: Record<string, unknown>) => {
      const projectRoot = typeof args.project_root === 'string' && args.project_root
        ? args.project_root
        : undefined;
      const initSession = args.init_session === true;

      if (initSession) {
        const sessionId = `session-${Date.now()}`;
        writeRcoState({
          sessionId,
          startedAt: new Date().toISOString(),
          activeRecipe: null,
          stepIndex: 0,
          context: {},
        }, projectRoot);
      }

      const contextBlock = buildContextBlock(projectRoot);
      const migrationCtx = readContext(projectRoot);
      const state = readRcoState(projectRoot);

      return {
        context_block: contextBlock,
        summary: {
          project: `${migrationCtx.project.sourceLanguage}→${migrationCtx.project.targetLanguage}: ${migrationCtx.project.description}`,
          rules_count: migrationCtx.rules.length,
          decisions_count: migrationCtx.decisions.length,
          test_patterns_count: migrationCtx.testPatterns.length,
          custom_sections: Object.keys(migrationCtx.customSections),
          session_id: state?.sessionId ?? null,
        },
        instructions: 'Paste the context_block into your system prompt or prepend it to the user task before planning. Use update_migration_context to add new rules or decisions discovered during this session.',
      };
    },
    {
      type: 'object',
      properties: {
        project_root: { type: 'string', description: 'Absolute path to the project directory (default: ROLAND_PROJECT_ROOT env var, then cwd)' },
        init_session: { type: 'boolean', description: 'If true, creates a fresh .rco-state.json with a new session ID (default: false)' },
      },
      required: [],
    },
  );
}

function registerUpdateMigrationContext(registrar: McpToolRegistrar): void {
  registrar.registerTool(
    'update_migration_context',
    'Append a new mapping rule, architectural decision, test pattern, or custom section to roland-context.json and regenerate MIGRATION.md. Use this whenever a new VB6→C# pattern or project decision is discovered.',
    async (args: Record<string, unknown>) => {
      const type = args.type as string;
      const projectRoot = typeof args.project_root === 'string' && args.project_root
        ? args.project_root
        : undefined;

      if (!type) throw new McpToolError('update_migration_context', '"type" is required');

      switch (type) {
        case 'rule': {
          const pattern = args.pattern as string;
          const replacement = args.replacement as string;
          if (!pattern || !replacement) {
            throw new McpToolError('update_migration_context', '"pattern" and "replacement" required for type=rule');
          }
          const rule = appendRule(pattern, replacement, args.notes as string | undefined, projectRoot);
          return { added: 'rule', rule, message: `Rule #${rule.id} added and MIGRATION.md updated.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new rule.' };
        }
        case 'decision': {
          const description = args.description as string;
          const rationale = args.rationale as string;
          if (!description || !rationale) {
            throw new McpToolError('update_migration_context', '"description" and "rationale" required for type=decision');
          }
          const decision = appendDecision(description, rationale, projectRoot);
          return { added: 'decision', decision, message: `Decision #${decision.id} added and MIGRATION.md updated.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new decision.' };
        }
        case 'test_pattern': {
          const name = args.name as string;
          const patternDescription = args.description as string;
          if (!name || !patternDescription) {
            throw new McpToolError('update_migration_context', '"name" and "description" required for type=test_pattern');
          }
          const tp = appendTestPattern(name, patternDescription, args.example as string | undefined, projectRoot);
          return { added: 'test_pattern', test_pattern: tp, message: `Test pattern #${tp.id} added and MIGRATION.md updated.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new test pattern.' };
        }
        case 'section': {
          const section = args.section as string;
          const content = args.content as string;
          if (!section || !content) {
            throw new McpToolError('update_migration_context', '"section" and "content" required for type=section');
          }
          appendCustomSection(section, content, projectRoot);
          return { added: 'section', section, message: `Custom section "${section}" updated in roland-context.json and MIGRATION.md.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new section.' };
        }
        default:
          throw new McpToolError('update_migration_context', `Unknown type "${type}". Use: rule, decision, test_pattern, section`);
      }
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['rule', 'decision', 'test_pattern', 'section'], description: 'What to append' },
        project_root: { type: 'string', description: 'Absolute path to the project directory' },
        pattern: { type: 'string', description: '[rule] VB6 pattern or construct being replaced' },
        replacement: { type: 'string', description: '[rule] C# equivalent' },
        notes: { type: 'string', description: '[rule] Optional notes or caveats' },
        description: { type: 'string', description: '[decision | test_pattern] Short description' },
        rationale: { type: 'string', description: '[decision] Why this decision was made' },
        name: { type: 'string', description: '[test_pattern] Pattern name' },
        example: { type: 'string', description: '[test_pattern] Optional code example' },
        section: { type: 'string', description: '[section] Section heading' },
        content: { type: 'string', description: '[section] Markdown content to append' },
      },
      required: ['type'],
    },
  );
}

function registerSessionContext(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'session_context',
    'Persistent memory for long coding sessions. Tracks decisions, file changes, patterns, migration progress, and errors across subagent calls. Use this to maintain context continuity — call "get" before spawning subagents and "update" after each step.',
    async (args: Record<string, unknown>) => {
      const action = (args.action as string) || 'get';
      const sessionId = args.session_id as string | undefined;

      switch (action) {
        case 'start': {
          const task = args.task as string;
          if (!task) throw new McpToolError('session_context', 'task is required for start action');
          const id = args.id as string | undefined;
          const session = ctx.sessionContextManager.start(task, id);
          return {
            action: 'start',
            session_id: session.id,
            task: session.task,
            message: `Session "${session.id}" started. Call session_context with action="update" after each step to build context.`,
          };
        }
        case 'get': {
          const session = ctx.sessionContextManager.get(sessionId);
          if (!session) {
            return { action: 'get', message: 'No active session. Use action="start" with a task description to begin one.' };
          }
          const formatted = ctx.sessionContextManager.formatForSubagent(session.id);
          return {
            action: 'get',
            session_id: session.id,
            task: session.task,
            current_step: session.current_step,
            context: formatted,
            stats: {
              decisions: session.decisions.length,
              files_modified: session.files_modified.length,
              patterns: session.patterns.length,
              migrations: session.migration_map.length,
              errors_resolved: session.errors_resolved.length,
            },
            instructions: 'Pass the "context" field to any subagent as part of its prompt to maintain session continuity.',
          };
        }
        case 'update': {
          const sid = sessionId || ctx.sessionContextManager.get()?.id;
          if (!sid) throw new McpToolError('session_context', 'No active session. Use action="start" first.');

          const updates: Record<string, unknown> = {};
          if (args.decision) updates.decision = args.decision;
          if (args.file_change) updates.file_change = args.file_change;
          if (args.pattern) updates.pattern = args.pattern;
          if (args.migration) updates.migration = args.migration;
          if (args.error_resolved) updates.error_resolved = args.error_resolved;
          if (args.note) updates.note = args.note;
          if (args.advance_step !== undefined) updates.advance_step = args.advance_step;

          const session = ctx.sessionContextManager.update(sid, updates);
          if (!session) throw new McpToolError('session_context', `Session not found: ${sid}`);

          return {
            action: 'update',
            session_id: session.id,
            current_step: session.current_step,
            updated: Object.keys(updates),
            message: 'Context updated. Call action="get" before the next subagent to retrieve full context.',
          };
        }
        case 'list':
          return { action: 'list', count: ctx.sessionContextManager.list().length, sessions: ctx.sessionContextManager.list() };
        case 'resume': {
          if (!sessionId) throw new McpToolError('session_context', 'session_id is required for resume action');
          const session = ctx.sessionContextManager.get(sessionId);
          if (!session) throw new McpToolError('session_context', `Session not found: ${sessionId}`);
          const formatted = ctx.sessionContextManager.formatForSubagent(sessionId);
          return {
            action: 'resume',
            session_id: session.id,
            task: session.task,
            current_step: session.current_step,
            context: formatted,
            message: `Resumed session "${session.id}" at step ${session.current_step}.`,
          };
        }
        case 'delete': {
          if (!sessionId) throw new McpToolError('session_context', 'session_id is required for delete action');
          const deleted = ctx.sessionContextManager.delete(sessionId);
          return { action: 'delete', session_id: sessionId, deleted };
        }
        default:
          throw new McpToolError('session_context', `Unknown action: ${action}. Use: start, get, update, list, resume, delete`);
      }
    },
    {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'get', 'update', 'list', 'resume', 'delete'], description: 'Action to perform' },
        session_id: { type: 'string', description: 'Session ID' },
        task: { type: 'string', description: 'Task description (required for start)' },
        id: { type: 'string', description: 'Custom session ID (optional for start)' },
        decision: { type: 'string', description: 'Architectural or implementation decision to log (for update)' },
        file_change: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            action: { type: 'string', enum: ['created', 'modified', 'deleted'] },
            summary: { type: 'string' },
          },
        },
        pattern: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            example_file: { type: 'string' },
            description: { type: 'string' },
          },
        },
        migration: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'skipped'] },
            notes: { type: 'string' },
          },
        },
        error_resolved: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            resolution: { type: 'string' },
          },
        },
        note: { type: 'string', description: 'Free-form note to add (for update)' },
        advance_step: { type: 'boolean', description: 'Increment the step counter (for update, default false)' },
      },
      required: ['action'],
    },
  );
}

function registerProjectContext(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'project_context',
    'Persistent cross-session knowledge base. Compounds conventions, patterns, decisions, and error resolutions over time. Entries gain confidence with repeated observation and stale entries are pruned automatically.',
    async (args: Record<string, unknown>) => {
      const action = (args.action as string) || 'read';
      const projectCtx = ctx.projectContextManager;

      switch (action) {
        case 'read': {
          const type = args.type as 'convention' | 'pattern' | 'decision' | 'error' | undefined;
          return { action: 'read', type: type || 'all', entries: projectCtx.query(type) };
        }
        case 'observe': {
          const type = args.type as 'convention' | 'pattern' | 'decision' | 'error';
          if (!type) throw new McpToolError('project_context', 'type is required for observe action');
          const data: Record<string, unknown> = {};
          if (args.description) data.description = args.description;
          if (args.category) data.category = args.category;
          if (args.examples) data.examples = args.examples;
          if (args.rationale) data.rationale = args.rationale;
          if (args.error_pattern) data.error_pattern = args.error_pattern;
          if (args.resolution) data.resolution = args.resolution;
          if (args.files) data.files = args.files;
          if (args.name) data.name = args.name;
          projectCtx.observe(type, data);
          await projectCtx.save();
          return { action: 'observe', type, message: 'Entry observed and saved.' };
        }
        case 'format':
          return { action: 'format', content: projectCtx.formatForPrompt() };
        case 'pin': {
          const id = args.id as string;
          if (!id) throw new McpToolError('project_context', 'id is required for pin action');
          const found = projectCtx.pin(id);
          if (found) await projectCtx.save();
          return { action: 'pin', id, found };
        }
        case 'unpin': {
          const id = args.id as string;
          if (!id) throw new McpToolError('project_context', 'id is required for unpin action');
          const found = projectCtx.unpin(id);
          if (found) await projectCtx.save();
          return { action: 'unpin', id, found };
        }
        case 'remove': {
          const id = args.id as string;
          if (!id) throw new McpToolError('project_context', 'id is required for remove action');
          const removed = projectCtx.remove(id);
          if (removed) await projectCtx.save();
          return { action: 'remove', id, removed };
        }
        case 'prune': {
          const count = projectCtx.prune();
          if (count > 0) await projectCtx.save();
          return { action: 'prune', removed: count };
        }
        case 'reset':
          projectCtx.reset();
          await projectCtx.save();
          return { action: 'reset', message: 'All entries cleared. Project metadata preserved.' };
        default:
          throw new McpToolError('project_context', `Unknown action: ${action}. Use: read, observe, format, pin, unpin, remove, prune, reset`);
      }
    },
    {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'observe', 'format', 'pin', 'unpin', 'remove', 'prune', 'reset'] },
        type: { type: 'string', enum: ['convention', 'pattern', 'decision', 'error'] },
        id: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        examples: { type: 'array', items: { type: 'string' } },
        name: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        rationale: { type: 'string' },
        error_pattern: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['action'],
    },
  );
}

function registerReadContext(registrar: McpToolRegistrar): void {
  registrar.registerTool(
    'read_context',
    'Read file contents from the project codebase. Use this when you need additional files beyond what was provided in relevant_files. Pass an array of file paths to read. Returns file contents ready to use as context for code generation.',
    async (args: Record<string, unknown>) => {
      const filePaths = args.files;
      if (!Array.isArray(filePaths) || filePaths.length === 0) {
        return { error: 'Provide a "files" array of file paths to read.' };
      }

      const maxFiles = 20;
      const maxBytesPerFile = 50000;
      const paths = filePaths.filter((f): f is string => typeof f === 'string').slice(0, maxFiles);
      const results: Array<{ path: string; content: string; sizeBytes: number }> = [];
      const errors: Array<{ path: string; error: string }> = [];

      for (const filePath of paths) {
        try {
          const resolved = path.resolve(filePath);
          const cwd = process.cwd();
          if (!resolved.startsWith(cwd)) {
            errors.push({ path: filePath, error: 'Path outside project directory' });
            continue;
          }

          const content = fs.readFileSync(filePath, 'utf-8');
          const sizeBytes = Buffer.byteLength(content, 'utf-8');

          if (sizeBytes > maxBytesPerFile) {
            const truncated = content.slice(0, maxBytesPerFile);
            results.push({ path: filePath, content: truncated + '\n// ... [truncated]', sizeBytes });
          } else {
            results.push({ path: filePath, content, sizeBytes });
          }
        } catch (err) {
          errors.push({ path: filePath, error: (err as Error).message });
        }
      }

      return {
        files: results,
        errors: errors.length > 0 ? errors : undefined,
        total_files: results.length,
        total_bytes: results.reduce((sum, f) => sum + f.sizeBytes, 0),
      };
    },
    {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to read (relative to project root)' },
      },
      required: ['files'],
    },
  );
}
