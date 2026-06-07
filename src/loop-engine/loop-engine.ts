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

  constructor(opts: LoopEngineOptions) {
    const firstPhase = opts.template.phases[0]?.phase ?? P.Plan;
    this.template = opts.template;
    this.goal = opts.goal;
    this.blackboard = opts.blackboard;
    this.commandBoard = opts.commandBoard;
    this.handlers = opts.handlers ?? createDefaultHandlers();
    this.hooks = opts.hooks ?? {};
    this.store = new LoopStateStore(
      opts.stateDir,
      createInitialLoopState(opts.template.name, opts.goal, firstPhase),
    );
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
          this.hooks.onLoopComplete?.(this.store.get(), 'escalated');
          return { status: 'escalated', state: this.store.get(), phasesCompleted };
        }

        if (!result.success && phaseConfig.phase === P.Verify) {
          shouldRetryLoop = true;
        }
        if (result.shouldRetry) {
          shouldRetryLoop = true;
        }
      }

      const state = this.store.get();
      if (!shouldRetryLoop) break;

      const maxRetries = this.template.maxRetries ?? 3;
      if (state.retryCount >= maxRetries) {
        this.store.setStatus('escalated');
        this.hooks.onLoopComplete?.(this.store.get(), 'escalated');
        return { status: 'escalated', state: this.store.get(), phasesCompleted };
      }
      this.store.incrementRetry();
    }

    this.store.setStatus('completed');
    this.hooks.onLoopComplete?.(this.store.get(), 'completed');
    return { status: 'completed', state: this.store.get(), phasesCompleted };
  }

  /** Execute a single phase by config. */
  async runPhase(
    phaseConfig: PhaseConfig,
    ctx: { iteration: number; hadBlockers?: boolean; waveNumber?: number },
  ): Promise<PhaseResult> {
    const phase = phaseConfig.phase;
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

    const result = await handler.execute({
      goal: this.goal,
      state: this.store.get(),
      blackboard: this.blackboard,
      commandBoard: this.commandBoard,
      iteration: ctx.iteration,
      waveNumber: ctx.waveNumber,
      hadBlockers: ctx.hadBlockers,
    });

    this.store.completePhase(phase, result);
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
    if (this.engine.hasPhase(P.Critique)) {
      await this.engine.runNamedPhase(P.Critique, { waveNumber, hadBlockers });
    }
    if (hadBlockers && this.engine.hasPhase(P.Retry)) {
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
