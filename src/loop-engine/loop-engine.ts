/**
 * LoopEngine — runs loop phases sequentially with hooks and persistence.
 *
 * Modes:
 *   1. `runFullLoop()` — full Plan → Act → Verify → Critique → Retry orchestration with
 *      configurable max iterations, timeout, resume, and exponential backoff.
 *   2. `run()` — alias for `runFullLoop()` (backward compatible).
 *   3. Coordinator-driven — team-orchestrator calls lifecycle hooks per wave.
 */

import type { Blackboard } from '../coordination/legacy-blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { LoopTemplate, Phase, PhaseConfig } from './loop-phases.js';
import { Phase as P } from './loop-phases.js';
import {
  LoopStateStore,
  createInitialLoopState,
  type LoopState,
  type LoopRunStatus,
  type LoopLiveActivity,
  type LoopSpawnPulse,
} from './loop-state.js';
import {
  createDefaultHandlers,
  RetryPhaseHandler,
  ReflectionPhaseHandler,
  type PhaseHandler,
  type PhaseResult,
} from './phase-handlers/index.js';
import { loadLoopEngineConfig, resolveCritiqueThresholds, resolveBetweenIterations } from './loop-config.js';
import { resolveBetweenIterationsHook } from './loop-template-resolution.js';
import { LoopObservability } from './loop-observability.js';
import { saveLoopCheckpoint, tryRecoverLoopState } from './loop-checkpoint.js';
import type { LoopMemory } from './loop-memory.js';
import { runBetweenIterations } from './between-iterations.js';
import { evaluateExitConditions } from './exit-conditions.js';
import type { CommandRunner } from './verification/index.js';
import type { EvaluationGateResult } from './evaluation-gate.js';
import type { MissionBudgetGuard } from '../rco/mission-budget.js';

export interface LoopHooks {
  onPhaseStart?: (phase: Phase, iteration: number) => void;
  onPhaseComplete?: (phase: Phase, result: PhaseResult) => void;
  onLoopIterationStart?: (iteration: number) => void;
  onBetweenIterations?: (iteration: number, command: string, success: boolean) => void;
  onReflection?: (iteration: number, content: string) => void;
  onExitConditionEvaluated?: (iteration: number, shouldExit: boolean, reason: string) => void;
  onLoopComplete?: (state: LoopState, status: LoopRunStatus) => void;
  onStateChange?: (state: LoopState) => void;
}

export interface LoopEngineOptions {
  stateDir: string;
  template: LoopTemplate;
  goal: string;
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  handlers?: Map<Phase, PhaseHandler>;
  hooks?: LoopHooks;
  /** Elevated retry/escalation thresholds for E2E and dev (also ROLAND_LOOP_TEST_MODE=1). */
  isTestMode?: boolean;
  /** When true, attempt checkpoint / loop-state recovery on construction. */
  recoverOnStart?: boolean;
  /** Resume from existing loop-state.json when status is running and goal/template match. */
  resumeFromState?: boolean;
  /** Wall-clock timeout for the full loop (ms). Template/config override. */
  timeoutMs?: number;
  /** Skip exponential backoff delays (tests). */
  skipBackoff?: boolean;
  /** Persistent loop memory layer (closed-loop harness). */
  loopMemory?: LoopMemory;
  /** Shell command runner for between-iterations checks. */
  runner?: CommandRunner;
  cwd?: string;
  /** Dashboard live panel context (dispatch + execution mode). */
  liveContext?: {
    dispatchMethod?: string;
    executionMode?: string;
  };
  /** Mission cost ceiling — stops loop gracefully before exceeding limit. */
  budgetGuard?: MissionBudgetGuard;
  runId?: string;
}

export interface LoopRunResult {
  status: LoopRunStatus;
  state: LoopState;
  phasesCompleted: number;
  iterationsRun: number;
  timedOut?: boolean;
  budgetExceeded?: boolean;
  budgetMessage?: string;
}

