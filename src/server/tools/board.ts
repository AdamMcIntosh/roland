/**
 * ## P1 Honesty & Consolidation
 *
 * Board status reporting tools.
 */

import { PROJECT_CONTEXT_SCHEMA, type McpToolContext, type McpToolRegistrar } from './types.js';

export function registerBoardTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'board_status',
    'Concise UNSC mission status from .roland/blackboard.json and command-blackboard.md. Use after team runs or at end of major tasks. Blockers listed first. Pass format:"json" for structured output, format:"verbose" for full report.',
    async (args: Record<string, unknown>) => {
      const mcpCtx = ctx.resolveToolProjectContext(args);
      const { buildBoardStatusReport, formatConciseUnscSummary, formatBoardStatusReport } =
        await import('../../rco/board-report.js');
      const report = buildBoardStatusReport(mcpCtx.stateDir, typeof args.goal === 'string' ? args.goal : undefined);
      const concise = formatConciseUnscSummary(report);
      if (args.format === 'json') {
        return { ...report, concise, project_root: mcpCtx.projectRoot, state_dir: mcpCtx.stateDir };
      }
      if (args.format === 'verbose') {
        return { markdown: formatBoardStatusReport(report), report, concise, project_root: mcpCtx.projectRoot, state_dir: mcpCtx.stateDir };
      }
      return { markdown: concise, report, concise, project_root: mcpCtx.projectRoot, state_dir: mcpCtx.stateDir };
    },
    {
      type: 'object',
      properties: {
        ...PROJECT_CONTEXT_SCHEMA,
        goal: { type: 'string', description: 'Optional goal hint for smart command-board recall' },
        format: { type: 'string', enum: ['markdown', 'json', 'verbose'], description: 'Output shape (default: markdown concise summary)' },
      },
      required: [],
    },
  );
}
