/**
 * ## Assumptions
 * - Between-iterations commands run via the same CommandRunner as TestExecutor (shell, injectable).
 * - Output is truncated for storage; full tail preserved in loop memory artifacts.
 * - Failures are non-fatal — the loop records the result and exit conditions decide whether to continue.
 */

import type { CommandRunner } from './verification/index.js';
import type { LoopMemory, BetweenIterationRun } from './loop-memory.js';

export interface BetweenIterationsOptions {
  command: string;
  iteration: number;
  cwd?: string;
  timeoutMs?: number;
  runner?: CommandRunner;
  memory: LoopMemory;
}

export interface BetweenIterationsResult {
  run: BetweenIterationRun;
  success: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function logBetween(msg: string, detail?: Record<string, unknown>): void {
  const line = `[Loop][between-iter] ${msg}`;
  if (detail && Object.keys(detail).length > 0) {
    console.error(line, detail);
  } else {
    console.error(line);
  }
}

/**
 * Run the template's between-iterations check command and persist results to LoopMemory.
 */
export async function runBetweenIterations(
  opts: BetweenIterationsOptions,
): Promise<BetweenIterationsResult> {
  const startedAt = Date.now();
  const cwd = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runner = opts.runner;

  logBetween('running check command', { iteration: opts.iteration, command: opts.command });

  let exitCode: number | null = 1;
  let stdout = '';
  let stderr = '';
  let timedOut = false;

  if (!runner) {
    stderr = 'No command runner configured';
  } else {
    try {
      const result = await runner(opts.command, { cwd, timeoutMs });
      exitCode = result.exitCode;
      stdout = result.stdout;
      stderr = result.stderr;
      timedOut = Boolean(result.timedOut);
    } catch (err) {
      stderr = err instanceof Error ? err.message : String(err);
      exitCode = 1;
    }
  }

  const durationMs = Date.now() - startedAt;
  const run: BetweenIterationRun = {
    iteration: opts.iteration,
    command: opts.command,
    exitCode,
    stdout: stdout.slice(-8000),
    stderr: stderr.slice(-4000),
    timedOut,
    at: startedAt,
    durationMs,
  };

  opts.memory.recordBetweenIteration(run);

  logBetween('check complete', {
    iteration: opts.iteration,
    exitCode,
    durationMs,
    success: exitCode === 0 && !timedOut,
  });

  return {
    run,
    success: exitCode === 0 && !timedOut,
  };
}

/**
 * ## Loop Integration Complete
 * Between-iterations commands implement the loops.elorm.xyz self-pacing pattern —
 * run a check after each pass, read output, continue only if exit conditions are unmet.
 */
