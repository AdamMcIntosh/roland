/**
 * LoopEngine — runs loop phases sequentially with hooks and persistence.
 *
 * Modes:
 *   1. `runFullLoop()` — full Plan → Act → Verify → Critique → Retry orchestration with
 *      configurable max iterations, timeout, resume, and exponential backoff.
 *   2. `run()` — alias for `runFullLoop()` (backward compatible).
 *   3. Coordinator-driven — team-orchestrator calls lifecycle hooks per wave.
 */

import type { Blackboard } from '../rco/blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { LoopTemplate, Phase, PhaseConfig } from './loop-phases.js';
import { Phase as P } from './loop-phases.js';
import {
  LoopStateStore,
  createInitialLoopState,
  type LoopState,
  type LoopRunStatus,
} from './loop-state.js';
import {
  createDefaultHandlers,
  RetryPhaseHandler,
  ReflectionPhaseHandler,
  type PhaseHandler,
  type PhaseResult,
} from './phase-handlers/index.js';
import { loadLoopEngineConfig, resolveCritiqueThresholds } from './loop-config.js';
import { LoopObservability } from './loop-observability.js';
import { saveLoopCheckpoint, tryRecoverLoopState } from './loop-checkpoint.js';
import type { LoopMemory } from './loop-memory.js';
import { runBetweenIterations } from './between-iterations.js';
import { evaluateExitConditions } from './exit-conditions.js';
import type { CommandRunner } from './verification/index.js';
import type { EvaluationGateResult } from './evaluation-gate.js';
import {
  computeSpecProgress,
  readSpecContent,
  resolveSpecPath,
} from './spec-progress.js';
import type { PhaseHandlerContext } from './phase-handlers/types.js';

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
}

export interface LoopRunResult {
  status: LoopRunStatus;
  state: LoopState;
  phasesCompleted: number;
  iterationsRun: number;
  timedOut?: boolean;
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
  private readonly runner?: CommandRunner;
  private readonly cwd: string;
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
        `betweenIter=${Boolean(opts.template.betweenIterations)} reflection=${Boolean(opts.template.reflection)}`,
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

  /** Between-iterations check, reflection, and exit condition evaluation. */
  private async runPostIterationHooks(iter: number): Promise<{
    phasesCompleted: number;
    exitMet: boolean;
  }> {
    let phasesCompleted = 0;
    let lastBetweenRun;

    if (this.template.betweenIterations && this.loopMemory) {
      const between = await runBetweenIterations({
        command: this.template.betweenIterations,
        iteration: iter,
        cwd: this.cwd,
        runner: this.runner,
        memory: this.loopMemory,
      });
      lastBetweenRun = between.run;
      this.hooks.onBetweenIterations?.(iter, this.template.betweenIterations, between.success);
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
      const latestReflection = this.loopMemory?.getLatestReflection();
      if (latestReflection) {
        this.hooks.onReflection?.(iter, latestReflection.content);
      }
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
      const handlerCtx = this.buildPhaseContext(ctx, phaseConfig);
      result = await handler.execute(handlerCtx);
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

  private buildPhaseContext(
    ctx: { iteration: number; hadBlockers?: boolean; waveNumber?: number },
    phaseConfig: PhaseConfig,
  ): PhaseHandlerContext {
    const specPath = resolveSpecPath(this.template, this.cwd);
    let specProgress = specPath ? computeSpecProgress(specPath) : null;

    // Refresh spec progress before Plan and Verify — key Spec-First integration points.
    if (specProgress && this.loopMemory && (phaseConfig.phase === P.Plan || phaseConfig.phase === P.Verify)) {
      this.loopMemory.recordSpecProgress(specProgress);
    }

    const latestReflection =
      ctx.iteration > 1 ? (this.loopMemory?.getLatestReflection() ?? null) : null;

    return {
      goal: this.goal,
      state: this.store.get(),
      blackboard: this.blackboard,
      commandBoard: this.commandBoard,
      iteration: ctx.iteration,
      waveNumber: ctx.waveNumber,
      hadBlockers: ctx.hadBlockers,
      phaseConfig,
      template: this.template,
      latestReflection,
      reflectionContext: this.loopMemory?.getReflectionContext(),
      specProgress,
      specContent: specPath ? readSpecContent(specPath) : undefined,
      cwd: this.cwd,
      maxRetries: this.critiqueThresholds.maxRetries,
      escalationThreshold: this.critiqueThresholds.escalationThreshold,
    };
  }

  private isTimedOut(): boolean {
    return Date.now() - this.loopStartedAt >= this.timeoutMs;
  }

  private emitState(): void {
    this.hooks.onStateChange?.(this.store.get());
  }
}

/**
 * Maps team-orchestrator lifecycle events to loop phases.
 * Used when a mission is launched with a loop template attached.
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
