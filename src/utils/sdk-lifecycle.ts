/**
 * Cursor SDK process limits and agent/run cleanup.
 *
 * Team runs create many short-lived Agent instances. Without disposal, abort
 * listeners accumulate on shared EventTargets and shell child processes may
 * linger after timeout — triggering MaxListenersExceededWarning and
 * "[shell-exec] Close event did not fire within 5000ms".
 */

import { EventEmitter, setMaxListeners } from 'events';

let processLimitsConfigured = false;

/** Poll interval while waiting for a run to leave the "running" state. */
const RUN_TERMINAL_POLL_MS = 50;

/** Max time to wait for cancel / terminal status before disposing the agent. */
const RUN_TERMINAL_WAIT_MS = Number(process.env.ROLAND_SDK_TERMINAL_WAIT_MS) || 30_000;

/**
 * Pause after a run reaches a terminal state so shell-exec can emit
 * "close" (exit→close gap) before the local executor is disposed.
 * Override with ROLAND_SDK_SETTLE_MS (ms); default 3500.
 */
const SDK_SETTLE_MS = Number(process.env.ROLAND_SDK_SETTLE_MS) || 3_500;

/**
 * Longer settle for agents/tasks that spawn many shell children (tests, builds).
 * Override with ROLAND_SDK_HEAVY_SETTLE_MS (ms); default 8000.
 */
const SDK_HEAVY_SETTLE_MS = Number(process.env.ROLAND_SDK_HEAVY_SETTLE_MS) || 8_000;

/** Extra drain window when wait() is called on an already-terminal run. */
const TERMINAL_DRAIN_MS = Number(process.env.ROLAND_SDK_TERMINAL_DRAIN_MS) || 2_000;

/** SDK shell-exec teardown warning — noisy during dotnet/vitest runs; safe to suppress. */
export const SHELL_EXEC_CLOSE_WARNING_RE =
  /\[shell-exec\]\s*Close event did not fire within \d+ms/i;

export function isShellExecCloseWarning(text: string): boolean {
  return SHELL_EXEC_CLOSE_WARNING_RE.test(text);
}

function chunkToText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf8');
  return String(chunk);
}

function argsToText(args: unknown[]): string {
  return args.map((a) => chunkToText(a)).join(' ');
}

let shellExecSilencerInstalled = false;

/** Suppress the SDK shell-exec close-timeout warning on console + stderr. */
export function installShellExecWarningSilencer(): void {
  if (shellExecSilencerInstalled) return;
  shellExecSilencerInstalled = true;

  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  console.warn = (...args: unknown[]) => {
    if (isShellExecCloseWarning(argsToText(args))) return;
    origWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    if (isShellExecCloseWarning(argsToText(args))) return;
    origError(...args);
  };

  (process.stderr as NodeJS.WriteStream).write = (
    chunk: unknown,
    encodingOrCb?: unknown,
    cb?: unknown,
  ): boolean => {
    if (isShellExecCloseWarning(chunkToText(chunk))) {
      if (typeof encodingOrCb === 'function') (encodingOrCb as () => void)();
      else if (typeof cb === 'function') (cb as () => void)();
      return true;
    }
    return (origStderrWrite as (c: unknown, e?: unknown, c2?: unknown) => boolean)(
      chunk,
      encodingOrCb,
      cb,
    );
  };
}

/** Scoped stderr filter for team runs — returns a restore function. */
export function createShellExecStderrFilter(): () => void {
  const origWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as NodeJS.WriteStream).write = (
    chunk: unknown,
    encodingOrCb?: unknown,
    cb?: unknown,
  ): boolean => {
    if (isShellExecCloseWarning(chunkToText(chunk))) {
      if (typeof encodingOrCb === 'function') (encodingOrCb as () => void)();
      else if (typeof cb === 'function') (cb as () => void)();
      return true;
    }
    return (origWrite as (c: unknown, e?: unknown, c2?: unknown) => boolean)(
      chunk,
      encodingOrCb,
      cb,
    );
  };
  return () => {
    (process.stderr as NodeJS.WriteStream).write = origWrite as typeof process.stderr.write;
  };
}

