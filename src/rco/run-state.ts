/**
 * RunState — persists real-time orchestrator state to .roland/run-state.json.
 *
 * Written by the orchestrator (via RunStateWriter) during every lifecycle event.
 * Read by the TUI renderer and `roland status` observer.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const RUN_STATE_FILE = 'run-state.json';

export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'blocked';
export type RunStatus = 'planning' | 'running' | 'reviewing' | 'synthesizing' | 'done' | 'error';

/** Loop Engineering phase — mirrors src/loop-engine/loop-phases.ts */
export type LoopPhase =
  | 'plan'
  | 'act'
  | 'verify'
  | 'critique'
  | 'retry'
  | 'observe';

/** Git branch / PR metadata for executor tasks (populated by task-git-workflow). */
export interface TaskGitState {
  branch?: string;
  phase?: string;
  statusLabel?: string;
  prUrl?: string;
  prNumber?: number;
}

export interface TaskRunState {
  id: string;
  title: string;
  agent: string;
  wave: number;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  hadBlocker?: boolean;
  /** Last 300 chars of agent output, set on completion. */
  outputPreview?: string;
  /** Branch / PR workflow state when task is an executor. */
  git?: TaskGitState;
}

export interface RunState {
  runId: string;
  goal: string;
  startedAt: number;
  updatedAt: number;
  status: RunStatus;
  currentWave: number;
  totalTasks: number;
  completedTasks: number;
  tasks: TaskRunState[];
  /** IDs of tasks currently executing (used to drive activity indicator). */
  activeTaskIds: string[];
  pmNotes?: string;
  errorMessage?: string;
  /** True while run is paused via `roland pause`. Updated by orchestrator. */
  hitlPaused?: boolean;
  /** True after `roland abort` is queued, before it is processed. */
  hitlAbortPending?: boolean;
  /** Set when the wave circuit breaker opens due to connection errors. */
  connectionDropped?: boolean;
  /** Human-readable detail about the connection drop (wave, agent count, etc.). */
  connectionDropMessage?: string;
  /** Active loop template id when Loop Engineering is enabled. */
  loopTemplateId?: string;
  /** Current loop phase (dashboard observability). */
  loopPhase?: LoopPhase;
  /** Outer loop iteration counter. */
  loopIteration?: number;
  /** Last verification gate result. */
  lastVerification?: {
    pass: boolean;
    summary: string;
    at: number;
    durationMs?: number;
    strategies?: Array<{
      type: string;
      pass: boolean;
      durationMs: number;
      failures?: string[];
    }>;
  };
}

// ── Writer (used by team-cli / orchestrator callbacks) ────────────────────────

export class RunStateWriter {
  private state: RunState;
  private readonly filePath: string;

