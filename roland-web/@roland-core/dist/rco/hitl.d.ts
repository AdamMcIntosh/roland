/**
 * Human-in-the-Loop (HITL) Controls for Roland team runs.
 *
 * Commands are written to .roland/hitl.json by CLI verbs and polled by the
 * orchestrator between waves (and while paused). The file is a simple JSON
 * queue — append-only from the CLI side, drain-from-front on the orchestrator
 * side. A separate .roland/hitl-state.json tracks pause/resume state so the
 * orchestrator can busy-poll it reliably.
 *
 * Supported commands (write with `roland <cmd>`):
 *   roland pause                        → pause before next wave
 *   roland resume                       → resume after pause
 *   roland unblock <task-id> [message]  → send message to a blocked agent
 *   roland inject "<text>"              → post a directive to the Blackboard
 *   roland replan                       → ask PM to re-evaluate the remaining plan
 *   roland abort                        → stop the run after the current wave
 *
 * Poll interval (orchestrator side): HITL_POLL_INTERVAL_MS (default 2 s).
 * Pause wait max: HITL_PAUSE_MAX_MS (default 30 min); times out with abort.
 */
export declare const HITL_COMMAND_FILE = "hitl.json";
export declare const HITL_STATE_FILE = "hitl-state.json";
export declare const HITL_POLL_INTERVAL_MS = 2000;
export declare const HITL_PAUSE_MAX_MS: number;
export type HitlCommandType = 'pause' | 'resume' | 'unblock' | 'inject' | 'replan' | 'abort';
export interface HitlCommand {
    cmd: HitlCommandType;
    taskId?: string;
    message?: string;
    text?: string;
    timestamp: number;
}
export interface HitlState {
    paused: boolean;
    pausedAt?: number;
    abortPending?: boolean;
    pendingCount?: number;
    updatedAt: number;
}
export declare class HitlQueue {
    private readonly cmdFile;
    private readonly stateFile;
    constructor(stateDir: string);
    /** Enqueue a command from the CLI. */
    push(cmd: Omit<HitlCommand, 'timestamp'>): void;
    /** Drain and return all pending commands, clearing the file. */
    drainAll(): HitlCommand[];
    /** Read the current HITL observer state (paused / abortPending / pendingCount). */
    readState(): HitlState;
    /** True if the run is currently paused. */
    isPaused(): boolean;
    /** Set the paused state. */
    setPaused(paused: boolean): void;
    /** Block until resumed, returns true if run should be aborted. */
    waitForResume(): Promise<boolean>;
    /** Clean up state files at end of run. */
    cleanup(): void;
    private readQueue;
    private writeQueue;
    /**
     * Refresh the observer-facing state file (hitl-state.json) with the current
     * queue length and abort-pending flag, preserving paused/pausedAt. Called from
     * push() (after enqueue) and drainAll() (after clear) so external observers
     * (`roland status`, `roland bg-status`) see pending commands immediately.
     */
    private _updateObserverState;
}
/** Write a HITL command to the queue in the given state directory. */
export declare function writeHitlCommand(stateDir: string, cmd: Omit<HitlCommand, 'timestamp'>): void;
/** Print status of HITL state to stderr. */
export declare function printHitlStatus(stateDir: string): void;
/** Returns true if a run is currently active (not done or error). */
export declare function isRunActive(stateDir: string): boolean;
/** Returns the goal of the current/last run, or null. */
export declare function readRunGoal(stateDir: string): string | null;
//# sourceMappingURL=hitl.d.ts.map