/** Raise the process-wide EventTarget default before any SDK code runs. */
export function configureSdkProcessLimits(): void {
  if (processLimitsConfigured) return;
  processLimitsConfigured = true;
  // 0 = unlimited — guard against MaxListenersExceededWarning during long team runs.
  setMaxListeners(0);
  EventEmitter.defaultMaxListeners = 0;
  if (typeof process.setMaxListeners === 'function') {
    process.setMaxListeners(0);
  }
  installShellExecWarningSilencer();
}

/** Default settle ms (env-overridable). */
export function getDefaultSdkSettleMs(): number {
  return SDK_SETTLE_MS;
}

/** Default heavy-task settle ms (env-overridable). */
export function getHeavySdkSettleMs(): number {
  return SDK_HEAVY_SETTLE_MS;
}

const SHELL_EXEC_HEAVY_AGENTS =
  /test-author|test-executor|tdd-guide|build-fixer|test-executor|qa-tester/i;

const SHELL_EXEC_HEAVY_CONTEXT =
  /\b(npm test|npm run test|vitest|jest|pytest|cargo test|go test|dotnet test|make test|shell|exec|compile|build)\b/i;

export interface SdkAgentLocalOptions {
  cwd: string;
  settingSources?: readonly ('project' | 'user')[];
  /** When set, prefer detached shell children with ignored stdio (test runners). */
  shellExec?: { stdio?: 'ignore' | 'pipe'; detached?: boolean };
}

/** Local Agent.create options — shell-heavy agents get detached/ignore stdio when supported. */
export function resolveSdkAgentLocalOptions(
  agentName: string,
  base: SdkAgentLocalOptions,
): SdkAgentLocalOptions {
  if (!SHELL_EXEC_HEAVY_AGENTS.test(agentName)) return base;
  return {
    ...base,
    shellExec: { stdio: 'ignore', detached: true },
  };
}

/**
 * Pick settle duration — longer for test runners and shell-heavy task text.
 */
export function resolveSdkSettleMs(agentName: string, taskContext?: string): number {
  const agentHeavy = SHELL_EXEC_HEAVY_AGENTS.test(agentName);
  const contextHeavy = Boolean(taskContext && SHELL_EXEC_HEAVY_CONTEXT.test(taskContext));
  if (agentHeavy || contextHeavy) {
    return Math.max(SDK_SETTLE_MS, SDK_HEAVY_SETTLE_MS);
  }
  return SDK_SETTLE_MS;
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

export interface CleanupSdkSessionOptions {
  settleMs?: number;
  agentName?: string;
}

export interface ForceKillResult {
  forced: boolean;
  killedPids: number[];
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

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** SIGKILL a pid; on Unix also attempt the entire process group (-pid). */
function killProcessAggressive(pid: number): boolean {
  if (!isProcessAlive(pid)) return false;

  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
      return true;
    } catch {
      // pid may not be a group leader — fall through to direct kill.
    }
  }

  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk an SDK agent/run object graph and collect live child PIDs (best-effort).
 */
function collectChildPids(root: unknown, seen = new Set<object>(), depth = 0): number[] {
  if (!root || typeof root !== 'object' || depth > 8) return [];
  if (seen.has(root as object)) return [];
  seen.add(root as object);

  const pids: number[] = [];
  const obj = root as Record<string, unknown>;

  const childProcess = obj.childProcess;
  if (childProcess && typeof childProcess === 'object') {
    const cp = childProcess as { pid?: number; killed?: boolean };
    if (typeof cp.pid === 'number' && cp.pid > 0 && cp.pid !== process.pid && !cp.killed) {
      pids.push(cp.pid);
    }
    pids.push(...collectChildPids(childProcess, seen, depth + 1));
  }

  // Only collect bare `pid` fields on objects that look like ChildProcess handles.
  if (
    typeof obj.pid === 'number' &&
    obj.pid > 0 &&
    obj.pid !== process.pid &&
    ('killed' in obj || 'stdin' in obj || 'stdout' in obj || 'stderr' in obj)
  ) {
    const killed = (obj as { killed?: boolean }).killed;
    if (!killed) pids.push(obj.pid);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      pids.push(...collectChildPids(value, seen, depth + 1));
    }
  }

  return [...new Set(pids)];
}