export class LoopEngine {
  private readonly store: LoopStateStore;
  private readonly handlers: Map<Phase, PhaseHandler>;
  private readonly hooks: LoopHooks;
  private readonly template: LoopTemplate;
  private readonly goal: string;
  private readonly blackboard: Blackboard;
  private readonly commandBoard?: CommandBlackboard;
  private readonly critiqueThresholds: ReturnType<typeof resolveCritiqueThresholds>;
  private readonly observability: LoopObservability;
  private readonly stateDir: string;
  private readonly timeoutMs: number;
  private readonly loopStartedAt: number;
  private readonly loopMemory?: LoopMemory;
  private readonly budgetGuard?: MissionBudgetGuard;
  private readonly runId?: string;
  private readonly runner?: CommandRunner;
  private readonly cwd: string;
  private readonly liveContext?: LoopEngineOptions['liveContext'];
  private readonly isTestMode: boolean;
  private lastEvaluation?: EvaluationGateResult;

  constructor(opts: LoopEngineOptions) {
    const firstPhase = opts.template.phases[0]?.phase ?? P.Plan;
    const cfg = loadLoopEngineConfig();
    this.template = opts.template;
    this.goal = opts.goal;
    this.blackboard = opts.blackboard;
    this.commandBoard = opts.commandBoard;
    this.handlers = opts.handlers ?? createDefaultHandlers();
    if (opts.skipBackoff && !opts.handlers) {
      this.handlers.set(P.Retry, new RetryPhaseHandler({ skipDelay: true }));
    }
    if (opts.loopMemory && !opts.handlers) {
      this.handlers.set(
        P.Reflect,
        new ReflectionPhaseHandler({ memory: opts.loopMemory }),
      );
    }
    this.hooks = opts.hooks ?? {};
    this.stateDir = opts.stateDir;
    this.loopMemory = opts.loopMemory;
    this.runner = opts.runner;
    this.cwd = opts.cwd ?? process.cwd();
    this.liveContext = opts.liveContext;
    this.isTestMode = Boolean(opts.isTestMode || process.env.ROLAND_LOOP_TEST_MODE === '1');
    this.observability = new LoopObservability(opts.stateDir, opts.blackboard);
    this.critiqueThresholds = resolveCritiqueThresholds(opts.template, {
      isTestMode: opts.isTestMode,
    });
    this.timeoutMs =
      opts.timeoutMs ??
      opts.template.timeoutMs ??
      cfg.timeoutMs ??
      1_800_000;
    this.loopStartedAt = Date.now();
    this.budgetGuard = opts.budgetGuard;
    this.runId = opts.runId;

    if (opts.recoverOnStart !== false) {
      const recovery = tryRecoverLoopState(opts.stateDir);
      if (recovery.recovered && recovery.state) {
        this.store = new LoopStateStore(opts.stateDir, recovery.state, { skipInitialFlush: true });
        this.commandBoard?.appendBullet(
          'Key Decisions',
          `[LOOP] Recovered from ${recovery.source} at phase ${recovery.phase} (iter ${recovery.state.iteration})`,
        );
      } else {
        this.store = LoopStateStore.loadOrCreate(
          opts.stateDir,
          opts.template.name,
          opts.goal,
          firstPhase,
          Boolean(opts.resumeFromState),
        );
      }
    } else {
      this.store = LoopStateStore.loadOrCreate(
        opts.stateDir,
        opts.template.name,
        opts.goal,
        firstPhase,
        false,
      );
    }

    console.error(
      `[Loop][engine] template="${opts.template.name}" maxIterations=${opts.template.maxIterations ?? 1} ` +
        `maxRetries=${this.critiqueThresholds.maxRetries} timeoutMs=${this.timeoutMs} ` +
        `resume=${Boolean(opts.resumeFromState)} recover=${opts.recoverOnStart !== false} ` +
        `betweenIter=${Boolean(resolveBetweenIterations(opts.template))} reflection=${Boolean(opts.template.reflection)}`,
    );
    if (opts.loopMemory) {
      this.store.setLoopId(opts.loopMemory.loopId);
    }
    if (opts.template.kickoff) {
      this.commandBoard?.appendBullet('Mission Objectives', `[KICKOFF] ${opts.template.kickoff}`);
      this.blackboard.post({
        type: 'decision',
        title: 'Loop kickoff',
        content: opts.template.kickoff,
        status: 'done',
        author: 'loop-engine',
        priority: 'medium',
        tags: ['loop', 'kickoff'],
        relatedIds: [],
      });
    }
    this.emitState();
  }

