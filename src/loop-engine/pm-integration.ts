/**
 * ## Assumptions
 * - ClosedLoop owns verify/critique/reflect/exit — PM Team is scoped to Plan + Act only.
 * - Plan phase persists a session to `.roland/loop-pm-session.json` for Act to consume.
 * - `auto` routing uses ComplexityClassifier heuristics (no network in tests).
 * - Test mode (`ROLAND_LOOP_TEST_MODE=1` or `isTestMode`) uses synthetic PM plans/waves (no SDK).
 * - Production delegates to `runTeam` with `pmSlice` / `loopEmbedded` flags.
 */

import fs from 'fs';
import path from 'path';
import type { Blackboard } from '../rco/blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import { ComplexityClassifier } from '../orchestrator/complexity-classifier.js';
import type { TeamPlan, TeamOrchestratorOptions, TeamTaskResult } from '../rco/team-orchestrator.js';
import type { LoopTemplate, Phase, PhaseConfig, PmTeamMode } from './loop-phases.js';
import { Phase as P } from './loop-phases.js';
import type { PhaseResult } from './phase-handlers/types.js';
import { ModelRouter } from '../models/model-router.js';

export const LOOP_PM_SESSION_FILE = 'loop-pm-session.json';

export type LoopPmExecutionPath = 'pm_team' | 'lightweight';

export interface LoopPmSession {
  iteration: number;
  templateId: string;
  executionPath: LoopPmExecutionPath;
  routingReason: string;
  plan?: TeamPlan;
  wavesRun: number;
  blockersEncountered: number;
  taskResults: Record<string, TeamTaskResult>;
  updatedAt: number;
}

export interface LoopPmBridgeOptions {
  stateDir: string;
  goal: string;
  template: LoopTemplate;
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  isTestMode?: boolean;
  /** Forwarded to embedded PM Team runs (HITL, callbacks). */
  teamOpts?: Partial<TeamOrchestratorOptions>;
  modelRouter?: ModelRouter;
}

/** Resolve PM Team mode for a phase from phase config, template defaults, or never. */
export function resolvePmTeamMode(
  phase: Phase,
  phaseConfig: PhaseConfig | undefined,
  template: LoopTemplate,
): PmTeamMode {
  if (phaseConfig?.pmTeam) return phaseConfig.pmTeam;
  if (phase === P.Plan && template.pmPlan) return template.pmPlan;
  if (phase === P.Act && template.pmAct) return template.pmAct;
  return 'never';
}

/** Decide whether to invoke PM Team for this phase (`auto` uses complexity heuristics). */
export function shouldUsePmTeam(goal: string, mode: PmTeamMode): {
  usePm: boolean;
  reason: string;
} {
  const envOverride = process.env.ROLAND_LOOP_PM?.trim().toLowerCase();
  if (envOverride === 'always') {
    return { usePm: true, reason: 'ROLAND_LOOP_PM=always override' };
  }
  if (envOverride === 'never') {
    return { usePm: false, reason: 'ROLAND_LOOP_PM=never override' };
  }

  if (mode === 'always') return { usePm: true, reason: 'template pm mode: always' };
  if (mode === 'never') return { usePm: false, reason: 'template pm mode: never' };

  const analysis = ComplexityClassifier.getDetailedAnalysis(goal);
  const complex = analysis.complexity === 'medium' || analysis.complexity === 'complex';
  const multiStep =
    /\b(refactor|architecture|multi-?file|integration|feature|implement|migrate|redesign)\b/i.test(goal) ||
    goal.length > 120;

  if (complex || multiStep) {
    return {
      usePm: true,
      reason: `auto: complexity=${analysis.complexity} score=${analysis.score}${multiStep ? ' multi-step keywords' : ''}`,
    };
  }
  return {
    usePm: false,
    reason: `auto: lightweight goal (complexity=${analysis.complexity} score=${analysis.score})`,
  };
}

export function readLoopPmSession(stateDir: string): LoopPmSession | null {
  const filePath = path.join(stateDir, LOOP_PM_SESSION_FILE);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as LoopPmSession;
  } catch {
    return null;
  }
}

export function writeLoopPmSession(stateDir: string, session: LoopPmSession): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, LOOP_PM_SESSION_FILE),
    JSON.stringify({ ...session, updatedAt: Date.now() }, null, 2),
    'utf-8',
  );
}

/**
 * Bridges ClosedLoop Plan/Act phases to the PM Team Engine or lightweight stubs.
 */
export class LoopPmBridge {
  private readonly opts: LoopPmBridgeOptions;
  private readonly router: ModelRouter;

  constructor(opts: LoopPmBridgeOptions) {
    this.opts = opts;
    this.router = opts.modelRouter ?? ModelRouter.fromConfig();
  }

