/**
 * ## Assumptions
 * - ClosedLoop is the single source of truth for all loop-template missions (Loop Engineering pivot).
 * - Legacy PM team orchestration (`runTeamInner`) remains for missions without `--loop-template`.
 * - ClosedLoop.run() owns EvaluationGate, LoopMemory, Reflection, ExitConditions, SpecialistSpawner, and PR formatting.
 * - TeamResult shape is preserved so team-cli, MCP tools, and dashboard callers need no breaking changes.
 * - LoopEngineCoordinator + inline LoopEngine construction in team-orchestrator is deprecated for loop missions.
 */

import { ClosedLoop, LoopTemplates, readLoopPmSession, type ClosedLoopResult } from '../loop-engine/index.js';
import { ModelRouter } from '../models/model-router.js';
import { Blackboard } from './blackboard.js';
import { CommandBlackboard } from './command-blackboard.js';
import { finalizeSynthesisOutput } from './mission-complete.js';
import { buildRunUsage, saveRunUsage } from './usage-tracker.js';
import type { TeamOrchestratorOptions, TeamPlan, TeamResult } from './team-orchestrator.js';

/** True when a loop template id was supplied (CLI `--loop-template`, MCP `loop_template`, etc.). */
export function hasLoopTemplate(loopTemplate?: string): boolean {
  return typeof loopTemplate === 'string' && loopTemplate.trim().length > 0;
}

export interface ClosedLoopMissionOptions extends TeamOrchestratorOptions {}

/**
 * Run a loop-template mission through ClosedLoop — the primary Loop Engineering execution path.
 *
 * Routing (team-orchestrator):
 * ```typescript
 * if (hasLoopTemplate(loopTemplate)) {
 *   return runClosedLoopMission(opts);
 * }
 * // else legacy PM team mode
 * ```
 */
export async function runClosedLoopMission(opts: ClosedLoopMissionOptions): Promise<TeamResult> {
  const {
    goal,
    stateDir = '.roland',
    loopTemplate,
    onLoopStateChange,
    onPlanReady,
    onSynthesizing,
    loopRunner,
  } = opts;

  if (!hasLoopTemplate(loopTemplate)) {
    throw new Error('runClosedLoopMission requires a loop template id');
  }

  const templateName = loopTemplate!.trim();
  const templates = new LoopTemplates();
  if (!templates.get(templateName)) {
    throw new Error(`ClosedLoop: unknown loop template "${templateName}"`);
  }

  const runId = Date.now().toString(36);
  const runStart = Date.now();

  const modelRouter = ModelRouter.fromConfig();
  const validation = ModelRouter.validateOnStartup(modelRouter);
  if (!validation.ok) {
    console.error(
      `[ModelRouter] Missing required loop roles: ${validation.missing.join(', ')}. ` +
        'Add models.<role> to config.yaml (pm, coding, critic, verifier) or set ROLAND_MODEL_<ROLE>.',
    );
  }
  for (const w of validation.warnings.slice(0, 2)) {
    console.error(`[ModelRouter] Note: ${w}`);
  }
  modelRouter.logStartupBanner(templateName);

  console.error('[Loop] ClosedLoop mission — Loop Engineering primary path');
  console.error('[Loop] PM Team Engine wired into Plan/Act when template pm_plan/pm_act is auto|always');
  console.error('[Loop] Verify/Critique/Reflect/ExitConditions remain in ClosedLoop harness');

  const blackboard = new Blackboard(stateDir);
  const commandBoard = new CommandBlackboard(stateDir);
  const routingSnapshot = modelRouter.serializeRoutingForState();
  commandBoard.appendBullet('Mission Objectives', `Model routing: ${routingSnapshot.summary}`);
  for (const role of ['pm', 'coding', 'critic', 'verifier'] as const) {
    const m = routingSnapshot.roles[role];
    if (m) {
      commandBoard.appendBullet('Key Decisions', `[ModelRouter] ${role} → ${m.displayLabel}`);
    }
  }

  const { cleanupBoardsForNewMission, formatCleanupReport } = await import('./board-cleanup.js');
  const cleanupResult = cleanupBoardsForNewMission(stateDir, goal);
  if (
    cleanupResult.blackboardArchived > 0 ||
    cleanupResult.commandBoard.activeTasksRemoved.length > 0 ||
    cleanupResult.commandBoard.objectivesArchived.length > 0
  ) {
    console.error('[Loop] Board hygiene — prior mission state archived:');
    for (const line of formatCleanupReport(cleanupResult).split('\n').slice(1)) {
      if (line.trim()) console.error(`[Loop]   ${line}`);
    }
  }

  commandBoard.appendBullet('Mission Objectives', `[P2 active] ${goal}`);
  commandBoard.appendBullet('Mission Objectives', `Loop template: ${templateName} (ClosedLoop + PM Plan/Act)`);
  commandBoard.setAgentStatus({
    callsign: 'Roland',
    state: 'active',
    lastUpdated: Date.now(),
    note: `ClosedLoop — ${templateName}`,
  });

  blackboard.post({
    type: 'task',
    title: 'TEAM GOAL',
    content: goal,
    status: 'in_progress',
    author: 'system',
    priority: 'critical',
    tags: ['goal', 'closed-loop'],
    relatedIds: [],
  });

  const isTestMode = process.env.ROLAND_LOOP_TEST_MODE === '1';

  const closedLoop = new ClosedLoop({
    stateDir,
    goal,
    template: templateName,
    blackboard,
    commandBoard,
    runId,
    recoverOnStart: true,
    isTestMode,
    skipBackoff: isTestMode,
    runner: loopRunner,
    hooks: { onStateChange: onLoopStateChange },
    teamOpts: {
      hitlQueue: opts.hitlQueue,
      onWaveStart: opts.onWaveStart,
      onTaskStart: opts.onTaskStart,
      onTaskComplete: opts.onTaskComplete,
      onWaveComplete: opts.onWaveComplete,
      onBlockerDetected: opts.onBlockerDetected,
      sequential: opts.sequential,
      quiet: opts.quiet,
    },
  });

  onSynthesizing?.();
  const result = await closedLoop.run({ hadBlockers: false });

  const pmSession = readLoopPmSession(stateDir);
  const plan: TeamPlan = {
    tasks: pmSession?.plan?.tasks ?? [],
    pmNotes: pmSession?.plan?.pmNotes ??
      `ClosedLoop harness (${templateName}) — PM path: ${pmSession?.executionPath ?? 'lightweight'}; verify/critique/reflect in harness.`,
  };
  onPlanReady?.(plan.tasks);

  const blockersEncountered = result.status === 'escalated' || result.status === 'failed' ? 1 : 0;
  let synthesis = buildClosedLoopSynthesis(goal, result, stateDir);
  synthesis = finalizeSynthesisOutput(synthesis, {
    goal,
    blockersEncountered,
    wavesRun: result.iterationsRun,
    taskCount: plan.tasks.length,
  });

  commandBoard.setAgentStatus({
    callsign: 'Roland',
    state: 'complete',
    lastUpdated: Date.now(),
    note: `ClosedLoop ${result.status}`,
  });
  commandBoard.appendBullet('Mission Objectives', `[complete] ${goal.slice(0, 120)}`);

  const goalEntry = blackboard.read({ type: 'task', status: 'in_progress' }).find((e) => e.tags.includes('goal'));
  if (goalEntry) blackboard.patch(goalEntry.id, { status: 'done' });

  const runUsage = buildRunUsage({
    runId,
    runStart,
    runEnd: Date.now(),
    goal,
    wavesRun: result.iterationsRun,
    blockersEncountered,
    tasks: [],
  });
  saveRunUsage(stateDir, runUsage);
  const pmNote = pmSession
    ? ` | PM path=${pmSession.executionPath} waves=${pmSession.wavesRun}`
    : '';
  console.error(
    `[Loop] Usage: ~${runUsage.totalTokens.toLocaleString()} est. tokens` +
      ` | ~$${runUsage.totalCostUsd.toFixed(4)} est. cost` +
      ` | ClosedLoop harness${pmNote}` +
      ` | saved to ${stateDir}/usage-history.json`,
  );

  console.error(
    `[Loop] Mission complete status=${result.status} iterations=${result.iterationsRun} ` +
      `spawns=${result.spawnCount} loopId=${result.loopId}`,
  );

  return {
    goal,
    plan,
    taskResults: {},
    synthesis,
    wavesRun: result.iterationsRun,
    blockersEncountered,
  };
}