  getState(): LoopState {
    return this.store.get();
  }

  getTemplate(): LoopTemplate {
    return this.template;
  }

  /** Backward-compatible alias — delegates to runFullLoop(). */
  async run(context: { hadBlockers?: boolean; waveNumber?: number } = {}): Promise<LoopRunResult> {
    return this.runFullLoop(context);
  }

  /**
   * Full loop orchestration: Plan → Act → Verify → Critique → Retry → next iteration or complete.
   * Supports configurable max iterations, wall-clock timeout, state resume, and retry escalation.
   */
  async runFullLoop(
    context: { hadBlockers?: boolean; waveNumber?: number } = {},
  ): Promise<LoopRunResult> {
    const maxIter = this.template.maxIterations ?? 1;
    let phasesCompleted = 0;
    let iterationsRun = 0;
    const startIter = this.store.get().iteration;

    for (let iter = startIter; iter <= maxIter; iter++) {
      if (iter > startIter) {
        this.store.incrementIteration();
        this.hooks.onLoopIterationStart?.(iter);
      }

      if (this.isTimedOut()) {
        console.error(`[Loop][engine] timeout after ${this.timeoutMs}ms at iteration=${iter}`);
        this.store.setStatus('failed');
        this.emitState();
        this.observability.persistMetrics(this.store.get());
        this.observability.postHistoryToBlackboard(this.store.get());
        this.hooks.onLoopComplete?.(this.store.get(), 'failed');
        return {
          status: 'failed',
          state: this.store.get(),
          phasesCompleted,
          iterationsRun,
          timedOut: true,
        };
      }

      iterationsRun++;

      if (this.budgetGuard) {
        const budgetCheck = this.budgetGuard.checkBeforeIteration(iter);
        if (!budgetCheck.allowed) {
          console.error(`[Loop][engine] ${budgetCheck.reason ?? 'Budget ceiling reached'}`);
          this.store.setStatus('completed');
          this.emitState();
          this.observability.persistMetrics(this.store.get());
          this.observability.postHistoryToBlackboard(this.store.get());
          this.hooks.onLoopComplete?.(this.store.get(), 'completed');
          return {
            status: 'completed',
            state: this.store.get(),
            phasesCompleted,
            iterationsRun,
            budgetExceeded: true,
            budgetMessage: budgetCheck.reason,
          };
        }
      }

      console.error(
        `[Loop][engine] iteration ${iter}/${maxIter} retryCount=${this.store.get().retryCount}`,
      );

      const iterationOutcome = await this.runIterationPhases(iter, context);
      phasesCompleted += iterationOutcome.phasesCompleted;

      if (iterationOutcome.terminalStatus) {
        this.emitState();
        this.observability.persistMetrics(this.store.get());
        this.observability.postHistoryToBlackboard(this.store.get());
        this.hooks.onLoopComplete?.(this.store.get(), iterationOutcome.terminalStatus);
        return {
          status: iterationOutcome.terminalStatus,
          state: this.store.get(),
          phasesCompleted,
          iterationsRun,
        };
      }

      const postIter = await this.runPostIterationHooks(iter);
      phasesCompleted += postIter.phasesCompleted;

      if (postIter.terminalStatus) {
        this.emitState();
        this.observability.persistMetrics(this.store.get());
        this.observability.postHistoryToBlackboard(this.store.get());
        this.hooks.onLoopComplete?.(this.store.get(), postIter.terminalStatus);
        return {
          status: postIter.terminalStatus,
          state: this.store.get(),
          phasesCompleted,
          iterationsRun,
        };
      }

      if (postIter.exitMet) {
        this.store.setStatus('completed');
        this.emitState();
        this.observability.persistMetrics(this.store.get());
        this.observability.postHistoryToBlackboard(this.store.get());
        this.hooks.onLoopComplete?.(this.store.get(), 'completed');
        return {
          status: 'completed',
          state: this.store.get(),
          phasesCompleted,
          iterationsRun,
        };
      }

      if (!iterationOutcome.shouldRetryLoop) {
        if (iter < maxIter) {
          console.error(
            `[Loop][engine] exit conditions unmet — self-pacing to iteration ${iter + 1}/${maxIter}`,
          );
          continue;
        }
        break;
      }

      const { maxRetries } = this.critiqueThresholds;
      if (this.store.get().retryCount >= maxRetries) {
        console.error(
          `[Loop][engine] retry budget exhausted retryCount=${this.store.get().retryCount} maxRetries=${maxRetries}`,
        );
        const escalateConfig = this.template.phases.find((p) => p.phase === P.Escalate);
        if (escalateConfig) {
          await this.runPhase(escalateConfig, {
            iteration: iter,
            hadBlockers: context.hadBlockers,
            waveNumber: context.waveNumber,
          });
          phasesCompleted++;
        }
        this.store.setStatus('escalated');
        this.emitState();
        this.observability.persistMetrics(this.store.get());
        this.observability.postHistoryToBlackboard(this.store.get());
        this.hooks.onLoopComplete?.(this.store.get(), 'escalated');
        return {
          status: 'escalated',
          state: this.store.get(),
          phasesCompleted,
          iterationsRun,
        };
      }

      this.store.incrementRetry();
      console.error(
        `[Loop][engine] scheduling next iteration after retry increment retryCount=${this.store.get().retryCount}`,
      );
    }

    this.store.setStatus('completed');
    this.emitState();
    this.observability.persistMetrics(this.store.get());
    this.observability.postHistoryToBlackboard(this.store.get());
    this.hooks.onLoopComplete?.(this.store.get(), 'completed');
    return {
      status: 'completed',
      state: this.store.get(),
      phasesCompleted,
      iterationsRun,
    };
  }

