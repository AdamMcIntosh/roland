/**
 * Silent child-process spawning — no visible console windows on Windows/macOS/Linux.
 *
 * Background team missions, MCP launches, and supervisor workers use detached
 * children with ignored stdio (or optional log files under `.roland/logs/`).
 */
import { type ChildProcess, type ForkOptions, type SpawnOptions } from 'child_process';
export interface SpawnSilentLogOptions {
    /** Redirect stdout/stderr to this file. */
    logFile: string;
    /** Append (default) or truncate before writing. */
    logMode?: 'a' | 'w';
}
export interface SpawnSilentOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    /** When set, stdout/stderr go to the log file instead of being ignored. */
    log?: SpawnSilentLogOptions;
    /** Detach from parent (default true). */
    detached?: boolean;
    /** Unref after spawn so parent can exit (default true when detached). */
    unref?: boolean;
}
/** Shared spawn/fork flags for hidden background children. */
export declare function buildSilentSpawnOptions(overrides?: SpawnOptions & ForkOptions): SpawnOptions & ForkOptions;
/**
 * Spawn a child with no visible terminal window.
 * Unix: detached + unref. Windows: windowsHide + CREATE_NO_WINDOW + detached.
 */
export declare function spawnSilent(command: string, args: string[], options?: SpawnSilentOptions): ChildProcess;
/** Spawn options for attached children that need piped stdout/stderr (no visible window). */
export interface SpawnHiddenOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    shell?: boolean;
    stdio?: SpawnOptions['stdio'];
}
/**
 * Spawn an attached child with windowsHide — for test runners and CLI tools
 * where the parent must capture output.
 */
export declare function spawnHidden(command: string, args?: string[], options?: SpawnHiddenOptions): ChildProcess;
export interface ForkSilentOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    /** IPC channel (default true for fork). */
    ipc?: boolean;
}
/**
 * Fork a Node module with no visible terminal window — for recipe orchestrator workers.
 */
export declare function forkSilent(modulePath: string, args?: string[], options?: ForkSilentOptions): ChildProcess;
//# sourceMappingURL=spawn-silent.d.ts.map