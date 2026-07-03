/**
 * Silent child-process spawning — no visible console windows on Windows/macOS/Linux.
 *
 * Background team missions, MCP launches, and supervisor workers use detached
 * children with ignored stdio (or optional log files under `.roland/logs/`).
 */
import { spawn, fork } from 'child_process';
import fs from 'fs';
import path from 'path';
/** Windows CREATE_NO_WINDOW — belt-and-suspenders alongside windowsHide. */
const CREATE_NO_WINDOW = 0x08000000;
/** Shared spawn/fork flags for hidden background children. */
export function buildSilentSpawnOptions(overrides = {}) {
    const base = {
        detached: overrides.detached ?? true,
        stdio: overrides.stdio ?? ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
        shell: false,
        ...overrides,
    };
    if (process.platform === 'win32') {
        const existing = typeof base.windowsVerbatimArguments === 'boolean'
            ? base.windowsVerbatimArguments
            : false;
        base.windowsVerbatimArguments = existing;
        // Explicit CREATE_NO_WINDOW for GUI-parent spawns (Cursor/Electron MCP host).
        base.detached = overrides.detached ?? true;
        base.creationFlags =
            (base.creationFlags ?? 0) | CREATE_NO_WINDOW;
    }
    return base;
}
/**
 * Spawn a child with no visible terminal window.
 * Unix: detached + unref. Windows: windowsHide + CREATE_NO_WINDOW + detached.
 */
export function spawnSilent(command, args, options = {}) {
    const detached = options.detached ?? true;
    const shouldUnref = options.unref ?? detached;
    let stdio = ['ignore', 'ignore', 'ignore'];
    let logFd;
    if (options.log) {
        const { logFile, logMode = 'a' } = options.log;
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        logFd = fs.openSync(logFile, logMode);
        stdio = ['ignore', logFd, logFd];
    }
    const child = spawn(command, args, buildSilentSpawnOptions({
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        detached,
        stdio,
    }));
    if (logFd !== undefined) {
        fs.closeSync(logFd);
    }
    if (shouldUnref && detached) {
        child.unref();
    }
    return child;
}
/**
 * Spawn an attached child with windowsHide — for test runners and CLI tools
 * where the parent must capture output.
 */
export function spawnHidden(command, args, options = {}) {
    return spawn(command, args ?? [], buildSilentSpawnOptions({
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        shell: options.shell ?? false,
        stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
        detached: false,
        unref: false,
    }));
}
/**
 * Fork a Node module with no visible terminal window — for recipe orchestrator workers.
 */
export function forkSilent(modulePath, args, options = {}) {
    const stdio = options.ipc === false
        ? ['pipe', 'pipe', 'pipe']
        : ['pipe', 'pipe', 'pipe', 'ipc'];
    return fork(modulePath, args ?? [], buildSilentSpawnOptions({
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio,
        detached: false,
    }));
}
//# sourceMappingURL=spawn-silent.js.map