  private async runIterationPhases(
    iter: number,
    context: { hadBlockers?: boolean; waveNumber?: number },
  ): Promise<{
    phasesCompleted: number;
    shouldRetryLoop: boolean;
    terminalStatus?: LoopRunStatus;
  }> {
    let phasesCompleted = 0;
    let shouldRetryLoop = false;

    for (const phaseConfig of this.template.phases) {
      if (this.isTimedOut()) {
        this.store.setStatus('failed');
        this.emitState();
        return { phasesCompleted, shouldRetryLoop: false, terminalStatus: 'failed' };
      }

      if (phaseConfig.optional && phaseConfig.phase === P.Retry && !shouldRetryLoop) {
        console.error(`[Loop][engine] skipping optional Retry phase (no retry needed)`);
        continue;
      }

      if (phaseConfig.optional && phaseConfig.phase === P.Escalate) {
        const pendingEscalation =
          shouldRetryLoop &&
          this.store.get().retryCount >= this.critiqueThresholds.maxRetries;
        if (!pendingEscalation) {
          console.error(`[Loop][engine] skipping optional Escalate phase (no escalation needed)`);
          continue;
        }
      }

      const result = await this.runPhase(phaseConfig, {
        iteration: iter,
        hadBlockers: context.hadBlockers,
        waveNumber: context.waveNumber,
      });
      phasesCompleted++;

      await this.runPhaseAfterHook(phaseConfig, iter);
      if (this.store.get().status === 'failed') {
        return { phasesCompleted, shouldRetryLoop: false, terminalStatus: 'failed' };
      }

      if (result.shouldEscalate) {
        const escalateConfig = this.template.phases.find((p) => p.phase === P.Escalate);
        if (escalateConfig) {
          await this.runPhase(escalateConfig, {
            iteration: iter,
            hadBlockers: context.hadBlockers,
            waveNumber: context.waveNumber,
          });
          phasesCompleted++;
        }
        this.store.setStatus('escalated');
        this.emitState();
        return { phasesCompleted, shouldRetryLoop: false, terminalStatus: 'escalated' };
      }

      if (phaseConfig.phase === P.Critique) {
        if (result.shouldRetry) shouldRetryLoop = true;
      } else if (phaseConfig.phase === P.Verify && !result.success) {
        const hasCritique = this.template.phases.some((p) => p.phase === P.Critique);
        if (!hasCritique) shouldRetryLoop = true;
      } else if (result.shouldRetry) {
        shouldRetryLoop = true;
      }
    }

    return { phasesCompleted, shouldRetryLoop };
  }