function buildClosedLoopSynthesis(goal: string, result: ClosedLoopResult, stateDir: string): string {
  const lines = [
    '# Roland — Closed-Loop Mission Complete',
    '',
    `**Goal:** ${goal}`,
    '',
    `**Template:** ${result.state.templateId}`,
    `**Status:** ${result.status}`,
    `**Iterations:** ${result.iterationsRun}`,
    `**Retries:** ${result.state.retryCount}`,
    `**Loop ID:** ${result.loopId}`,
    '',
  ];

  if (result.formattedPr) {
    lines.push('## PR Draft', '', `**Title:** ${result.formattedPr.title}`, '', result.formattedPr.body, '');
  }

  if (result.state.lastExitEvaluation) {
    lines.push('## Exit Conditions', '', result.state.lastExitEvaluation.reason, '');
  }

  if (result.state.lastVerification) {
    lines.push(
      '## Verification',
      '',
      result.state.lastVerification.summary,
      result.state.lastVerification.confidence !== undefined
        ? `Confidence: ${result.state.lastVerification.confidence}`
        : '',
      '',
    );
  }

  lines.push(
    '## Loop Engineering',
    '',
    `- Specialist spawn intents: ${result.spawnCount}`,
    `- Phases completed: ${result.phasesCompleted}`,
    `- Loop directory: ${result.loopDir}`,
    `- Model routing: ${ModelRouter.fromConfig().formatRoutingSummary()}`,
  );

  const pmSession = readLoopPmSession(stateDir);
  if (pmSession) {
    lines.push(
      `- PM Team path: ${pmSession.executionPath} (${pmSession.routingReason})`,
      `- PM waves in Act: ${pmSession.wavesRun}`,
      `- PM blockers: ${pmSession.blockersEncountered}`,
    );
  }
  lines.push(
    '',
    '## Next Steps',
    '',
    '1. Review the PR draft above (also saved under `.roland/closed-loop-pr.json`).',
    '2. Inspect loop memory and reflections under `.roland/loops/`.',
    '3. Run `roland board-status --concise` for battlespace summary.',
    '',
  );

  return lines.join('\n');
}

/**
 * ## Final Legacy Cleanup + Model Router Integration Complete
 *
 * Loop-template missions route here from `runTeam()` / `runTeamInner()` before the legacy PM wave engine.
 * ClosedLoop owns the full lifecycle; ModelRouter startup banner prints at mission start.
 * Non-loop missions continue through legacy PM planning → wave → synthesis (TODO: deprecation).
 */
