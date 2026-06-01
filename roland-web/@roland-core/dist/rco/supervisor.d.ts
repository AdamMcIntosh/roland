/**
 * Roland Supervisor — true background / detached process mode.
 *
 * Usage (from CLI):
 *   roland team "goal" --background
 *   roland team "goal" --detach
 *   roland run  "goal" --detach      (alias)
 *
 * What it does:
 *   1. Spawns a detached Node.js process that runs the team orchestrator
 *   2. Redirects all output to .roland/logs/bg-<timestamp>.log
 *   3. Writes a PID record to .roland/supervisor.pid
 *   4. Parent process exits immediately
 *   5. Supervisor process auto-restarts on crash (up to MAX_RESTARTS times,
 *      with exponential back-off between attempts)
 *
 * Management commands:
 *   roland bg-status [--json]         Rich status with wave/task/phase progress
 *   roland bg-logs [--lines N]        Tail last N lines of the background log
 *   roland bg-logs --follow           Stream the log live (Ctrl+C to stop)
 *   roland bg-stop                    Gracefully stop (HITL abort → SIGTERM → SIGKILL)
 *
 * Platform notes:
 *   - Works on Windows, macOS, Linux.
 *   - On Windows, process.kill(pid, 0) is used for liveness checks.
 *   - Child processes are fully detached (stdio=ignore, unref()).
 *   - ROLAND_NOTIFY=1 is honoured in background runs even without --notify flag.
 */
export declare const SUPERVISOR_PID_FILE = "supervisor.pid";
export declare const SUPERVISOR_LOG_DIR = "logs";
export interface SupervisorRecord {
    pid: number;
    goal: string;
    startedAt: number;
    logFile: string;
    restarts: number;
}
export declare function isProcessRunning(pid: number): boolean;
export declare function readSupervisorRecord(stateDir: string): SupervisorRecord | null;
export declare function bgStatus(stateDir: string, json?: boolean): void;
export declare function bgLogs(stateDir: string, lines?: number): void;
/**
 * Stream the background log live, printing new content as it is appended.
 * Prints all existing content first, then follows until Ctrl+C.
 */
export declare function bgLogsFollow(stateDir: string): void;
/**
 * Gracefully stop a background run:
 *   1. Write a HITL abort command so the orchestrator exits at wave boundary
 *   2. Wait up to 8 s for the process to exit on its own
 *   3. SIGTERM if still running, then SIGKILL after 3 s
 */
export declare function bgStop(stateDir: string): void;
/**
 * Spawn a fully detached supervisor process and return immediately.
 * The parent writes a PID record and unrefs the child.
 */
export declare function spawnBackground(goal: string, teamArgv: string[], // full argv as passed to runTeamCli, includes 'team' prefix
stateDir: string): Promise<void>;
//# sourceMappingURL=supervisor.d.ts.map