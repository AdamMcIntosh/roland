/**
 * ## P1 Honesty & Consolidation
 *
 * PM control loop, team management, and Cursor chat tools.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { McpToolError } from '../../utils/errors.js';
import { resolveTeamLoopTemplate } from '../../rco/team-cli.js';
import { spawnBackground } from '../../rco/supervisor.js';
import {
  writeMissionMetaFile,
  prepareMissionStart,
  sanitizeStaleMissionState,
  type MissionTriggeredVia,
} from '../../rco/mission-state.js';
import { renderTimeline, renderUsage } from '../../pm/render.js';
import type { PMEventAction } from '../../pm/event-log.js';
import { PROJECT_CONTEXT_SCHEMA, type McpToolContext, type McpToolRegistrar } from './types.js';

export function registerPmTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registerPmControlTools(registrar, ctx);
  registerChatTools(registrar, ctx);
}

function registerPmControlTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'get_pm_playbook',
    'Fetch the Lead PM playbook (the Engineering-Manager system prompt). Call this once at the start of a session so you operate as the PM: keep the team unblocked, decompose and delegate, review against acceptance criteria.',
    async () => ctx.leadPm.getPlaybook(),
    { type: 'object', properties: {}, required: [] },
  );

  registrar.registerTool(
    'pm_standup',
    'Cursor daily-driver: rendered Markdown standup with blockers first, board state, usage, UNSC mission summary, and your next 3 actions. Call at the start of each chat turn when @roland is active, or after roland_run_team to track progress.',
    async (args: Record<string, unknown>) => {
      const standup = ctx.scopedLeadPm(args).getStandup();
      try {
        const mcpCtx = ctx.resolveToolProjectContext(args);
        const { buildBoardStatusReport, formatConciseUnscSummary } = await import('../../rco/board-report.js');
        const { buildHitlStatusReport, formatHermesHitlSummary } = await import('../../rco/hitl-hermes.js');
        const unsc = formatConciseUnscSummary(buildBoardStatusReport(mcpCtx.stateDir));
        const hitlReport = buildHitlStatusReport(mcpCtx.stateDir);
        const hitlSummary = formatHermesHitlSummary(hitlReport);
        const hitlSection = hitlReport.waitingOnHitl
          ? `\n\n---\n\n### 🎮 HITL — action required\n\n${hitlSummary}\n\nSuggested: \`${hitlReport.suggestedActions[0] ?? 'roland hitl-status'}\``
          : `\n\n---\n\n**HITL:** ${hitlSummary}`;
        return {
          ...standup,
          markdown: `${standup.markdown}\n\n---\n\n${unsc}${hitlSection}`,
          unscSummary: unsc,
          hitlSummary,
          waitingOnHitl: hitlReport.waitingOnHitl,
          project_root: mcpCtx.projectRoot,
          state_dir: mcpCtx.stateDir,
        };
      } catch {
        return standup;
      }
    },
    { type: 'object', properties: { ...PROJECT_CONTEXT_SCHEMA }, required: [] },
  );

  registrar.registerTool(
    'get_team_context',
    'The PM heartbeat. Returns the full team digest: status counts, the blockers/reviews/stalled/ready items that need your attention (blockers first), your inbox, recent decisions, and concrete suggested next actions. Pass format:"markdown" for a rendered standup. Act on needsAttention top-down — unblock before starting new work.',
    async (args: Record<string, unknown>) => {
      const leadPm = ctx.scopedLeadPm(args);
      if (args.format === 'markdown') return leadPm.getStandup();
      return leadPm.getTeamContext();
    },
    {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'markdown'], description: 'Output format. "markdown" returns a rendered standup; default is structured JSON.' },
        ...PROJECT_CONTEXT_SCHEMA,
      },
      required: [],
    },
  );

  registrar.registerTool(
    'list_team',
    'List Roland engineer personas (executor, architect, test-author, etc.) with specialties and recommended models. Use before spawn_task or assign_task.',
    async (args: Record<string, unknown>) => ({ engineers: ctx.scopedLeadPm(args).listTeam() }),
    { type: 'object', properties: { ...PROJECT_CONTEXT_SCHEMA }, required: [] },
  );

  registrar.registerTool(
    'spawn_task',
    'Register a decomposed unit of work as a task on the board (status: open). Returns the task plus a dispatch packet (engineer persona, recommended model, assembled brief, context files) you use to launch the engineer in your IDE.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).spawnTask({
      slug: args.slug as string,
      title: args.title as string,
      description: args.description as string,
      assignee: args.assignee as string | undefined,
      dependsOn: args.dependsOn as string[] | undefined,
      priority: args.priority as never,
      acceptanceCriteria: args.acceptanceCriteria as string | undefined,
    }),
    {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Short stable id for the task, e.g. "login-ui". Becomes key "task:login-ui".' },
        title: { type: 'string', description: 'Human-readable title.' },
        description: { type: 'string', description: 'What the engineer must accomplish.' },
        assignee: { type: 'string', description: 'Optional engineer persona to suggest.' },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task keys that must be done before this can start.' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        acceptanceCriteria: { type: 'string', description: 'Concrete bar the work is reviewed against.' },
        ...PROJECT_CONTEXT_SCHEMA,
      },
      required: ['slug', 'title', 'description'],
    },
  );

  registrar.registerTool(
    'assign_task',
    'Assign a task to an engineer (open/in_progress → in_progress), notify them on the bus, and return a fresh dispatch packet to launch them.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).assignTask({
      taskKey: args.taskKey as string,
      assignee: args.assignee as string,
    }),
    {
      type: 'object',
      properties: {
        taskKey: { type: 'string', description: 'Key of the task, e.g. "task:login-ui".' },
        assignee: { type: 'string', description: 'Engineer persona id (see list_team).' },
        ...PROJECT_CONTEXT_SCHEMA,
      },
      required: ['taskKey', 'assignee'],
    },
  );

  registrar.registerTool(
    'mark_blocked',
    'Flag a task as blocked (in_progress → blocked), recording exactly what is needed and notifying the PM. Engineers call this the moment they are stuck.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).markBlocked({
      taskKey: args.taskKey as string,
      need: args.need as string,
      raisedBy: args.raisedBy as string,
      slug: args.slug as string | undefined,
    }),
    {
      type: 'object',
      properties: {
        taskKey: { type: 'string', description: 'Key of the blocked task.' },
        need: { type: 'string', description: 'Precisely what is needed to proceed.' },
        raisedBy: { type: 'string', description: 'Agent id raising the blocker.' },
        slug: { type: 'string', description: 'Optional human-readable blocker id.' },
      },
      required: ['taskKey', 'need', 'raisedBy'],
    },
  );

  registrar.registerTool(
    'unblock_task',
    'Resolve a blocker with a concrete decision. Records the decision on the board, archives the blocker, returns the task to in_progress once no blockers remain, and notifies the assignee. This is your highest-priority action.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).unblockTask({
      taskKey: args.taskKey as string,
      blockerKey: args.blockerKey as string,
      resolution: args.resolution as string,
    }),
    {
      type: 'object',
      properties: {
        taskKey: { type: 'string', description: 'Key of the blocked task.' },
        blockerKey: { type: 'string', description: 'Key of the blocker to resolve (from get_team_context).' },
        resolution: { type: 'string', description: 'Your concrete decision/answer that unblocks the engineer.' },
      },
      required: ['taskKey', 'blockerKey', 'resolution'],
    },
  );

  registrar.registerTool(
    'complete_task',
    'Submit completed work: attaches an artifact and moves the task to in_review, notifying the PM. Engineers call this when done. Optionally pass model + input_tokens/output_tokens to attribute Cursor usage in the same call (no need to also call report_usage).',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).completeTask({
      taskKey: args.taskKey as string,
      summary: args.summary as string,
      content: args.content as string | undefined,
      author: args.author as string,
      slug: args.slug as string | undefined,
      model: args.model as string | undefined,
      inputTokens: args.input_tokens as number | undefined,
      outputTokens: args.output_tokens as number | undefined,
    }),
    {
      type: 'object',
      properties: {
        taskKey: { type: 'string', description: 'Key of the task being completed.' },
        summary: { type: 'string', description: 'One-line summary of what was delivered.' },
        content: { type: 'string', description: 'Optional artifact body (diff, doc, output).' },
        author: { type: 'string', description: 'Engineer id submitting the work.' },
        slug: { type: 'string', description: 'Optional human-readable artifact id.' },
        model: { type: 'string', description: 'Optional Cursor model used.' },
        input_tokens: { type: 'number', description: 'Optional Cursor input tokens used for this task.' },
        output_tokens: { type: 'number', description: 'Optional Cursor output tokens used for this task.' },
      },
      required: ['taskKey', 'summary', 'author'],
    },
  );

  registrar.registerTool(
    'review_task',
    'Review submitted work against its acceptance criteria. accept → done; reject → back to in_progress with your notes, and the engineer is notified to rework.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).reviewTask({
      taskKey: args.taskKey as string,
      decision: args.decision as 'accept' | 'reject',
      notes: args.notes as string | undefined,
    }),
    {
      type: 'object',
      properties: {
        taskKey: { type: 'string', description: 'Key of the task in review.' },
        decision: { type: 'string', enum: ['accept', 'reject'], description: 'Accept the work or send it back.' },
        notes: { type: 'string', description: 'On reject: the specific gap to fix.' },
      },
      required: ['taskKey', 'decision'],
    },
  );

  registrar.registerTool(
    'synthesize_deliverable',
    'Roll up all completed tasks and their artifacts into a single deliverable summary for the human PM. Call this when nothing is open/in_progress/blocked/in_review.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).synthesizeDeliverable(),
    { type: 'object', properties: { ...PROJECT_CONTEXT_SCHEMA }, required: [] },
  );

  registrar.registerTool(
    'list_team_recipes',
    'List the bundled team recipes (e.g. full-feature-team, bugfix-team, refactor-team) — pre-decomposed task graphs you can drop onto the board in one call with start_team_recipe.',
    async (args: Record<string, unknown>) => ({ recipes: ctx.scopedLeadPm(args).listTeamRecipes() }),
    { type: 'object', properties: { ...PROJECT_CONTEXT_SCHEMA }, required: [] },
  );

  registrar.registerTool(
    'start_team_recipe',
    'Instantiate a team recipe for a goal: seeds the entire task graph on the board (namespaced + dependency-linked) and returns dispatch packets for the tasks ready to start now. Use this to kick off a standard workflow without decomposing by hand.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).startTeamRecipe({
      recipe: args.recipe as string,
      goal: args.goal as string,
      namespace: args.namespace as string | undefined,
    }),
    {
      type: 'object',
      properties: {
        recipe: { type: 'string', description: 'Recipe name (see list_team_recipes), e.g. "full-feature-team".' },
        goal: { type: 'string', description: 'The goal to instantiate the recipe for.' },
        namespace: { type: 'string', description: 'Optional slug prefix for the task keys.' },
      },
      required: ['recipe', 'goal'],
    },
  );

  registrar.registerTool(
    'report_usage',
    'Attribute Cursor token usage to a task and engineer. Records usage for visibility (cost is $0 — Cursor billing is by subscription) and rolls it onto the task. Engineers can instead pass these fields directly to complete_task.',
    async (args: Record<string, unknown>) => ctx.scopedLeadPm(args).recordUsage({
      taskKey: args.taskKey as string,
      engineer: args.engineer as string,
      model: args.model as string,
      inputTokens: args.input_tokens as number,
      outputTokens: args.output_tokens as number,
    }),
    {
      type: 'object',
      properties: {
        taskKey: { type: 'string', description: 'Key of the task the usage belongs to.' },
        engineer: { type: 'string', description: 'Engineer persona id that did the work.' },
        model: { type: 'string', description: 'Cursor model used, e.g. "composer-2.5-standard".' },
        input_tokens: { type: 'number', description: 'Input tokens consumed.' },
        output_tokens: { type: 'number', description: 'Output tokens produced.' },
      },
      required: ['taskKey', 'engineer', 'model', 'input_tokens', 'output_tokens'],
    },
  );

  registrar.registerTool(
    'get_team_usage',
    'Cursor usage attribution across the team: token/request totals broken down by engineer, model, and task. Figures are usage, not dollars (the PM team runs on the Cursor subscription). Pass format:"markdown" for a rendered view.',
    async (args: Record<string, unknown>) => {
      const usage = ctx.scopedLeadPm(args).getTeamUsage();
      if (args.format === 'markdown') return { markdown: renderUsage(usage), usage };
      return usage;
    },
    {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'markdown'], description: 'Output format. "markdown" returns a rendered table; default is structured JSON.' },
      },
      required: [],
    },
  );

  registrar.registerTool(
    'get_pm_events',
    'The PM event timeline: a reverse-chronological audit trail of lifecycle actions (spawn/assign/block/unblock/complete/review/usage/recipe-start) from .roland/pm-events.log. Use this to answer "what happened on this feature?". Pass format:"markdown" for a rendered timeline.',
    async (args: Record<string, unknown>) => {
      const events = ctx.scopedLeadPm(args).getPmEvents(
        (args.limit as number | undefined) ?? 50,
        {
          action: args.action as PMEventAction | undefined,
          taskKey: args.taskKey as string | undefined,
        },
      );
      if (args.format === 'markdown') return { markdown: renderTimeline(events), events };
      return { events };
    },
    {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events to return (newest first). Default 50.' },
        action: { type: 'string', enum: ['spawn', 'assign', 'block', 'unblock', 'complete', 'review', 'usage', 'recipe-start'], description: 'Optional filter by action.' },
        taskKey: { type: 'string', description: 'Optional filter to a single task key.' },
        format: { type: 'string', enum: ['json', 'markdown'], description: '"markdown" returns a rendered timeline; default is structured JSON.' },
      },
      required: [],
    },
  );
}

function registerChatTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'roland_hello',
    'Start-of-session handshake for @roland in Cursor chat. Returns a welcome banner, capabilities table, current board/memory state, and quick-start hints. Call when the user first mentions @roland.',
    async (args: Record<string, unknown>) => {
      const mcpCtx = ctx.resolveToolProjectContext(args);
      const { projectRoot, stateDir } = mcpCtx;

      let memoryStatus = 'No project memory yet — builds automatically after each run.';
      let memoryBulletCount = 0;
      try {
        const mem = fs.readFileSync(path.join(stateDir, 'memory.md'), 'utf-8');
        memoryBulletCount = mem.split('\n').filter(l => l.trim().startsWith('- ')).length;
        if (memoryBulletCount > 0) {
          memoryStatus = `${memoryBulletCount} knowledge entries (Architecture Decisions · Coding Standards · Past Mistakes · Preferences).`;
        }
      } catch { /* no memory yet */ }

      let boardStatus = 'No active tasks.';
      let blockerCount = 0;
      let unscSnippet = '';
      try {
        const { buildBoardStatusReport, formatConciseUnscSummary } = await import('../../rco/board-report.js');
        const report = buildBoardStatusReport(stateDir);
        blockerCount = report.counts.blockers;
        if (report.counts.total > 0) {
          boardStatus = `${report.counts.total} entries · ${report.counts.blockers} blockers · ${report.counts.done} done`;
        }
        unscSnippet = formatConciseUnscSummary(report);
      } catch {
        try {
          const bb = JSON.parse(fs.readFileSync(path.join(stateDir, 'blackboard.json'), 'utf-8'));
          const entries = Array.isArray(bb) ? bb : [];
          if (entries.length > 0) boardStatus = `${entries.length} entries`;
        } catch { /* no board yet */ }
      }

      let bgStatus = '';
      try {
        const pidRec = JSON.parse(fs.readFileSync(path.join(stateDir, 'supervisor.pid'), 'utf-8'));
        const alive = (() => { try { process.kill(pidRec.pid, 0); return true; } catch { return false; } })();
        if (alive) {
          bgStatus = `\n- 🔄 **Background run active** (PID ${pidRec.pid}): "${(pidRec.goal ?? '').slice(0, 60)}"`;
        }
      } catch { /* no bg run */ }

      const blockerWarning = blockerCount > 0
        ? `\n> ⚠️ **${blockerCount} blocker${blockerCount !== 1 ? 's' : ''} need your attention** — call \`pm_standup()\` to see them.\n`
        : '';

      const greeting = `# 👋 Roland is ready

${blockerWarning}
## In Cursor (no Hermes required)

| Mode | Role |
|------|------|
| **@roland in chat** | PM, triage, direct edits — self-contained via MCP |
| **ClosedLoop** | \`roland team "…" --loop-template …\` or \`roland_run_team\` for PACVRE missions |
| **Dashboard** | Monitor active loops only (\`npm run serve-dashboard\`) |

> **Hermes** (\`roland chat\` CLI) is optional for terminal-only workflows — Cursor users do not need it.

## What I can do

| Mode | Use when | How |
|------|----------|-----|
| **Direct in chat** | Single-file edits · Q&A · Quick fixes · < 30 min | I edit files here in Cursor |
| **Team / ClosedLoop** | Features · Refactors · Tests · Multi-file · > 30 min | \`roland_run_team({ goal })\` or \`roland team … --loop-template …\` |
| **Background mode** | Long-running goals while you keep working | \`roland team "goal" --background\` in terminal |

> [DEPRECATED] Legacy in-loop PM Team (\`use_pm_team: true\`) — prefer Pure ClosedLoop (default).

Every request is triaged to **Direct** or **Team** — I show the path and reasoning before acting.

## Current project state
${bgStatus}
- 📚 **Memory:** ${memoryStatus}
- 📋 **Board:** ${boardStatus}

## Quick examples

\`\`\`
# Small task — I handle it directly:
@roland why is the login endpoint returning 401 intermittently?

# Complex goal — I'll spin up the full team:
@roland add complete OAuth2 support with GitHub and Google providers

# Check team status:
@roland what's the current status?

# Launch a recipe workflow:
start_team_recipe({ recipe: "bugfix-team", goal: "fix the memory leak in the WebSocket handler" })
\`\`\`

## Terminal commands

\`\`\`bash
roland "goal"              # full team run
roland bg-status           # background run health
roland status              # live TUI observer
roland doctor              # verify install
npm run serve-dashboard    # usage dashboard → http://127.0.0.1:8081
\`\`\`
${unscSnippet ? `\n---\n\n${unscSnippet}\n` : ''}
What would you like to work on?`;

      return {
        greeting,
        project_state: {
          memory_entries: memoryBulletCount,
          board: boardStatus,
          blockers: blockerCount,
          state_dir: stateDir,
          project_root: projectRoot,
        },
        quick_start: blockerCount > 0
          ? 'Call pm_standup() first — there are open blockers to resolve.'
          : 'Describe your goal and I\'ll triage it, or call pm_standup() to check the board.',
      };
    },
    { type: 'object', properties: { ...PROJECT_CONTEXT_SCHEMA }, required: [] },
  );

  registrar.registerTool(
    'roland_run_team',
    'Launch a background Pure ClosedLoop mission for goals on the **Team** execution path. Default: auto-selects a loop template (e.g. small-fix-loop for typos). Pass `project_root` (or `cwd`) when triggering from Hermes in a repo other than the MCP server cwd. Pass `loop_template` to override auto-selection. Use `legacy_pm: true` only for [DEPRECATED] legacy PM waves. Also use when the operator forces team mode via --force-team. Do NOT use for single-file edits, Q&A, or quick fixes unless force-team was explicitly requested. Returns immediately; track with pm_standup() or get_team_context().',
    async (args: Record<string, unknown>) => {
      const goal = args.goal as string;
      if (!goal || typeof goal !== 'string' || !goal.trim()) {
        throw new McpToolError('roland_run_team', '"goal" is required — describe what you want the team to build or fix');
      }

      const mcpCtx = ctx.resolveToolProjectContext(args);
      const { projectRoot, stateDir: resolvedStateDir } = mcpCtx;

      const legacyPm = args.legacy_pm === true || args.use_pm_team === true;
      const explicitTemplate = typeof args.loop_template === 'string' ? args.loop_template.trim() : '';
      const loopTemplate = resolveTeamLoopTemplate({
        goal: goal.trim(),
        loopTemplate: explicitTemplate || undefined,
        legacyPm,
      }) ?? '';
      const teamArgv = [
        'team', goal.trim(), '--background', '--quiet', '--no-tui', '--clean',
        '--state-dir', resolvedStateDir,
      ];
      if (loopTemplate) teamArgv.push('--loop-template', loopTemplate);
      else if (legacyPm) teamArgv.push('--legacy-pm');

      process.env['ROLAND_TRIGGERED_VIA'] = 'mcp';

      sanitizeStaleMissionState(resolvedStateDir);
      prepareMissionStart(resolvedStateDir, goal.trim(), { projectRoot });

      const { pid, logFile } = await spawnBackground(
        goal.trim(),
        teamArgv,
        resolvedStateDir,
        { quiet: true, projectRoot },
      );
      const truncatedGoal = goal.trim().slice(0, 100) + (goal.trim().length > 100 ? '…' : '');

      writeMissionMetaFile(resolvedStateDir, {
        id: randomUUID(),
        goal: goal.trim(),
        effectiveGoal: goal.trim(),
        status: 'active',
        startedAt: Date.now(),
        pid,
        logFile,
        projectRoot,
        stateDir: resolvedStateDir,
        triggeredVia: 'mcp' satisfies MissionTriggeredVia,
        loopTemplate: loopTemplate || null,
      });

      return {
        started: true,
        goal: truncatedGoal,
        pid,
        log_file: logFile,
        state_dir: resolvedStateDir,
        project_root: projectRoot,
        triggered_via: 'mcp',
        message: `✅ PM team started (PID ${pid}):\n"${truncatedGoal}"`,
        next_steps: [
          `Call pm_standup({ project_root: "${projectRoot}" }) in ~30 seconds to see the task plan once Wave 1 begins`,
          `Call get_team_context({ project_root: "${projectRoot}" }) for the full structured board state`,
          'Run `roland bg-status` in your terminal to check background job health',
          `Logs: ${logFile}`,
        ],
        tip: '[DEPRECATED] Legacy Lead PM is decomposing your goal. Prefer Pure ClosedLoop — call pm_standup() to see the plan and any early blockers.',
      };
    },
    {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'The engineering goal for the PM team. Be specific: include scope, constraints, and what "done" looks like.',
        },
        ...PROJECT_CONTEXT_SCHEMA,
        loop_template: { type: 'string', description: 'Optional loop template override.' },
        legacy_pm: { type: 'boolean', description: '[DEPRECATED] Opt into legacy PM Team waves instead of Pure ClosedLoop.' },
        use_pm_team: { type: 'boolean', description: 'Alias for legacy_pm.' },
      },
      required: ['goal'],
    },
  );
}
