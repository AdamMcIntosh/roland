/**
 * Cursor SDK process limits and agent/run cleanup.
 *
 * Team runs create many short-lived Agent instances. Without disposal, abort
 * listeners accumulate on shared EventTargets and shell child processes may
 * linger after timeout — triggering MaxListenersExceededWarning and
 * "[shell-exec] Close event did not fire within 5000ms".
 */

import { setMaxListeners } from 'events';

let processLimitsConfigured = false;

/** Poll interval while waiting for a run to leave the "running" state. */
const RUN_TERMINAL_POLL_MS = 50;

/** Max time to wait for cancel / terminal status before disposing the agent. */
const RUN_TERMINAL_WAIT_MS = Number(process.env.ROLAND_SDK_TERMINAL_WAIT_MS) || 30_000;

/**
 * Brief pause after a run reaches a terminal state so shell-exec can emit
 * "close" (exit→close gap) before the local executor is disposed.
 */
const SDK_SETTLE_MS = Number(process.env.ROLAND_SDK_SETTLE_MS) || 250;

/** Raise the process-wide EventTarget default before any SDK code runs. */
export function configureSdkProcessLimits(): void {
  if (processLimitsConfigured) return;
  processLimitsConfigured = true;
  // 0 = unlimited — final guard against MaxListenersExceededWarning during long team runs.
  setMaxListeners(0);
}

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

export class SdkAgentTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(agentName: string, timeoutMs: number) {
    super(
      `Agent "${agentName}" timed out after ${(timeoutMs / 60_000).toFixed(0)} min. ` +
      'Raise the limit with ROLAND_AGENT_TIMEOUT_MS (ms).',
    );
    this.name = 'SdkAgentTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

function isTerminalRunStatus(status: string | undefined): boolean {
  return status === 'finished' || status === 'error' || status === 'cancelled';
}

/**
 * Wait until the run is no longer "running" (poll + optional wait() drain).
 */
export async function waitForRunTerminal(
  run: SdkRunHandle | undefined | null,
  timeoutMs = RUN_TERMINAL_WAIT_MS,
): Promise<void> {
  if (!run) return;

  const deadline = Date.now() + timeoutMs;
  while (run.status === 'running' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, RUN_TERMINAL_POLL_MS));
  }

  if (run.status === 'running' && run.wait) {
    try {
      await run.wait();
    } catch {
      // Cancelled or aborted while draining — terminal enough for cleanup.
    }
  }
}

/**
 * Cancel a run that is still active (timeout, error, or early exit).
 * Safe to call after successful completion unless `force` is set.
 */
export async function cancelSdkRun(
  run: SdkRunHandle | undefined | null,
  opts?: { force?: boolean },
): Promise<void> {
  if (!run?.cancel) return;
  if (isTerminalRunStatus(run.status) && !opts?.force) return;

  try {
    await run.cancel();
  } catch {
    // Run may have finished concurrently between the status check and cancel().
  }

  await waitForRunTerminal(run);
}

/**
 * Yield briefly after a terminal run so shell-exec child "close" handlers can
 * finish before the local executor lease is released.
 */
export async function settleSdkRun(run: SdkRunHandle | undefined | null): Promise<void> {
  if (!run) return;
  await waitForRunTerminal(run);
  if (SDK_SETTLE_MS > 0) {
    await new Promise((r) => setTimeout(r, SDK_SETTLE_MS));
  }
}

/**
 * Wait for an SDK run, with optional wall-clock timeout and heartbeat logging.
 * On timeout: cancels the run, drains wait(), then rethrows SdkAgentTimeoutError.
 */
export async function waitForSdkRun(
  run: SdkRunHandle & { wait: () => Promise<SdkRunResult> },
  options: {
    timeoutMs?: number;
    agentName?: string;
    onHeartbeat?: (elapsedMs: number) => void;
    heartbeatIntervalMs?: number;
  } = {},
): Promise<SdkRunResult> {
  const start = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  if (options.onHeartbeat && options.heartbeatIntervalMs) {
    heartbeat = setInterval(() => {
      options.onHeartbeat!(Date.now() - start);
    }, options.heartbeatIntervalMs);
  }

  const runWait = run.wait().then((result) => {
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  });

  try {
    if (options.timeoutMs && options.timeoutMs > 0) {
      return await Promise.race([
        runWait,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            reject(new SdkAgentTimeoutError(options.agentName ?? 'agent', options.timeoutMs!));
          }, options.timeoutMs);
        }),
      ]);
    }
    return await runWait;
  } catch (err) {
    if (timedOut || err instanceof SdkAgentTimeoutError) {
      await cancelSdkRun(run, { force: true });
      try {
        await run.wait();
      } catch {
        // Draining after cancel — ignore secondary errors.
      }
    }
    throw err;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (timeoutId) clearTimeout(timeoutId);
    // If timeout won the race, the first wait() may still reject later.
    if (timedOut) runWait.catch(() => {});
  }
}

/**
 * Release SDK agent resources (abort listeners, shell/exec handles, local store).
 * Prefers Symbol.asyncDispose; falls back to close().
 */
export async function disposeSdkAgent(agent: SdkAgentHandle | undefined | null): Promise<void> {
  if (!agent) return;

  try {
    const asyncDispose = agent[Symbol.asyncDispose];
    if (typeof asyncDispose === 'function') {
      await asyncDispose.call(agent);
      return;
    }
    agent.close?.();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Roland] SDK agent dispose warning: ${msg}`);
  }
}

/** Cancel / settle an in-flight run, then dispose its agent. */
export async function cleanupSdkSession(
  agent: SdkAgentHandle | undefined | null,
  run: SdkRunHandle | undefined | null,
): Promise<void> {
  await cancelSdkRun(run);
  await settleSdkRun(run);
  await disposeSdkAgent(agent);
}
