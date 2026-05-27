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

import fs from 'fs';
import path from 'path';

export const HITL_COMMAND_FILE = 'hitl.json';
export const HITL_STATE_FILE   = 'hitl-state.json';
export const HITL_POLL_INTERVAL_MS = 2_000;
export const HITL_PAUSE_MAX_MS     = 30 * 60 * 1000; // 30 min

export type HitlCommandType = 'pause' | 'resume' | 'unblock' | 'inject' | 'replan' | 'abort';

export interface HitlCommand {
  cmd:       HitlCommandType;
  taskId?:   string;   // used by 'unblock'
  message?:  string;   // used by 'unblock', optional human note
  text?:     string;   // used by 'inject' — the directive text
  timestamp: number;
}

export interface HitlState {
  paused:         boolean;
  pausedAt?:      number;
  abortPending?:  boolean;  // NEW — set by CLI when abort is pushed
  pendingCount?:  number;   // NEW — count of commands in the queue
  updatedAt:      number;
}

// ── HitlQueue ─────────────────────────────────────────────────────────────────

export class HitlQueue {
  private readonly cmdFile:   string;
  private readonly stateFile: string;

  constructor(stateDir: string) {
    this.cmdFile   = path.join(stateDir, HITL_COMMAND_FILE);
    this.stateFile = path.join(stateDir, HITL_STATE_FILE);
  }

  // ── CLI side (write) ─────────────────────────────────────────────────────

  /** Enqueue a command from the CLI. */
  push(cmd: Omit<HitlCommand, 'timestamp'>): void {
    const queue = this.readQueue();
    queue.push({ ...cmd, timestamp: Date.now() });
    this.writeQueue(queue);
    this._updateObserverState(cmd.cmd);
  }

  // ── Orchestrator side (read) ─────────────────────────────────────────────

  /** Drain and return all pending commands, clearing the file. */
  drainAll(): HitlCommand[] {
    const queue = this.readQueue();
    if (queue.length > 0) {
      this.writeQueue([]);
      // Clear pendingCount; the queue is now empty so no abort can be pending.
      this._updateObserverState();
    }
    return queue;
  }

  /** Read the current HITL observer state (paused / abortPending / pendingCount). */
  readState(): HitlState {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) as HitlState;
    } catch {
      return { paused: false, updatedAt: 0 };
    }
  }

  /** True if the run is currently paused. */
  isPaused(): boolean {
    try {
      const s = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) as HitlState;
      return s.paused === true;
    } catch {
      return false;
    }
  }

  /** Set the paused state. */
  setPaused(paused: boolean): void {
    const state: HitlState = {
      paused,
      pausedAt: paused ? Date.now() : undefined,
      updatedAt: Date.now(),
    };
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /** Block until resumed, returns true if run should be aborted. */
  async waitForResume(): Promise<boolean> {
    const deadline = Date.now() + HITL_PAUSE_MAX_MS;
    process.stderr.write('[HITL] ⏸  Run paused — send `roland resume` to continue\n');
    process.stderr.write(`[HITL]    Auto-abort after ${HITL_PAUSE_MAX_MS / 60_000} min if not resumed\n`);

    while (Date.now() < deadline) {
      await sleep(HITL_POLL_INTERVAL_MS);
      const cmds = this.drainAll();
      for (const cmd of cmds) {
        if (cmd.cmd === 'resume') {
          this.setPaused(false);
          process.stderr.write('[HITL] ▶  Resuming…\n');
          return false;
        }
        if (cmd.cmd === 'abort') {
          this.setPaused(false);
          process.stderr.write('[HITL] 🛑 Abort received\n');
          return true;
        }
        // Re-queue anything that's not resume/abort (e.g. inject can come in while paused)
        this.push(cmd);
      }
    }

    process.stderr.write('[HITL] ⏰ Pause timeout — aborting run\n');
    this.setPaused(false);
    return true; // abort
  }

  /** Clean up state files at end of run. */
  cleanup(): void {
    for (const f of [this.cmdFile, this.stateFile]) {
      try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private readQueue(): HitlCommand[] {
    try {
      return JSON.parse(fs.readFileSync(this.cmdFile, 'utf-8')) as HitlCommand[];
    } catch {
      return [];
    }
  }

  private writeQueue(queue: HitlCommand[]): void {
    fs.mkdirSync(path.dirname(this.cmdFile), { recursive: true });
    fs.writeFileSync(this.cmdFile, JSON.stringify(queue, null, 2), 'utf-8');
  }

  /**
   * Refresh the observer-facing state file (hitl-state.json) with the current
   * queue length and abort-pending flag, preserving paused/pausedAt. Called from
   * push() (after enqueue) and drainAll() (after clear) so external observers
   * (`roland status`, `roland bg-status`) see pending commands immediately.
   */
  private _updateObserverState(cmd?: HitlCommandType): void {
    const queue = this.readQueue();
    let existing: HitlState = { paused: false, updatedAt: 0 };
    try {
      existing = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) as HitlState;
    } catch { /* no existing state — fine */ }
    const hasAbortQueued = queue.some((c) => c.cmd === 'abort');
    const next: HitlState = {
      ...existing,
      abortPending: hasAbortQueued || (cmd === 'abort'),
      pendingCount: queue.length,
      updatedAt: Date.now(),
    };
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(next, null, 2), 'utf-8');
  }
}

// ── CLI helpers (used by index.ts command handlers) ───────────────────────────

/** Write a HITL command to the queue in the given state directory. */
export function writeHitlCommand(stateDir: string, cmd: Omit<HitlCommand, 'timestamp'>): void {
  const q = new HitlQueue(stateDir);
  q.push(cmd);
}

/** Print status of HITL state to stderr. */
export function printHitlStatus(stateDir: string): void {
  const q = new HitlQueue(stateDir);
  const stateFile = path.join(stateDir, HITL_STATE_FILE);
  const cmdFile   = path.join(stateDir, HITL_COMMAND_FILE);

  let paused = false;
  let pausedAt: number | undefined;
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as HitlState;
    paused   = s.paused;
    pausedAt = s.pausedAt;
  } catch { /* no state */ }

  let queueLen = 0;
  try {
    const arr = JSON.parse(fs.readFileSync(cmdFile, 'utf-8')) as HitlCommand[];
    queueLen = arr.length;
  } catch { /* no file */ }

  process.stderr.write(`HITL state:\n`);
  process.stderr.write(`  Paused:  ${paused}${pausedAt ? ` (since ${new Date(pausedAt).toLocaleTimeString()})` : ''}\n`);
  process.stderr.write(`  Pending commands: ${queueLen}\n`);
}

/** Returns true if a run is currently active (not done or error). */
export function isRunActive(stateDir: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(stateDir, 'run-state.json'), 'utf-8');
    const st  = JSON.parse(raw) as { status: string };
    return st.status !== 'done' && st.status !== 'error';
  } catch {
    return false;
  }
}

/** Returns the goal of the current/last run, or null. */
export function readRunGoal(stateDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir, 'run-state.json'), 'utf-8');
    const st  = JSON.parse(raw) as { goal?: string };
    return st.goal ?? null;
  } catch {
    return null;
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
