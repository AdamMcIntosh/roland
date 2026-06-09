/**
 * Silent child-process spawning — no visible console windows on Windows/macOS/Linux.
 *
 * Background team missions, MCP launches, and supervisor workers use detached
 * children with ignored stdio (or optional log files under `.roland/logs/`).
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import fs from 'fs';
import path from 'path';

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

/**
 * Spawn a child with no visible terminal window.
 * Unix: detached + unref. Windows: windowsHide + detached.
 */
export function spawnSilent(
  command: string,
  args: string[],
  options: SpawnSilentOptions = {},
): ChildProcess {
  const detached = options.detached ?? true;
  const shouldUnref = options.unref ?? detached;

  let stdio: SpawnOptions['stdio'] = ['ignore', 'ignore', 'ignore'];
  let logFd: number | undefined;

  if (options.log) {
    const { logFile, logMode = 'a' } = options.log;
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    logFd = fs.openSync(logFile, logMode);
    stdio = ['ignore', logFd, logFd];
  }

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    detached,
    stdio,
    windowsHide: true,
    shell: false,
  });

  if (logFd !== undefined) {
    fs.closeSync(logFd);
  }

  if (shouldUnref && detached) {
    child.unref();
  }

  return child;
}

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
export function spawnHidden(
  command: string,
  args?: string[],
  options: SpawnHiddenOptions = {},
): ChildProcess {
  return spawn(command, args ?? [], {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    shell: options.shell ?? false,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}
