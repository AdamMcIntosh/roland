/**
 * RunState — persists real-time orchestrator state to .roland/run-state.json.
 *
 * Written by the orchestrator (via RunStateWriter) during every lifecycle event.
 * Read by the TUI renderer and `roland status` observer.
 */
export declare const RUN_STATE_FILE = "run-state.json";
export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'blocked';
export type RunStatus = 'planning' | 'running' | 'reviewing' | 'synthesizing' | 'done' | 'error';
export interface TaskRunState {
    id: string;
    title: string;
    agent: string;
    wave: number;
    status: TaskStatus;
    startedAt?: number;
    completedAt?: number;
    hadBlocker?: boolean;
    /** Last 300 chars of agent output, set on completion. */
    outputPreview?: string;
}
export interface RunState {
    runId: string;
    goal: string;
    startedAt: number;
    updatedAt: number;
    status: RunStatus;
    currentWave: number;
    totalTasks: number;
    completedTasks: number;
    tasks: TaskRunState[];
    /** IDs of tasks currently executing (used to drive activity indicator). */
    activeTaskIds: string[];
    pmNotes?: string;
    errorMessage?: string;
    /** True while run is paused via `roland pause`. Updated by orchestrator. */
    hitlPaused?: boolean;
    /** True after `roland abort` is queued, before it is processed. */
    hitlAbortPending?: boolean;
    /** Set when the wave circuit breaker opens due to connection errors. */
    connectionDropped?: boolean;
    /** Human-readable detail about the connection drop (wave, agent count, etc.). */
    connectionDropMessage?: string;
}
export declare class RunStateWriter {
    private state;
    private readonly filePath;
    constructor(stateDir: string, goal: string);
    planReady(tasks: Array<{
        id: string;
        title: string;
        agent: string;
    }>): void;
    waveStart(waveNumber: number, taskIds: string[]): void;
    taskStart(id: string): void;
    taskComplete(id: string, output: string, hadBlocker: boolean): void;
    waveReviewing(): void;
    waveComplete(pmNotes?: string): void;
    /** Add tasks dynamically spawned by the PM during review. */
    addTasks(tasks: Array<{
        id: string;
        title: string;
        agent: string;
    }>): void;
    synthesizing(): void;
    setHitlPaused(paused: boolean): void;
    setAbortPending(): void;
    setConnectionDropped(message: string): void;
    clearConnectionDropped(): void;
    done(): void;
    error(message: string): void;
    get(): RunState;
    private flush;
}
export declare function readRunState(stateDir: string): RunState | null;
//# sourceMappingURL=run-state.d.ts.map