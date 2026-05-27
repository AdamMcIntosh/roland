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
    this.state.totalTasks = tasks.length;
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

  taskStart(id: string): void {
    const task = this.state.tasks.find((t) => t.id === id);
    if (task) {
      task.status = 'running';
      task.startedAt = Date.now();
    }
    if (!this.state.activeTaskIds.includes(id)) {
      this.state.activeTaskIds.push(id);
    }
    this.flush();
  }

  taskComplete(id: string, output: string, hadBlocker: boolean): void {
    const task = this.state.tasks.find((t) => t.id === id);
    if (task) {
      task.status = hadBlocker ? 'blocked' : 'done';
      task.completedAt = Date.now();
      task.hadBlocker = hadBlocker;
      const preview = output.replace(/\n{3,}/g, '\n\n').trim();
      task.outputPreview = preview.length > 300 ? '…' + preview.slice(-297) : preview;
    }
    this.state.activeTaskIds = this.state.activeTaskIds.filter((a) => a !== id);
    this.state.completedTasks++;
    this.flush();
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
        this.state.totalTasks++;
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

  get(): RunState {
    return { ...this.state, tasks: this.state.tasks.map((t) => ({ ...t })) };
  }

  private flush(): void {
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