/**
 * After settle, SIGKILL any lingering shell child processes still referenced by the agent.
 */
export async function forceKillAfterSettle(
  agent: SdkAgentHandle | unknown | undefined | null,
  opts?: { agentName?: string },
): Promise<ForceKillResult> {
  if (!agent) return { forced: false, killedPids: [] };

  const candidates = collectChildPids(agent);
  const killedPids: number[] = [];

  for (const pid of candidates) {
    if (killProcessAggressive(pid)) {
      killedPids.push(pid);
    }
  }

  if (killedPids.length > 0) {
    const who = opts?.agentName ? ` (${opts.agentName})` : '';
    const groupNote = process.platform !== 'win32' ? ' (process group when possible)' : '';
    console.error(
      `[Roland] Force cleanup${who}: SIGKILL${groupNote} on ${killedPids.length} lingering shell child process(es) — pids=${killedPids.join(', ')}`,
    );
    // Brief pause so the SDK shell-exec layer can observe the kill.
    await new Promise((r) => setTimeout(r, 250));
  }

  return { forced: killedPids.length > 0, killedPids };
}

/**
 * Wait until the run is no longer "running" (poll + aggressive wait() drain).
 * Returns true when the run reached a terminal status before the deadline.
 */
export async function waitForRunTerminal(
  run: SdkRunHandle | undefined | null,
  timeoutMs = RUN_TERMINAL_WAIT_MS,
): Promise<boolean> {
  if (!run) return true;

  const deadline = Date.now() + timeoutMs;
  let drained = false;

  while (run.status === 'running' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, RUN_TERMINAL_POLL_MS));
  }

  const drainWithTimeout = async (budgetMs: number): Promise<void> => {
    if (!run.wait || budgetMs <= 0) return;
    try {
      await Promise.race([
        run.wait().then(() => {
          drained = true;
        }),
        new Promise<void>((r) => setTimeout(r, budgetMs)),
      ]);
    } catch {
      drained = true;
    }
  };

  if (run.status === 'running') {
    await drainWithTimeout(Math.max(100, deadline - Date.now()));
  }

  // Terminal status but wait() may still be draining shell-exec teardown.
  if (!drained && run.wait && isTerminalRunStatus(run.status)) {
    await drainWithTimeout(TERMINAL_DRAIN_MS);
  }

  // Last resort: one more short wait() race if status flipped during drain.
  if (run.status === 'running' && run.wait && Date.now() < deadline) {
    await drainWithTimeout(Math.max(50, deadline - Date.now()));
  }

  return run.status !== 'running';
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
 * Yield after a terminal run so shell-exec child "close" handlers can
 * finish before the local executor lease is released.
 */
export async function settleSdkRun(
  run: SdkRunHandle | undefined | null,
  opts?: { settleMs?: number },
): Promise<void> {
  if (!run) return;
  await waitForRunTerminal(run);
  const settleMs = opts?.settleMs ?? SDK_SETTLE_MS;
  if (settleMs > 0) {
    await new Promise((r) => setTimeout(r, settleMs));
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

/** Cancel / settle / force-kill lingering children / dispose. */
export async function cleanupSdkSession(
  agent: SdkAgentHandle | undefined | null,
  run: SdkRunHandle | undefined | null,
  opts?: CleanupSdkSessionOptions,
): Promise<ForceKillResult> {
  await cancelSdkRun(run);
  await settleSdkRun(run, { settleMs: opts?.settleMs });
  const killResult = await forceKillAfterSettle(agent, { agentName: opts?.agentName });
  await disposeSdkAgent(agent);
  return killResult;
}
