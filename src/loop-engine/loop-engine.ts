/**
 * LoopEngine — runs loop phases sequentially with hooks and persistence.
 *
 * Two modes:
 *   1. Standalone `run()` — executes all template phases in order (E2E tests).
 *   2. Coordinator-driven — team-orchestrator calls lifecycle hooks per wave.
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
  type PhaseHandler,
  type PhaseResult,
} from './phase-handlers/index.js';
import { resolveCritiqueThresholds } from './loop-config.js';
import { LoopObservability } from './loop-observability.js';
import { saveLoopCheckpoint, tryRecoverLoopState } from './loop-checkpoint.js';

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
  /** When true, attempt checkpoint / loop-state recovery on construction. */
  recoverOnStart?: boolean;
}

export interface LoopRunResult {
  status: LoopRunStatus;
  state: LoopState;
  phasesCompleted: number;
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

  constructor(opts: LoopEngineOptions) {
    const firstPhase = opts.template.phases[0]?.phase ?? P.Plan;
    this.template = opts.template;
    this.goal = opts.goal;
    this.blackboard = opts.blackboard;
    this.commandBoard = opts.commandBoard;
    this.handlers = opts.handlers ?? createDefaultHandlers();
    this.hooks = opts.hooks ?? {};
    this.stateDir = opts.stateDir;
    this.observability = new LoopObservability(opts.stateDir, opts.blackboard);
    this.critiqueThresholds = resolveCritiqueThresholds(opts.template, {
      isTestMode: opts.isTestMode,
    });

    const fallback = createInitialLoopState(opts.template.name, opts.goal, firstPhase);
    if (opts.recoverOnStart !== false) {
      const recovery = tryRecoverLoopState(opts.stateDir);
      if (recovery.recovered && recovery.state) {
        this.store = new LoopStateStore(opts.stateDir, recovery.state, { skipInitialFlush: true });
        this.commandBoard?.appendBullet(
          'Key Decisions',
          `[LOOP] Recovered from ${recovery.source} at phase ${recovery.phase} (iter ${recovery.state.iteration})`,
        );
      } else {
        this.store = LoopStateStore.loadOrCreate(opts.stateDir, fallback);
      }
    } else {
      this.store = new LoopStateStore(opts.stateDir, fallback);
    }
    this.emitState();
  }

  getState(): LoopState {
    return this.store.get();
  }

  getTemplate(): LoopTemplate {
    return this.template;
  }

  /** Run all configured phases sequentially (standalone / test mode). */
  async run(context: { hadBlockers?: boolean; waveNumber?: number } = {}): Promise<LoopRunResult> {
    const maxIter = this.template.maxIterations ?? 1;
    let phasesCompleted = 0;

    for (let iter = 1; iter <= maxIter; iter++) {
      if (iter > 1) {
        this.store.incrementIteration();
        this.hooks.onLoopIterationStart?.(iter);
      }

      let shouldRetryLoop = false;

      for (const phaseConfig of this.template.phases) {
        if (phaseConfig.optional && phaseConfig.phase === P.Retry && !shouldRetryLoop) {
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
          this.observability.persistMetrics(this.store.get());
          this.observability.postHistoryToBlackboard(this.store.get());
          this.hooks.onLoopComplete?.(this.store.get(), 'escalated');
          return { status: 'escalated', state: this.store.get(), phasesCompleted };
        }

        // Critique phase owns retry decisions; Verify only records gate results.
        if (phaseConfig.phase === P.Critique) {
          if (result.shouldRetry) shouldRetryLoop = true;
        } else if (phaseConfig.phase === P.Verify && !result.success) {
          // Verify failure without critique phase — fall back to retry.
          const hasCritique = this.template.phases.some((p) => p.phase === P.Critique);
          if (!hasCritique) shouldRetryLoop = true;
        } else if (result.shouldRetry) {
          shouldRetryLoop = true;
        }
      }

      const state = this.store.get();
      if (!shouldRetryLoop) break;

      const { maxRetries } = this.critiqueThresholds;
      if (state.retryCount >= maxRetries) {
        this.store.setStatus('escalated');
        this.observability.persistMetrics(this.store.get());
        this.observability.postHistoryToBlackboard(this.store.get());
        this.hooks.onLoopComplete?.(this.store.get(), 'escalated');
        return { status: 'escalated', state: this.store.get(), phasesCompleted };
      }
      this.store.incrementRetry();
    }

    this.store.setStatus('completed');
    this.observability.persistMetrics(this.store.get());
    this.observability.postHistoryToBlackboard(this.store.get());
    this.hooks.onLoopComplete?.(this.store.get(), 'completed');
    return { status: 'completed', state: this.store.get(), phasesCompleted };
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

    const result = await handler.execute({
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

    this.store.completePhase(phase, {
      success: result.success,
      summary: result.summary,
      verification: result.verification,
      critique: result.critique,
    });

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
