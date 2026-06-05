/**
 * Cursor SDK process limits and agent/run cleanup.
 *
 * Team runs create many short-lived Agent instances. Without disposal, abort
 * listeners accumulate on shared EventTargets and shell child processes may
 * linger after timeout — triggering MaxListenersExceededWarning and
 * "[shell-exec] Close event did not fire within 5000ms".
 */

import { setMaxListeners } from 'events';

const DEFAULT_MAX_LISTENERS = 50;

let processLimitsConfigured = false;

/** Raise the process-wide EventTarget default before any SDK code runs. */
export function configureSdkProcessLimits(maxListeners = DEFAULT_MAX_LISTENERS): void {
  if (processLimitsConfigured) return;
  processLimitsConfigured = true;
  setMaxListeners(maxListeners);
}

/** Minimal run handle for cancel-on-cleanup without importing @cursor/sdk types. */
export interface SdkRunHandle {
  status?: string;
  cancel?: () => Promise<void>;
}

/** Minimal agent handle for async disposal without importing @cursor/sdk types. */
export interface SdkAgentHandle {
  close?: () => void;
  [Symbol.asyncDispose]?: () => Promise<void>;
}

/**
 * Cancel a run that is still active (timeout, error, or early exit).
 * Safe to call after successful completion — errors are swallowed.
 */
export async function cancelSdkRun(run: SdkRunHandle | undefined | null): Promise<void> {
  if (!run?.cancel) return;
  if (
    run.status === 'finished'
    || run.status === 'error'
    || run.status === 'cancelled'
  ) {
    return;
  }
  try {
    await run.cancel();
  } catch {
    // Run may have finished concurrently between the status check and cancel().
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

/** Cancel an in-flight run, then dispose its agent. */
export async function cleanupSdkSession(
  agent: SdkAgentHandle | undefined | null,
  run: SdkRunHandle | undefined | null,
): Promise<void> {
  await cancelSdkRun(run);
  await disposeSdkAgent(agent);
}
