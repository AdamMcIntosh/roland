/**
 * ## P1 Honesty & Consolidation
 *
 * Human-in-the-loop (HITL) and mission completion tools.
 */

import { PROJECT_CONTEXT_SCHEMA, type McpToolContext, type McpToolRegistrar } from './types.js';

export function registerHitlTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'hitl_status',
    'Human-in-the-loop status: mission blockers, git-commit approval, verification failures, loop escalation, pause/abort. Returns structured report + one-line summary. Use when monitoring Roland team missions or after poll_hitl_events returns new events.',
    async (args: Record<string, unknown>) => {
      const mcpCtx = ctx.resolveToolProjectContext(args);
      const { buildHitlStatusReport, formatHitlStatusMarkdown, formatHitlSummary } =
        await import('../../rco/hitl-events.js');
      const report = buildHitlStatusReport(mcpCtx.stateDir);
      const summary = formatHitlSummary(report);
      if (args.format === 'json') {
        return { ...report, summary, project_root: mcpCtx.projectRoot, state_dir: mcpCtx.stateDir };
      }
      return {
        markdown: formatHitlStatusMarkdown(report),
        summary,
        report,
        project_root: mcpCtx.projectRoot,
        state_dir: mcpCtx.stateDir,
      };
    },
    {
      type: 'object',
      properties: {
        ...PROJECT_CONTEXT_SCHEMA,
        format: { type: 'string', enum: ['markdown', 'json'], description: 'Output shape (default: markdown)' },
      },
      required: [],
    },
  );

  registrar.registerTool(
    'poll_hitl_events',
    'Poll new HITL and mission-complete events since a timestamp (epoch ms). Events append to .roland/hitl-events.jsonl when Roland hits HITL walls or reaches a terminal mission state. Poll during active missions; on mission-complete events call mission_summary and report to the operator.',
    async (args: Record<string, unknown>) => {
      const mcpCtx = ctx.resolveToolProjectContext(args);
      const { pollHitlEvents, buildHitlStatusReport, formatHitlSummary } =
        await import('../../rco/hitl-events.js');
      const since = typeof args.since === 'number' ? args.since : 0;
      const limit = typeof args.limit === 'number' ? args.limit : 50;
      const events = pollHitlEvents(mcpCtx.stateDir, since, limit);
      const report = buildHitlStatusReport(mcpCtx.stateDir);
      return {
        events,
        count: events.length,
        latestTimestamp: events.length > 0 ? events[events.length - 1]!.timestamp : since,
        waitingOnHitl: report.waitingOnHitl,
        summary: formatHitlSummary(report),
        project_root: mcpCtx.projectRoot,
        state_dir: mcpCtx.stateDir,
      };
    },
    {
      type: 'object',
      properties: {
        ...PROJECT_CONTEXT_SCHEMA,
        since: { type: 'number', description: 'Epoch ms — return events newer than this (default 0 = all recent)' },
        limit: { type: 'number', description: 'Max events to return (default 50)' },
      },
      required: [],
    },
  );

  const missionSummaryHandler = async (args: Record<string, unknown>) => {
    const mcpCtx = ctx.resolveToolProjectContext(args);
    const {
      readMissionCompletionReport,
      buildMissionCompletionReport,
      formatMissionCompleteMarkdown,
      formatMissionCompleteSummary,
    } = await import('../../rco/hitl-events.js');
    let report = readMissionCompletionReport(mcpCtx.stateDir);
    if (!report && typeof args.goal === 'string') {
      report = buildMissionCompletionReport(mcpCtx.stateDir, { goal: args.goal });
    }
    if (!report) {
      return {
        found: false,
        summary: 'No mission completion recorded yet.',
        project_root: mcpCtx.projectRoot,
        state_dir: mcpCtx.stateDir,
      };
    }
    const summary = formatMissionCompleteSummary(report);
    if (args.format === 'json') {
      return { found: true, ...report, summary, project_root: mcpCtx.projectRoot, state_dir: mcpCtx.stateDir };
    }
    return {
      found: true,
      markdown: formatMissionCompleteMarkdown(report),
      summary,
      report,
      project_root: mcpCtx.projectRoot,
      state_dir: mcpCtx.stateDir,
    };
  };

  const missionSummarySchema = {
    type: 'object' as const,
    properties: {
      ...PROJECT_CONTEXT_SCHEMA,
      goal: { type: 'string', description: 'Optional goal hint when no completion snapshot exists yet' },
      format: { type: 'string', enum: ['markdown', 'json'], description: 'Output shape (default: markdown)' },
    },
    required: [] as string[],
  };

  registrar.registerTool(
    'mission_summary',
    'Latest Roland mission completion report: goal, final status, success rate, deliverables, blockers, next action. Auto-written when roland team / ClosedLoop reaches a terminal state. Poll via poll_hitl_events (mission-complete kind) or call after mission finishes.',
    missionSummaryHandler,
    missionSummarySchema,
  );

  registrar.registerTool(
    'report_completion',
    'Alias for mission_summary — returns the latest auto-reported mission completion snapshot.',
    missionSummaryHandler,
    missionSummarySchema,
  );
}
