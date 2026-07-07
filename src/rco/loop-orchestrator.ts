/**
 * ## Assumptions
 * - ClosedLoop is the single source of truth for all loop-template missions (Loop Engineering pivot).
 * - Legacy PM team orchestration (`runTeamInner`) remains for missions without `--loop-template`.
 * - ClosedLoop.run() owns EvaluationGate, LoopMemory, Reflection, ExitConditions, SpecialistSpawner, and PR formatting.
 * - TeamResult shape is preserved so team-cli, MCP tools, and dashboard callers need no breaking changes.
 * - LoopEngineCoordinator + inline LoopEngine construction in team-orchestrator is deprecated for loop missions.
 */

import { ClosedLoop, LoopTemplates, readLoopPmSession, resolvePmIntegrationStatus, type ClosedLoopResult } from '../loop-engine/index.js';
import { RoleModelRouter } from '../models/role-model-router.js';
import { Blackboard } from '../coordination/legacy-blackboard.js';
import { CommandBlackboard } from './command-blackboard.js';
import { finalizeSynthesisOutput } from './mission-complete.js';
import {
  buildRunUsage,
  saveRunUsage,
  estimateUsageFromPhaseHistory,
} from './usage-tracker.js';
import {
  createMissionBudgetGuard,
  formatBudgetStatusLine,
  resolveMissionBudget,
} from './mission-budget.js';
import {
  drainMissionUsage,
  startMissionUsageCollector,
} from './mission-usage-collector.js';
import type { TeamOrchestratorOptions, TeamPlan, TeamResult } from './team-types.js';

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

  const runId = opts.runId ?? Date.now().toString(36);
  const runStart = Date.now();

  const template = templates.get(templateName)!;
  const maxIterations = template.maxIterations ?? 1;
  const budgetResolution = resolveMissionBudget({
    cliBudgetUsd: opts.missionBudgetUsd,
    maxIterations,
  });
  const budgetGuard = createMissionBudgetGuard({
    resolution: budgetResolution,
    stateDir,
  });
  if (budgetResolution.ceilingUsd != null) {
    console.error(
      `[Loop] Budget ceiling: $${budgetResolution.ceilingUsd.toFixed(2)} ` +
        `(source=${budgetResolution.source}, est/iter=$${budgetResolution.estimatedPerIterationUsd?.toFixed(2) ?? '?'})`,
    );
  }

  startMissionUsageCollector(stateDir, runId);
  const pmStatus = resolvePmIntegrationStatus(template, { enablePmIntegration: opts.enablePmIntegration });
  const modelRouter = RoleModelRouter.fromConfig();

  console.error('[Loop] ClosedLoop mission — Loop Engineering primary path');

  const blackboard = new Blackboard(stateDir);
  const commandBoard = new CommandBlackboard(stateDir);
  const routingSnapshot = modelRouter.serializeRoutingForState();
  commandBoard.appendBullet('Mission Objectives', `Model routing: ${routingSnapshot.summary}`);
  for (const role of ['pm', 'coding', 'critic', 'verifier'] as const) {
    const m = routingSnapshot.roles[role];
    if (m) {
      commandBoard.appendBullet('Key Decisions', `[RoleModelRouter] ${role} → ${m.displayLabel}`);
    }
  }

  commandBoard.appendBullet('Mission Objectives', `[P2 active] ${goal}`);
  commandBoard.appendBullet(
    'Mission Objectives',
    `Loop template: ${templateName} · ${pmStatus.enabled ? 'PM-Enhanced (Legacy)' : 'Pure ClosedLoop'}`,
  );
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
    cwd:
      process.env.ROLAND_PROJECT_ROOT?.trim() ??
      process.env.ROLAND_ROOT?.trim() ??
      process.cwd(),
    enablePmIntegration: opts.enablePmIntegration,
    budgetGuard,
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

  const result = await closedLoop.run({ hadBlockers: false });
  onSynthesizing?.();

  const pmSession = readLoopPmSession(stateDir);
  const plan: TeamPlan = {
    tasks: pmSession?.plan?.tasks ?? [],
    pmNotes: pmSession?.plan?.pmNotes ??
      `ClosedLoop harness (${templateName}) — PM path: ${pmSession?.executionPath ?? 'lightweight'}; verify/critique/reflect in harness.`,
  };
  onPlanReady?.(plan.tasks);

  const blockersEncountered =
    result.status === 'escalated' || result.status === 'failed' ? 1 : 0;
  const budgetExceeded = Boolean(result.budgetExceeded);
  let synthesis = buildClosedLoopSynthesis(goal, result, stateDir);
  if (budgetExceeded && result.budgetMessage) {
    synthesis += `\n\n## Budget\n\n${result.budgetMessage}\n`;
  }

  const router = RoleModelRouter.fromConfig();
  let taskUsage = drainMissionUsage(stateDir, runId);
  if (taskUsage.length === 0) {
    taskUsage = estimateUsageFromPhaseHistory(
      result.state.phaseHistory,
      (role) => router.getModelForAgent(role).model,
    );
  }
  for (const t of taskUsage) {
    budgetGuard.recordSpending(t.estimatedCostUsd);
  }

  const runUsage = buildRunUsage({
    runId,
    runStart,
    runEnd: Date.now(),
    goal,
    wavesRun: result.iterationsRun,
    blockersEncountered,
    tasks: taskUsage,
  });
  saveRunUsage(stateDir, runUsage);

  synthesis = finalizeSynthesisOutput(synthesis, {
    goal,
    blockersEncountered,
    wavesRun: result.iterationsRun,
    taskCount: plan.tasks.length,
    usage: runUsage,
    budgetExceeded,
    budgetMessage: result.budgetMessage,
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

  const runUsageSaved = runUsage;
  const pmNote = pmSession
    ? ` | PM path=${pmSession.executionPath} waves=${pmSession.wavesRun}`
    : '';
  console.error(
    `[Loop] Usage: ~${runUsageSaved.totalTokens.toLocaleString()} est. tokens` +
      ` | ~$${runUsageSaved.totalCostUsd.toFixed(4)} est. cost` +
      ` | ${formatBudgetStatusLine(budgetGuard)}` +
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
    `- Model routing: ${RoleModelRouter.fromConfig().formatRoutingSummary()}`,
  );

  const pmSession = readLoopPmSession(stateDir);
  if (pmSession) {
    lines.push(
      `- PM path: ${pmSession.executionPath} (${pmSession.routingReason})`,
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
 * ## Old PM Persona Deprecated — Hermes is Primary PM
 *
 * Pure ClosedLoop (Hermes PM + Roland Loop Engine) is default.
 * [DEPRECATED] Legacy PM Team opt-in: loop_engine.use_pm_team or template use_pm_team.
 */