  /** Run Plan phase — optionally invokes Lead PM planning. */
  async runPlanning(iteration: number, phaseConfig?: PhaseConfig): Promise<PhaseResult> {
    const mode = resolvePmTeamMode(P.Plan, phaseConfig, this.opts.template);
    const { usePm, reason } = shouldUsePmTeam(this.opts.goal, mode);
    const executionPath: LoopPmExecutionPath = usePm ? 'pm_team' : 'lightweight';

    console.error(
      `[Loop][PM Team] Plan iteration=${iteration} path=${executionPath} (${reason}) ` +
        `model=${this.router.getModel('pm').displayLabel}`,
    );

    this.opts.commandBoard?.appendBullet(
      'Key Decisions',
      `[Loop Plan] PM Team=${executionPath} — ${reason}`,
    );

    if (usePm) {
      return this.runPmPlanning(iteration, reason);
    }
    return this.runLightweightPlan(iteration);
  }

  /** Run Act phase — uses PM waves when Plan chose pm_team, else lightweight stub. */
  async runAct(iteration: number, phaseConfig?: PhaseConfig): Promise<PhaseResult> {
    const session = readLoopPmSession(this.opts.stateDir);
    const priorPath = session?.iteration === iteration ? session.executionPath : undefined;

    let usePm: boolean;
    let reason: string;

    if (priorPath === 'pm_team') {
      usePm = true;
      reason = 'Act follows PM plan from Plan phase';
    } else if (priorPath === 'lightweight') {
      usePm = false;
      reason = 'Act follows lightweight Plan phase';
    } else {
      const mode = resolvePmTeamMode(P.Act, phaseConfig, this.opts.template);
      const decision = shouldUsePmTeam(this.opts.goal, mode);
      usePm = decision.usePm;
      reason = decision.reason;
    }

    const executionPath: LoopPmExecutionPath = usePm ? 'pm_team' : 'lightweight';
    console.error(
      `[Loop][PM Team] Act iteration=${iteration} path=${executionPath} (${reason}) ` +
        `model=${this.router.getModel('coding').displayLabel}`,
    );

    this.opts.commandBoard?.setAgentStatus({
      callsign: 'Roland',
      state: 'active',
      lastUpdated: Date.now(),
      note: usePm ? `Loop Act — PM Team waves` : 'Loop Act — lightweight',
    });

    if (usePm) {
      return this.runPmAct(iteration, reason, session ?? undefined);
    }
    return this.runLightweightAct(iteration);
  }

  private async runLightweightPlan(iteration: number): Promise<PhaseResult> {
    const { blackboard, commandBoard, goal, stateDir, template } = this.opts;

    writeLoopPmSession(stateDir, {
      iteration,
      templateId: template.name,
      executionPath: 'lightweight',
      routingReason: 'lightweight plan stub',
      wavesRun: 0,
      blockersEncountered: 0,
      taskResults: {},
      updatedAt: Date.now(),
    });

    blackboard.post({
      type: 'decision',
      title: 'Loop: Plan phase (lightweight)',
      content: `Planning loop iteration ${iteration} for goal: ${goal.slice(0, 200)}`,
      status: 'done',
      author: 'loop-engine',
      priority: 'medium',
      tags: ['loop', 'plan', 'lightweight'],
      relatedIds: [],
    });
    commandBoard?.appendBullet(
      'Key Decisions',
      `Loop plan (iteration ${iteration}): lightweight scope — no PM decomposition`,
    );

    return {
      success: true,
      summary: 'Planning complete (lightweight — no PM Team)',
    };
  }

  private async runLightweightAct(iteration: number): Promise<PhaseResult> {
    const { blackboard, commandBoard } = this.opts;

    blackboard.post({
      type: 'decision',
      title: 'Loop: Act phase (lightweight)',
      content: `Lightweight execution for iteration ${iteration}`,
      status: 'in_progress',
      author: 'loop-engine',
      priority: 'medium',
      tags: ['loop', 'act', 'lightweight'],
      relatedIds: [],
    });

    return {
      success: true,
      summary: 'Act phase complete (lightweight — no PM waves)',
    };
  }

  private async runPmPlanning(iteration: number, routingReason: string): Promise<PhaseResult> {
    const { stateDir, goal, template, blackboard, commandBoard, isTestMode, teamOpts } = this.opts;

    let plan: TeamPlan;
    if (isTestMode || process.env.ROLAND_LOOP_TEST_MODE === '1') {
      plan = buildStubPlan(goal, iteration);
      console.error(
        `[Loop][PM Team] Plan stub (test mode) — ${plan.tasks.length} task(s)`,
      );
    } else {
      const { runTeam } = await import('../rco/team-orchestrator.js');
      const contextualGoal = `[ClosedLoop Plan iter ${iteration}] ${goal}`;
      const result = await runTeam({
        goal: contextualGoal,
        stateDir,
        pmSlice: 'plan-only',
        loopEmbedded: true,
        loopIteration: iteration,
        noImprove: true,
        quiet: true,
        ...teamOpts,
      });
      plan = result.plan;
    }

    writeLoopPmSession(stateDir, {
      iteration,
      templateId: template.name,
      executionPath: 'pm_team',
      routingReason,
      plan,
      wavesRun: 0,
      blockersEncountered: 0,
      taskResults: {},
      updatedAt: Date.now(),
    });

    blackboard.post({
      type: 'decision',
      title: `Loop: Plan phase (PM Team) — ${plan.tasks.length} task(s)`,
      content: plan.pmNotes ?? `Lead PM decomposed iteration ${iteration} into ${plan.tasks.length} task(s).`,
      status: 'done',
      author: 'Lead-PM',
      priority: 'high',
      tags: ['loop', 'plan', 'pm-team'],
      relatedIds: [],
    });
    commandBoard?.appendBullet(
      'Key Decisions',
      `[PM Team Plan] iter ${iteration}: ${plan.tasks.length} task(s) — ${routingReason}`,
    );
    for (const task of plan.tasks) {
      commandBoard?.appendBullet('Active Tasks', `[loop-pending] ${task.id}: ${task.title}`);
    }

    return {
      success: true,
      summary: `PM Team planning complete — ${plan.tasks.length} task(s) (${routingReason})`,
    };
  }

