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
import { type LoopState, type LoopRunStatus, type LoopSpawnPulse } from './loop-state.js';
import { type PhaseHandler, type PhaseResult } from './phase-handlers/index.js';
import type { LoopMemory } from './loop-memory.js';
import type { CommandRunner } from './verification/index.js';
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
}
export interface LoopRunResult {
    status: LoopRunStatus;
    state: LoopState;
    phasesCompleted: number;
    iterationsRun: number;
    timedOut?: boolean;
}
export declare class LoopEngine {
    private readonly store;
    private readonly handlers;
    private readonly hooks;
    private readonly template;
    private readonly goal;
    private readonly blackboard;
    private readonly commandBoard?;
    private readonly critiqueThresholds;
    private readonly observability;
    private readonly stateDir;
    private readonly timeoutMs;
    private readonly loopStartedAt;
    private readonly loopMemory?;
    private readonly runner?;
    private readonly cwd;
    private readonly liveContext?;
    private lastEvaluation?;
    constructor(opts: LoopEngineOptions);
    getState(): LoopState;
    getTemplate(): LoopTemplate;
    /** Backward-compatible alias — delegates to runFullLoop(). */
    run(context?: {
        hadBlockers?: boolean;
        waveNumber?: number;
    }): Promise<LoopRunResult>;
    /**
     * Full loop orchestration: Plan → Act → Verify → Critique → Retry → next iteration or complete.
     * Supports configurable max iterations, wall-clock timeout, state resume, and retry escalation.
     */
    runFullLoop(context?: {
        hadBlockers?: boolean;
        waveNumber?: number;
    }): Promise<LoopRunResult>;
    private runIterationPhases;
    /** Run phase.after / phase.between_iterations hook when declared in template. */
    private buildBetweenIterationsOpts;
    /** Run phase.after / phase.between_iterations hook when declared in template. */
    private runPhaseAfterHook;
    /** Between-iterations check, reflection, and exit condition evaluation. */
    private runPostIterationHooks;
    /** Execute a single phase by config. */
    runPhase(phaseConfig: PhaseConfig, ctx: {
        iteration: number;
        hadBlockers?: boolean;
        waveNumber?: number;
    }): Promise<PhaseResult>;
    /** Run a phase by name (coordinator convenience). */
    runNamedPhase(phase: Phase, ctx?: {
        iteration?: number;
        hadBlockers?: boolean;
        waveNumber?: number;
    }): Promise<PhaseResult | null>;
    hasPhase(phase: Phase): boolean;
    getMetrics(): import("./loop-observability.js").LoopMetrics;
    private isTimedOut;
    private emitState;
    /** Record specialist spawn pulse for dashboard live panel + history. */
    recordSpawnPulse(pulse: LoopSpawnPulse): void;
    private setLiveActivity;
}
/**
 * Maps team-orchestrator lifecycle events to loop phases.
 *
 * TODO: Legacy — to be removed after Loop Engineering pivot.
 * Loop-template missions use ClosedLoop.runFullLoop() instead of this coordinator.
 * Kept for backward compatibility with any external callers still wiring waves manually.
 */
export declare class LoopEngineCoordinator {
    private readonly engine;
    private readonly hooks?;
    constructor(engine: LoopEngine, hooks?: LoopHooks | undefined);
    onMissionStart(): Promise<void>;
    onPlanningComplete(): Promise<void>;
    onWaveStart(waveNumber: number): Promise<void>;
    onWaveComplete(waveNumber: number, hadBlockers: boolean): Promise<void>;
    onSynthesisStart(): Promise<void>;
    onMissionComplete(): Promise<void>;
    getEngine(): LoopEngine;
}
//# sourceMappingURL=loop-engine.d.ts.map