  /** Run phase.after / phase.between_iterations hook when declared in template. */
  private buildBetweenIterationsOpts(
    hook: import('./loop-template-resolution.js').ResolvedBetweenIterationsHook,
    iter: number,
    hookVars: Record<string, string | number | undefined>,
  ): import('./between-iterations.js').BetweenIterationsOptions {
    return {
      hook,
      iteration: iter,
      cwd: this.cwd,
      runner: this.runner,
      memory: this.loopMemory!,
      stateDir: this.stateDir,
      hookVars,
      onApprovalPending: (snapshot) => {
        this.store.setPendingGitCommitApproval(snapshot);
        this.setLiveActivity({
          kind: 'approval',
          label: 'git-commit approval pending',
          detail: snapshot.message,
          startedAt: Date.now(),
          activeHook: {
            label: hook.label,
            dryRun: false,
            action: 'git-commit',
            requireApproval: true,
          },
          dispatchMethod: this.liveContext?.dispatchMethod,
          executionMode: this.liveContext?.executionMode,
          recentSpawns: this.store.getRecentSpawns(),
        });
      },
      onApprovalResolved: () => {
        this.store.setPendingGitCommitApproval(undefined);
      },
    };
  }

  /** Run phase.after / phase.between_iterations hook when declared in template. */
  private async runPhaseAfterHook(phaseConfig: PhaseConfig, iter: number): Promise<void> {
    const hook = resolveBetweenIterationsHook(this.template, { phaseConfig });
    if (!hook || !this.loopMemory) return;

    const requireApproval = hook.gitCommit?.requireApproval && !hook.gitCommit.dryRun;
    this.setLiveActivity({
      kind: requireApproval ? 'approval' : 'hook',
      label: hook.label,
      detail: hook.action === 'git-commit'
        ? requireApproval
          ? 'awaiting operator approval'
          : 'git-commit preview'
        : hook.command,
      startedAt: Date.now(),
      activeHook: {
        label: hook.label,
        dryRun: hook.dryRun,
        action: hook.action,
        requireApproval: hook.gitCommit?.requireApproval,
      },
      dispatchMethod: this.liveContext?.dispatchMethod,
      executionMode: this.liveContext?.executionMode,
      recentSpawns: this.store.getRecentSpawns(),
    });

    const result = await runBetweenIterations(
      this.buildBetweenIterationsOpts(hook, iter, {
        goal: this.goal,
        template: this.template.name,
        phase: phaseConfig.phase,
      }),
    );
    this.store.setLiveActivity(undefined);
    this.hooks.onBetweenIterations?.(iter, `${phaseConfig.phase}:${hook.label}`, result.success);
    if (result.fatal) {
      console.error(
        `[Loop][engine] phase after-hook failed exit_on_failure phase=${phaseConfig.phase} iter=${iter}`,
      );
      this.store.setStatus('failed');
    }
  }

