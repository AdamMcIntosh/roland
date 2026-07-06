/**
 * ## Assumptions
 * - [DEPRECATED] Legacy PM Team — Hermes is the recommended PM layer.
 * - ClosedLoop owns verify/critique/reflect/exit — this module is Plan + Act only when explicitly opted in.
 * - Pure ClosedLoop uses lightweight-plan-act.ts instead of this bridge.
 * - Production delegates to `runTeam` with `pmSlice` / `loopEmbedded` flags when legacy PM path is chosen.
 */
import fs from 'fs';
import type { Blackboard } from '../coordination/legacy-blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import { ComplexityClassifier } from '../orchestrator/complexity-classifier.js';
import type { TeamPlan, TeamOrchestratorOptions, TeamTaskResult } from '../rco/team-orchestrator.js';
import type { LoopTemplate, Phase, PhaseConfig, PmTeamMode } from './loop-phases.js';
import { Phase as P } from './loop-phases.js';
import type { PhaseResult } from './phase-handlers/types.js';
import { ModelRouter } from '../models/model-router.js';
import { runLightweightAct, runLightweightPlan } from './lightweight-plan-act.js';
import {
  readLoopPmSession,
  writeLoopPmSession,
  LOOP_PM_SESSION_FILE,
  type LoopPmExecutionPath,
  type LoopPmSession,
} from './loop-pm-session.js';
import { warnLegacyPmTeam } from './pm-deprecation.js';

export {
  LOOP_PM_SESSION_FILE,
  readLoopPmSession,
  writeLoopPmSession,
  type LoopPmExecutionPath,
  type LoopPmSession,
} from './loop-pm-session.js';

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

/** [DEPRECATED] Resolve legacy PM Team mode for a phase from phase config, template defaults, or never. */
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

/** [DEPRECATED] Decide whether to invoke legacy PM Team for this phase (`auto` requires loop-level PM opt-in). */
export function shouldUsePmTeam(
  goal: string,
  mode: PmTeamMode,
  opts: { pmOptIn?: boolean } = {},
): {
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

  if (!opts.pmOptIn) {
    return {
      usePm: false,
      reason: 'auto: PM opt-in required (use_pm_team) — pure ClosedLoop lightweight path',
    };
  }

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

/**
 * [DEPRECATED] Legacy PM Team bridge — bridges ClosedLoop Plan/Act to team-orchestrator when opted in.
 * Prefer Hermes + Pure ClosedLoop (lightweight-plan-act.ts) unless use_pm_team is enabled.
 * @deprecated Use Hermes for PM duties; keep only for backward compatibility.
 */
export class LoopPmBridge {
  private readonly opts: LoopPmBridgeOptions;
  private readonly router: ModelRouter;
  private readonly pmOptIn: boolean;

  constructor(opts: LoopPmBridgeOptions) {
    this.opts = opts;
    this.router = opts.modelRouter ?? ModelRouter.fromConfig();
    this.pmOptIn = true; // bridge only constructed when loop-level PM opt-in is active
    warnLegacyPmTeam('LoopPmBridge constructed');
  }

  private lightweightCtx() {
    return {
      stateDir: this.opts.stateDir,
      goal: this.opts.goal,
      template: this.opts.template,
      blackboard: this.opts.blackboard,
      commandBoard: this.opts.commandBoard,
      modelRouter: this.router,
      cwd:
        process.env.ROLAND_PROJECT_ROOT?.trim() ??
        process.env.ROLAND_ROOT?.trim() ??
        process.cwd(),
      isTestMode: this.opts.isTestMode,
    };
  }

  /** Run Plan phase — optionally invokes Lead PM planning. */
  async runPlanning(iteration: number, phaseConfig?: PhaseConfig): Promise<PhaseResult> {
    const mode = resolvePmTeamMode(P.Plan, phaseConfig, this.opts.template);
    const { usePm, reason } = shouldUsePmTeam(this.opts.goal, mode, { pmOptIn: this.pmOptIn });
    const executionPath: LoopPmExecutionPath = usePm ? 'pm_team' : 'lightweight';

    const planDispatch = this.router.resolveDispatch('pm', { phase: 'plan', log: true });
    console.error(
      `[Loop][PM Team] Plan iteration=${iteration} path=${executionPath} (${reason}) ` +
        `dispatch=${planDispatch.method} model=${planDispatch.displayLabel}`,
    );

    this.opts.commandBoard?.appendBullet(
      'Key Decisions',
      `[Loop Plan] PM Team=${executionPath} — ${reason}`,
    );

    if (usePm) {
      warnLegacyPmTeam('Plan phase', reason);
      return this.runPmPlanning(iteration, reason);
    }
    return runLightweightPlan(iteration, this.lightweightCtx());
  }

  /** Run Act phase — uses PM waves when Plan chose pm_team, else pure ClosedLoop. */
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
      const decision = shouldUsePmTeam(this.opts.goal, mode, { pmOptIn: this.pmOptIn });
      usePm = decision.usePm;
      reason = decision.reason;
    }

    const executionPath: LoopPmExecutionPath = usePm ? 'pm_team' : 'lightweight';
    const actDispatch = this.router.resolveDispatch('coding', { phase: 'act', log: true });
    console.error(
      `[Loop][PM Team] Act iteration=${iteration} path=${executionPath} (${reason}) ` +
        `dispatch=${actDispatch.method} model=${actDispatch.displayLabel}`,
    );

    this.opts.commandBoard?.setAgentStatus({
      callsign: 'Roland',
      state: 'active',
      lastUpdated: Date.now(),
      note: usePm ? `Loop Act — PM Team waves` : 'Loop Act — lightweight',
    });

    if (usePm) {
      warnLegacyPmTeam('Act phase', reason);
      return this.runPmAct(iteration, reason, session ?? undefined);
    }
    return runLightweightAct(iteration, this.lightweightCtx());
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
 * ## Final Decoupling + Model Router Integration Complete
 *
 * Legacy PM Team bridge — only constructed when `isLoopPmTeamEnabled()` is true.
 * Pure ClosedLoop uses `lightweight-plan-act.ts` directly from phase handlers.
 */