  private async runPmAct(
    iteration: number,
    routingReason: string,
    priorSession?: LoopPmSession,
  ): Promise<PhaseResult> {
    const { stateDir, goal, template, blackboard, commandBoard, isTestMode, teamOpts } = this.opts;

    const session = priorSession ?? readLoopPmSession(stateDir);
    const plan = session?.plan ?? buildStubPlan(goal, iteration);

    let wavesRun = 0;
    let blockersEncountered = 0;
    let taskResults: Record<string, TeamTaskResult> = {};

    if (isTestMode || process.env.ROLAND_LOOP_TEST_MODE === '1') {
      wavesRun = Math.max(1, Math.ceil(plan.tasks.length / 2));
      taskResults = Object.fromEntries(
        plan.tasks.map((t) => [
          t.id,
          {
            taskTitle: t.title,
            agent: t.agent,
            output: `[test stub] Completed ${t.title}`,
            hadBlocker: false,
          },
        ]),
      );
      console.error(
        `[Loop][PM Team] Act stub (test mode) — ${wavesRun} wave(s), ${plan.tasks.length} task(s)`,
      );
    } else {
      const { runTeam } = await import('../rco/team-orchestrator.js');
      const contextualGoal = `[ClosedLoop Act iter ${iteration}] ${goal}`;
      const result = await runTeam({
        goal: contextualGoal,
        stateDir,
        pmSlice: 'waves-only',
        existingPlan: plan,
        loopEmbedded: true,
        loopIteration: iteration,
        noImprove: true,
        quiet: true,
        ...teamOpts,
      });
      wavesRun = result.wavesRun;
      blockersEncountered = result.blockersEncountered;
      taskResults = result.taskResults;
    }

    writeLoopPmSession(stateDir, {
      iteration,
      templateId: template.name,
      executionPath: 'pm_team',
      routingReason,
      plan,
      wavesRun,
      blockersEncountered,
      taskResults,
      updatedAt: Date.now(),
    });

    const hadBlockers = blockersEncountered > 0 ||
      Object.values(taskResults).some((r) => r.hadBlocker);

    blackboard.post({
      type: 'result',
      title: `Loop: Act phase (PM Team) — ${wavesRun} wave(s)`,
      content: hadBlockers
        ? `PM Team act completed with ${blockersEncountered} blocker(s) across ${wavesRun} wave(s).`
        : `PM Team act completed — ${Object.keys(taskResults).length} task(s) in ${wavesRun} wave(s).`,
      status: hadBlockers ? 'pending' : 'done',
      author: 'loop-engine',
      priority: hadBlockers ? 'high' : 'medium',
      tags: ['loop', 'act', 'pm-team'],
      relatedIds: [],
    });

    commandBoard?.appendBullet(
      'Active Tasks',
      `[PM Team Act] iter ${iteration}: ${wavesRun} wave(s), ${Object.keys(taskResults).length} task(s)${hadBlockers ? ' — blockers' : ''}`,
    );

    return {
      success: !hadBlockers,
      summary: `PM Team act — ${wavesRun} wave(s), ${Object.keys(taskResults).length} task(s) (${routingReason})`,
      shouldRetry: hadBlockers,
    };
  }
}

function buildStubPlan(goal: string, iteration: number): TeamPlan {
  return {
    tasks: [
      {
        id: `loop-${iteration}-task-1`,
        title: goal.slice(0, 60),
        agent: 'executor',
        description: goal,
        dependsOn: [],
        priority: 'high',
      },
      {
        id: `loop-${iteration}-task-2`,
        title: 'Write and run tests',
        agent: 'test-author',
        description: `Author tests for: ${goal.slice(0, 100)}`,
        dependsOn: [`loop-${iteration}-task-1`],
        priority: 'medium',
      },
    ],
    pmNotes: `Stub PM plan for loop iteration ${iteration} (test mode).`,
  };
}

/**
 * ## PM Integration into ClosedLoop Complete
 *
 * Usage from ClosedLoop:
 * ```typescript
 * const pmBridge = new LoopPmBridge({ stateDir, goal, template, blackboard, commandBoard, isTestMode });
 * handlers.set(P.Plan, new PlanPhaseHandler({ pmBridge }));
 * handlers.set(P.Act, new ActPhaseHandler({ pmBridge }));
 * ```
 */