  /** Between-iterations check, reflection, and exit condition evaluation. */
  private async runPostIterationHooks(iter: number): Promise<{
    phasesCompleted: number;
    exitMet: boolean;
    terminalStatus?: LoopRunStatus;
  }> {
    let phasesCompleted = 0;
    let lastBetweenRun;

    const betweenHook = resolveBetweenIterationsHook(this.template);
    if (betweenHook && this.loopMemory) {
      const requireApproval =
        betweenHook.gitCommit?.requireApproval && !betweenHook.gitCommit.dryRun;
      this.setLiveActivity({
        kind: requireApproval ? 'approval' : 'hook',
        label: betweenHook.label,
        detail: betweenHook.action === 'git-commit'
          ? requireApproval
            ? 'awaiting operator approval'
            : 'git-commit preview'
          : betweenHook.command,
        startedAt: Date.now(),
        activeHook: {
          label: betweenHook.label,
          dryRun: betweenHook.dryRun,
          action: betweenHook.action,
          requireApproval: betweenHook.gitCommit?.requireApproval,
        },
        dispatchMethod: this.liveContext?.dispatchMethod,
        executionMode: this.liveContext?.executionMode,
        recentSpawns: this.store.getRecentSpawns(),
      });
      const between = await runBetweenIterations(
        this.buildBetweenIterationsOpts(betweenHook, iter, {
          goal: this.goal,
          template: this.template.name,
          phase: 'between-iterations',
        }),
      );
      this.store.setLiveActivity(undefined);
      lastBetweenRun = between.run;
      this.hooks.onBetweenIterations?.(iter, betweenHook.command || betweenHook.label, between.success);
      if (between.fatal) {
        console.error(`[Loop][engine] between-iterations hook failed with exit_on_failure at iter=${iter}`);
        this.store.setStatus('failed');
        return { phasesCompleted, exitMet: false, terminalStatus: 'failed' };
      }
    }

    const shouldReflect =
      this.template.reflection ||
      this.template.phases.some((p) => p.phase === P.Reflect);
    if (shouldReflect && iter < (this.template.maxIterations ?? 1)) {
      const reflectConfig = this.template.phases.find((p) => p.phase === P.Reflect) ?? {
        phase: P.Reflect,
        label: 'Reflect',
        optional: true,
      };
      await this.runPhase(reflectConfig, { iteration: iter });
      phasesCompleted++;
    }

    if (this.loopMemory && this.store.get().lastVerification) {
      const lv = this.store.get().lastVerification!;
      this.loopMemory.recordVerification(lv.confidence, lv.accepted);
      this.loopMemory.saveCheckpoint(iter, this.store.get());
    }

    const exitEval = evaluateExitConditions(this.template.exitConditions, {
      iteration: iter,
      maxIterations: this.template.maxIterations ?? 1,
      evaluation: this.lastEvaluation,
      memory: this.loopMemory?.getState() ?? {
        loopId: '',
        goal: this.goal,
        templateId: this.template.name,
        startedAt: this.loopStartedAt,
        updatedAt: Date.now(),
        iteration: iter,
        confidenceStreak: 0,
        confidenceHistory: [],
        betweenIterationRuns: lastBetweenRun ? [lastBetweenRun] : [],
        exitConditionStatus: [],
        reflections: [],
      },
      lastBetweenRun,
    });

    this.store.setExitEvaluation(exitEval.statuses, {
      shouldExit: exitEval.shouldExit,
      reason: exitEval.reason,
      at: Date.now(),
    });
    this.loopMemory?.recordExitConditionStatus(exitEval.statuses);

    this.commandBoard?.appendBullet(
      'Key Decisions',
      `[EXIT] Iter ${iter}: ${exitEval.shouldExit ? 'MET — completing loop' : 'continue'} — ${exitEval.reason}`,
    );

    this.blackboard.post({
      type: 'result',
      title: `Exit conditions (iteration ${iter})`,
      content: exitEval.summary,
      status: exitEval.shouldExit ? 'done' : 'pending',
      author: 'loop-engine',
      priority: exitEval.shouldExit ? 'medium' : 'low',
      tags: ['loop', 'exit-condition'],
      relatedIds: [],
    });

    this.hooks.onExitConditionEvaluated?.(iter, exitEval.shouldExit, exitEval.reason);
    this.emitState();

    console.error(
      `[Loop][engine] exit evaluation iter=${iter} shouldExit=${exitEval.shouldExit} reason="${exitEval.reason}"`,
    );

    return { phasesCompleted, exitMet: exitEval.shouldExit };
  }

