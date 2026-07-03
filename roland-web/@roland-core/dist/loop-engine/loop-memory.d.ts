/**
 * ## Assumptions
 * - Each closed loop run gets a stable loop-id under `.roland/loops/<loop-id>/`.
 * - `state.json` holds structured exit-tracking and between-iteration history.
 * - `reflection.md` is append-only human-readable learnings across iterations.
 * - Checkpoints and artifacts are written per-iteration for resume and debugging.
 */
import type { LoopState } from './loop-state.js';
import type { ExitConditionStatus } from './exit-conditions.js';
export declare const LOOPS_ROOT = "loops";
export declare const LOOP_STATE_JSON = "state.json";
export declare const LOOP_REFLECTION_MD = "reflection.md";
export declare const LOOP_CHECKPOINTS_DIR = "checkpoints";
export declare const LOOP_ARTIFACTS_DIR = "artifacts";
export interface BetweenIterationRun {
    iteration: number;
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut?: boolean;
    at: number;
    durationMs: number;
}
export interface ReflectionEntry {
    iteration: number;
    at: number;
    content: string;
}
export interface LoopDiskState {
    loopId: string;
    goal: string;
    templateId: string;
    startedAt: number;
    updatedAt: number;
    iteration: number;
    /** Consecutive iterations where verification was accepted. */
    confidenceStreak: number;
    /** Recent verification confidence values (newest last). */
    confidenceHistory: number[];
    betweenIterationRuns: BetweenIterationRun[];
    exitConditionStatus: ExitConditionStatus[];
    reflections: ReflectionEntry[];
}
export interface LoopMemoryOptions {
    stateDir: string;
    loopId?: string;
    goal: string;
    templateId: string;
}
/** Derive a stable loop directory id from goal + optional run id. */
export declare function deriveLoopId(goal: string, runId?: string): string;
/**
 * LoopMemory — persistent disk layer for closed-loop runs.
 *
 * Layout: `.roland/loops/<loop-id>/state.json`, `reflection.md`, `checkpoints/`, `artifacts/`.
 */
export declare class LoopMemory {
    private readonly opts;
    readonly loopId: string;
    readonly loopDir: string;
    private diskState;
    constructor(opts: LoopMemoryOptions);
    getState(): LoopDiskState;
    /** Record verification confidence and update streak tracking. */
    recordVerification(confidence: number | undefined, accepted: boolean | undefined): void;
    recordBetweenIteration(run: BetweenIterationRun): void;
    recordExitConditionStatus(status: ExitConditionStatus[]): void;
    /** Append reflection for an iteration to memory and reflection.md. */
    appendReflection(iteration: number, content: string): ReflectionEntry;
    /** Save loop-state snapshot as a per-iteration checkpoint. */
    saveCheckpoint(iteration: number, loopState: LoopState): void;
    writeArtifact(name: string, content: string): void;
    readReflectionMd(): string;
    private loadOrCreate;
    private appendReflectionMd;
    private touch;
    private flush;
}
export declare function readLoopMemoryState(stateDir: string, loopId: string): LoopDiskState | null;
export declare function findLatestLoopMemory(stateDir: string): LoopDiskState | null;
/**
 * ## Loop Integration Complete
 * LoopMemory persists reflections, exit-condition tracking, and between-iteration artifacts
 * under `.roland/loops/<loop-id>/` for autonomous multi-iteration closed loops.
 */
//# sourceMappingURL=loop-memory.d.ts.map