  constructor(stateDir: string, goal: string) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, RUN_STATE_FILE);
    this.state = {
      runId: randomUUID().slice(0, 8),
      goal,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'planning',
      currentWave: 0,
      totalTasks: 0,
      completedTasks: 0,
      tasks: [],
      activeTaskIds: [],
    };
    this.flush();
  }

  planReady(tasks: Array<{ id: string; title: string; agent: string }>): void {
    // totalTasks / completedTasks are recomputed from this.state.tasks in flush().
    this.state.tasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      agent: t.agent,
      wave: 0,
      status: 'pending',
    }));
    this.state.status = 'running';
    this.flush();
  }

  waveStart(waveNumber: number, taskIds: string[]): void {
    this.state.currentWave = waveNumber;
    this.state.status = 'running';
    for (const task of this.state.tasks) {
      if (taskIds.includes(task.id) && task.status === 'pending') {
        task.wave = waveNumber;
      }
    }
    this.flush();
  }

  taskStart(id: string, git?: TaskGitState): void {
    const task = this.state.tasks.find((t) => t.id === id);
    if (task) {
      task.status = 'running';
      task.startedAt = Date.now();
      if (git) task.git = { ...task.git, ...git };
    }
    if (!this.state.activeTaskIds.includes(id)) {
      this.state.activeTaskIds.push(id);
    }
    this.flush();
  }

  taskComplete(id: string, output: string, hadBlocker: boolean, git?: TaskGitState): void {
    const task = this.state.tasks.find((t) => t.id === id);
    if (task) {
      task.status = hadBlocker ? 'blocked' : 'done';
      task.completedAt = Date.now();
      task.hadBlocker = hadBlocker;
      const preview = output.replace(/\n{3,}/g, '\n\n').trim();
      task.outputPreview = preview.length > 300 ? '…' + preview.slice(-297) : preview;
      if (git) task.git = { ...task.git, ...git };
    }
    this.state.activeTaskIds = this.state.activeTaskIds.filter((a) => a !== id);
    // completedTasks is recomputed from task statuses in flush() — no manual increment.
    this.flush();
  }

  taskGitUpdate(id: string, git: TaskGitState): void {
    const task = this.state.tasks.find((t) => t.id === id);
    if (task) {
      task.git = { ...task.git, ...git };
      this.flush();
    }
  }

  waveReviewing(): void {
    this.state.status = 'reviewing';
    this.flush();
  }

  waveComplete(pmNotes?: string): void {
    this.state.status = 'running';
    if (pmNotes) this.state.pmNotes = pmNotes;
    this.flush();
  }

  /** Add tasks dynamically spawned by the PM during review. */
  addTasks(tasks: Array<{ id: string; title: string; agent: string }>): void {
    for (const t of tasks) {
      if (!this.state.tasks.find((x) => x.id === t.id)) {
        this.state.tasks.push({ id: t.id, title: t.title, agent: t.agent, wave: 0, status: 'pending' });
        // totalTasks is recomputed from this.state.tasks.length in flush().
      }
    }
    this.flush();
  }

  synthesizing(): void {
    this.state.status = 'synthesizing';
    this.state.activeTaskIds = [];
    this.flush();
  }

  setHitlPaused(paused: boolean): void {
    if (paused) {
      this.state.hitlPaused = true;
    } else {
      delete this.state.hitlPaused;
      delete this.state.hitlAbortPending;
    }
    this.flush();
  }

  setAbortPending(): void {
    this.state.hitlAbortPending = true;
    this.flush();
  }

  setConnectionDropped(message: string): void {
    this.state.connectionDropped = true;
    this.state.connectionDropMessage = message;
    this.flush();
  }

  clearConnectionDropped(): void {
    delete this.state.connectionDropped;
    delete this.state.connectionDropMessage;
    this.flush();
  }

  done(): void {
    this.state.status = 'done';
    this.state.activeTaskIds = [];
    this.flush();
  }

  error(message: string): void {
    this.state.status = 'error';
    this.state.errorMessage = message;
    this.state.activeTaskIds = [];
    this.flush();
  }

  /** Sync loop-engine state into run-state.json for dashboard / bg-status. */
  updateLoopState(fields: {
    loopTemplateId?: string;
    loopPhase?: LoopPhase;
    loopIteration?: number;
    lastVerification?: {
      pass: boolean;
      summary: string;
      at: number;
      durationMs?: number;
      strategies?: Array<{
        type: string;
        pass: boolean;
        durationMs: number;
        failures?: string[];
      }>;
    };
  }): void {
    if (fields.loopTemplateId !== undefined) {
      this.state.loopTemplateId = fields.loopTemplateId;
    }
    if (fields.loopPhase !== undefined) {
      this.state.loopPhase = fields.loopPhase;
    }
    if (fields.loopIteration !== undefined) {
      this.state.loopIteration = fields.loopIteration;
    }
    if (fields.lastVerification !== undefined) {
      this.state.lastVerification = fields.lastVerification;
    }
    this.flush();
  }

  get(): RunState {
    return { ...this.state, tasks: this.state.tasks.map((t) => ({ ...t })) };
  }

  private flush(): void {
    // ── Single source of truth for task counts ────────────────────────────────
    // Always recompute from the task array so counts can never drift from the
    // actual task list, regardless of dynamic spawning, retries, or re-queuing.
    //   totalTasks     = every task ever added to the plan (including PM-spawned)
    //   completedTasks = tasks that have been processed (done, blocked, or error)
    this.state.totalTasks     = this.state.tasks.length;
    this.state.completedTasks = this.state.tasks.filter(
      (t) => t.status === 'done' || t.status === 'blocked' || t.status === 'error',
    ).length;
    this.state.updatedAt = Date.now();
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // Non-fatal — TUI still works from in-memory state.
    }
  }
}

// ── Reader (used by `roland status` observer) ─────────────────────────────────

export function readRunState(stateDir: string): RunState | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir, RUN_STATE_FILE), 'utf-8');
    return JSON.parse(raw) as RunState;
  } catch {
    return null;
  }
}
