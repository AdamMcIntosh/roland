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
  type PhaseHandler,
  type PhaseResult,
} from './phase-handlers/index.js';
import { loadLoopEngineConfig, resolveCritiqueThresholds } from './loop-config.js';

export interface LoopHooks {
  onPhaseStart?: (phase: Phase, iteration: number) => void;
  onPhaseComplete?: (phase: Phase, result: PhaseResult) => void;
  onLoopIterationStart?: (iteration: number) => void;
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
  /** Resume from existing loop-state.json when status is running and goal/template match. */
  resumeFromState?: boolean;
  /** Wall-clock timeout for the full loop (ms). Template/config override. */
  timeoutMs?: number;
  /** Skip exponential backoff delays (tests). */
  skipBackoff?: boolean;
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
  private readonly timeoutMs: number;
  private readonly loopStartedAt: number;

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
    this.hooks = opts.hooks ?? {};
    this.critiqueThresholds = resolveCritiqueThresholds(opts.template, {
      isTestMode: opts.isTestMode,
    });
    this.timeoutMs =
      opts.timeoutMs ??
      opts.template.timeoutMs ??
      cfg.timeoutMs ??
      1_800_000;
    this.loopStartedAt = Date.now();

    this.store = LoopStateStore.loadOrCreate(
      opts.stateDir,
      opts.template.name,
      opts.goal,
      firstPhase,
      Boolean(opts.resumeFromState),
    );

    console.error(
      `[Loop][engine] template="${opts.template.name}" maxIterations=${opts.template.maxIterations ?? 1} ` +
        `maxRetries=${this.critiqueThresholds.maxRetries} timeoutMs=${this.timeoutMs} ` +
        `resume=${Boolean(opts.resumeFromState)}`,
    );
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
        this.hooks.onLoopComplete?.(this.store.get(), iterationOutcome.terminalStatus);
        return {
          status: iterationOutcome.terminalStatus,
          state: this.store.get(),
          phasesCompleted,
          iterationsRun,
        };
      }

      if (!iterationOutcome.shouldRetryLoop) break;

      const { maxRetries } = this.critiqueThresholds;
      if (this.store.get().retryCount >= maxRetries) {
        console.error(
          `[Loop][engine] retry budget exhausted retryCount=${this.store.get().retryCount} maxRetries=${maxRetries}`,
        );
        this.store.setStatus('escalated');
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
        return { phasesCompleted, shouldRetryLoop: false, terminalStatus: 'failed' };
      }

      if (phaseConfig.optional && phaseConfig.phase === P.Retry && !shouldRetryLoop) {
        console.error(`[Loop][engine] skipping optional Retry phase (no retry needed)`);
        continue;
      }

      const result = await this.runPhase(phaseConfig, {
        iteration: iter,
        hadBlockers: context.hadBlockers,
        waveNumber: context.waveNumber,
      });
      phasesCompleted++;

      if (result.shouldEscalate) {
        this.store.setStatus('escalated');
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

  /** Execute a single phase by config. */
  async runPhase(
    phaseConfig: PhaseConfig,
    ctx: { iteration: number; hadBlockers?: boolean; waveNumber?: number },
  ): Promise<PhaseResult> {
    const phase = phaseConfig.phase;
    console.error(
      `[Loop][engine] phase transition → ${phase} iteration=${ctx.iteration} retryCount=${this.store.get().retryCount}`,
    );
    this.store.transitionTo(phase);
    this.emitState();
    this.hooks.onPhaseStart?.(phase, ctx.iteration);

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
        state: this.store.get(),
        blackboard: this.blackboard,
        commandBoard: this.commandBoard,
        iteration: ctx.iteration,
        waveNumber: ctx.waveNumber,
        hadBlockers: ctx.hadBlockers,
        phaseConfig,
        maxRetries: this.critiqueThresholds.maxRetries,
        escalationThreshold: this.critiqueThresholds.escalationThreshold,
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