  /** Execute a single phase by config. */
  async runPhase(
    phaseConfig: PhaseConfig,
    ctx: { iteration: number; hadBlockers?: boolean; waveNumber?: number },
  ): Promise<PhaseResult> {
    const phase = phaseConfig.phase;
    const stateBefore = this.store.get();
    saveLoopCheckpoint(this.stateDir, phase, stateBefore);
    this.observability.recordPhaseStart(phase, ctx.iteration, {
      waveNumber: ctx.waveNumber,
      hadBlockers: ctx.hadBlockers,
      retryCount: stateBefore.retryCount,
    });

    console.error(
      `[Loop][engine] phase transition → ${phase} iteration=${ctx.iteration} retryCount=${this.store.get().retryCount}`,
    );
    this.store.transitionTo(phase);
    this.setLiveActivity({
      kind: 'phase',
      label: phase,
      detail: phaseConfig.label ?? phase,
      startedAt: Date.now(),
      progressSummary: `Iteration ${ctx.iteration} · ${phase}`,
      dispatchMethod: this.liveContext?.dispatchMethod,
      executionMode: this.liveContext?.executionMode,
    });
    this.emitState();
    this.hooks.onPhaseStart?.(phase, ctx.iteration);

    const phaseStartedAt = Date.now();
    const handler = this.handlers.get(phase);
    if (!handler) {
      const result: PhaseResult = {
        success: true,
        summary: `No handler for phase ${phase} — skipped`,
      };
      this.store.completePhase(phase, result);
      this.emitState();
      this.hooks.onPhaseComplete?.(phase, result);
      return result;
    }

    let result: PhaseResult;
    try {
      result = await handler.execute({
        goal: this.goal,
        stateDir: this.stateDir,
        state: this.store.get(),
        blackboard: this.blackboard,
        commandBoard: this.commandBoard,
        iteration: ctx.iteration,
        waveNumber: ctx.waveNumber,
        hadBlockers: ctx.hadBlockers,
        phaseConfig,
        maxRetries: this.critiqueThresholds.maxRetries,
        escalationThreshold: this.critiqueThresholds.escalationThreshold,
        isTestMode: this.isTestMode,
        reportLiveActivity: (activity) => this.setLiveActivity(activity),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Loop][engine] phase ${phase} handler error — defensive recovery`, { error: message });
      result = {
        success: false,
        summary: `Phase ${phase} error: ${message}`,
        shouldEscalate: phase === P.Retry || phase === P.Critique,
      };
    }

    this.store.completePhase(phase, {
      success: result.success,
      summary: result.summary,
      verification: result.verification,
      critique: result.critique,
      retry: result.retry,
    });

    if (phase === P.Verify && result.evaluation) {
      this.lastEvaluation = result.evaluation;
    }

    if (result.flakyVerification) {
      this.store.setFlakyVerification(result.flakyVerification);
    }

    const durationMs = Date.now() - phaseStartedAt;
    this.observability.recordPhaseComplete(
      phase,
      ctx.iteration,
      result,
      durationMs,
      this.template.name,
      {
        waveNumber: ctx.waveNumber,
        hadBlockers: ctx.hadBlockers,
        retryCount: this.store.get().retryCount,
      },
    );
    const metrics = this.observability.persistMetrics(this.store.get());
    if (ctx.iteration % 2 === 0 || phase === P.Critique || phase === P.Verify) {
      this.observability.postHistoryToBlackboard(this.store.get());
    }
    void metrics;

    this.emitState();
    this.hooks.onPhaseComplete?.(phase, result);

    console.error(
      `[Loop][engine] phase complete ${phase} success=${result.success} ` +
        `shouldRetry=${Boolean(result.shouldRetry)} shouldEscalate=${Boolean(result.shouldEscalate)}`,
    );
    return result;
  }

  /** Run a phase by name (coordinator convenience). */
  async runNamedPhase(
    phase: Phase,
    ctx: { iteration?: number; hadBlockers?: boolean; waveNumber?: number } = {},
  ): Promise<PhaseResult | null> {
    const config = this.template.phases.find((p) => p.phase === phase);
    if (!config) return null;
    return this.runPhase(config, {
      iteration: ctx.iteration ?? this.store.get().iteration,
      hadBlockers: ctx.hadBlockers,
      waveNumber: ctx.waveNumber,
    });
  }

  hasPhase(phase: Phase): boolean {
    return this.template.phases.some((p) => p.phase === phase);
  }

  getMetrics() {
    return this.observability.persistMetrics(this.store.get());
  }

  private isTimedOut(): boolean {
    return Date.now() - this.loopStartedAt >= this.timeoutMs;
  }

  private emitState(): void {
    this.hooks.onStateChange?.(this.store.get());
  }

  /** Record specialist spawn pulse for dashboard live panel + history. */
  recordSpawnPulse(pulse: LoopSpawnPulse): void {
    this.store.appendSpawnPulse(pulse);
    this.setLiveActivity({
      kind: 'spawn',
      label: pulse.label,
      detail: `${pulse.role} · ${pulse.phase} (×${pulse.count})`,
      startedAt: pulse.at,
      spawnPulse: pulse,
      recentSpawns: this.store.getRecentSpawns(),
      dispatchMethod: this.liveContext?.dispatchMethod,
      executionMode: this.liveContext?.executionMode,
    });
  }

  private setLiveActivity(activity: LoopLiveActivity | undefined): void {
    this.store.setLiveActivity(
      activity
        ? {
            ...activity,
            dispatchMethod: activity.dispatchMethod ?? this.liveContext?.dispatchMethod,
            executionMode: activity.executionMode ?? this.liveContext?.executionMode,
          }
        : undefined,
    );
    this.emitState();
  }
}

/**
 * Legacy coordinator mapping team-orchestrator lifecycle events to loop phases.
 * Loop-template missions use ClosedLoop.runFullLoop() instead of this coordinator.
 * Kept for backward compatibility with external callers still wiring waves manually.
 */
export class LoopEngineCoordinator {
  constructor(
    private readonly engine: LoopEngine,
    private readonly hooks?: LoopHooks,
  ) {}

  async onMissionStart(): Promise<void> {
    const template = this.engine.getTemplate();
    this.engine.getState(); // ensures loop-state.json exists
    console.error(`[Loop] Template "${template.name}" — ${template.phases.length} phase(s)`);
  }

  async onPlanningComplete(): Promise<void> {
    if (this.engine.hasPhase(P.Plan)) {
      await this.engine.runNamedPhase(P.Plan);
    }
  }

  async onWaveStart(waveNumber: number): Promise<void> {
    if (this.engine.hasPhase(P.Act)) {
      await this.engine.runNamedPhase(P.Act, { waveNumber });
    }
  }

  async onWaveComplete(waveNumber: number, hadBlockers: boolean): Promise<void> {
    if (this.engine.hasPhase(P.Verify)) {
      await this.engine.runNamedPhase(P.Verify, { waveNumber, hadBlockers });
    }

    let critiqueResult: PhaseResult | null = null;
    if (this.engine.hasPhase(P.Critique)) {
      critiqueResult = await this.engine.runNamedPhase(P.Critique, { waveNumber, hadBlockers });
    }

    const shouldRetry =
      critiqueResult?.shouldRetry ||
      (hadBlockers && !critiqueResult?.shouldEscalate);
    if (shouldRetry && this.engine.hasPhase(P.Retry)) {
      await this.engine.runNamedPhase(P.Retry, { waveNumber, hadBlockers });
    }
    void waveNumber;
    void this.hooks;
  }

  async onSynthesisStart(): Promise<void> {
    if (this.engine.hasPhase(P.Observe)) {
      await this.engine.runNamedPhase(P.Observe);
    }
  }

  async onMissionComplete(): Promise<void> {
    const state = this.engine.getState();
    if (state.status === 'running') {
      // Coordinator mode does not always run all phases — mark completed at mission end.
    }
  }

  getEngine(): LoopEngine {
    return this.engine;
  }
}
