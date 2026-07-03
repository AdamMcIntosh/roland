/**
 * Cursor SDK process limits and agent/run cleanup.
 *
 * Team runs create many short-lived Agent instances. Without disposal, abort
 * listeners accumulate on shared EventTargets and shell child processes may
 * linger after timeout — triggering MaxListenersExceededWarning and
 * "[shell-exec] Close event did not fire within 5000ms".
 */
/** SDK shell-exec teardown warning — noisy during dotnet/vitest runs; safe to suppress. */
export declare const SHELL_EXEC_CLOSE_WARNING_RE: RegExp;
export declare function isShellExecCloseWarning(text: string): boolean;
/** Suppress the SDK shell-exec close-timeout warning on console + stderr. */
export declare function installShellExecWarningSilencer(): void;
/** Scoped stderr filter for team runs — returns a restore function. */
export declare function createShellExecStderrFilter(): () => void;
/** Raise the process-wide EventTarget default before any SDK code runs. */
export declare function configureSdkProcessLimits(): void;
/** Default settle ms (env-overridable). */
export declare function getDefaultSdkSettleMs(): number;
/** Default heavy-task settle ms (env-overridable). */
export declare function getHeavySdkSettleMs(): number;
export interface SdkAgentLocalOptions {
    cwd: string;
    settingSources?: readonly ('project' | 'user')[];
    /** When set, prefer detached shell children with ignored stdio (test runners). */
    shellExec?: {
        stdio?: 'ignore' | 'pipe';
        detached?: boolean;
    };
}
/** Local Agent.create options — all agents use silent shell children (no visible windows). */
export declare function resolveSdkAgentLocalOptions(_agentName: string, base: SdkAgentLocalOptions): SdkAgentLocalOptions;
/**
 * Pick settle duration — longer for test runners and shell-heavy task text.
 */
export declare function resolveSdkSettleMs(agentName: string, taskContext?: string): number;
/** Minimal run handle for cancel-on-cleanup without importing @cursor/sdk types. */
export interface SdkRunHandle {
    status?: string;
    cancel?: () => Promise<void>;
    wait?: () => Promise<SdkRunResult>;
}
export interface SdkRunResult {
    status?: string;
    result?: string;
}
/** Minimal agent handle for async disposal without importing @cursor/sdk types. */
export interface SdkAgentHandle {
    close?: () => void;
    [Symbol.asyncDispose]?: () => Promise<void>;
}
export interface CleanupSdkSessionOptions {
    settleMs?: number;
    agentName?: string;
}
export interface ForceKillResult {
    forced: boolean;
    killedPids: number[];
}
export declare class SdkAgentTimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(agentName: string, timeoutMs: number);
}
/**
 * After settle, SIGKILL any lingering shell child processes still referenced by the agent.
 */
export declare function forceKillAfterSettle(agent: SdkAgentHandle | unknown | undefined | null, opts?: {
    agentName?: string;
}): Promise<ForceKillResult>;
/**
 * Wait until the run is no longer "running" (poll + aggressive wait() drain).
 * Returns true when the run reached a terminal status before the deadline.
 */
export declare function waitForRunTerminal(run: SdkRunHandle | undefined | null, timeoutMs?: number): Promise<boolean>;
/**
 * Cancel a run that is still active (timeout, error, or early exit).
 * Safe to call after successful completion unless `force` is set.
 */
export declare function cancelSdkRun(run: SdkRunHandle | undefined | null, opts?: {
    force?: boolean;
}): Promise<void>;
/**
 * Yield after a terminal run so shell-exec child "close" handlers can
 * finish before the local executor lease is released.
 */
export declare function settleSdkRun(run: SdkRunHandle | undefined | null, opts?: {
    settleMs?: number;
}): Promise<void>;
/**
 * Wait for an SDK run, with optional wall-clock timeout and heartbeat logging.
 * On timeout: cancels the run, drains wait(), then rethrows SdkAgentTimeoutError.
 */
export declare function waitForSdkRun(run: SdkRunHandle & {
    wait: () => Promise<SdkRunResult>;
}, options?: {
    timeoutMs?: number;
    agentName?: string;
    onHeartbeat?: (elapsedMs: number) => void;
    heartbeatIntervalMs?: number;
}): Promise<SdkRunResult>;
/**
 * Release SDK agent resources (abort listeners, shell/exec handles, local store).
 * Prefers Symbol.asyncDispose; falls back to close().
 */
export declare function disposeSdkAgent(agent: SdkAgentHandle | undefined | null): Promise<void>;
/** Cancel / settle / force-kill lingering children / dispose. */
export declare function cleanupSdkSession(agent: SdkAgentHandle | undefined | null, run: SdkRunHandle | undefined | null, opts?: CleanupSdkSessionOptions): Promise<ForceKillResult>;
//# sourceMappingURL=sdk-lifecycle.d.ts.map