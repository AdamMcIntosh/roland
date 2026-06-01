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
// ── Writer (used by team-cli / orchestrator callbacks) ────────────────────────
export class RunStateWriter {
    state;
    filePath;
    constructor(stateDir, goal) {
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
    planReady(tasks) {
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
    waveStart(waveNumber, taskIds) {
        this.state.currentWave = waveNumber;
        this.state.status = 'running';
        for (const task of this.state.tasks) {
            if (taskIds.includes(task.id) && task.status === 'pending') {
                task.wave = waveNumber;
            }
        }
        this.flush();
    }
    taskStart(id) {
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
    taskComplete(id, output, hadBlocker) {
        const task = this.state.tasks.find((t) => t.id === id);
        if (task) {
            task.status = hadBlocker ? 'blocked' : 'done';
            task.completedAt = Date.now();
            task.hadBlocker = hadBlocker;
            const preview = output.replace(/\n{3,}/g, '\n\n').trim();
            task.outputPreview = preview.length > 300 ? '…' + preview.slice(-297) : preview;
        }
        this.state.activeTaskIds = this.state.activeTaskIds.filter((a) => a !== id);
        // completedTasks is recomputed from task statuses in flush() — no manual increment.
        this.flush();
    }
    waveReviewing() {
        this.state.status = 'reviewing';
        this.flush();
    }
    waveComplete(pmNotes) {
        this.state.status = 'running';
        if (pmNotes)
            this.state.pmNotes = pmNotes;
        this.flush();
    }
    /** Add tasks dynamically spawned by the PM during review. */
    addTasks(tasks) {
        for (const t of tasks) {
            if (!this.state.tasks.find((x) => x.id === t.id)) {
                this.state.tasks.push({ id: t.id, title: t.title, agent: t.agent, wave: 0, status: 'pending' });
                // totalTasks is recomputed from this.state.tasks.length in flush().
            }
        }
        this.flush();
    }
    synthesizing() {
        this.state.status = 'synthesizing';
        this.state.activeTaskIds = [];
        this.flush();
    }
    setHitlPaused(paused) {
        if (paused) {
            this.state.hitlPaused = true;
        }
        else {
            delete this.state.hitlPaused;
            delete this.state.hitlAbortPending;
        }
        this.flush();
    }
    setAbortPending() {
        this.state.hitlAbortPending = true;
        this.flush();
    }
    setConnectionDropped(message) {
        this.state.connectionDropped = true;
        this.state.connectionDropMessage = message;
        this.flush();
    }
    clearConnectionDropped() {
        delete this.state.connectionDropped;
        delete this.state.connectionDropMessage;
        this.flush();
    }
    done() {
        this.state.status = 'done';
        this.state.activeTaskIds = [];
        this.flush();
    }
    error(message) {
        this.state.status = 'error';
        this.state.errorMessage = message;
        this.state.activeTaskIds = [];
        this.flush();
    }
    get() {
        return { ...this.state, tasks: this.state.tasks.map((t) => ({ ...t })) };
    }
    flush() {
        // ── Single source of truth for task counts ────────────────────────────────
        // Always recompute from the task array so counts can never drift from the
        // actual task list, regardless of dynamic spawning, retries, or re-queuing.
        //   totalTasks     = every task ever added to the plan (including PM-spawned)
        //   completedTasks = tasks that have been processed (done, blocked, or error)
        this.state.totalTasks = this.state.tasks.length;
        this.state.completedTasks = this.state.tasks.filter((t) => t.status === 'done' || t.status === 'blocked' || t.status === 'error').length;
        this.state.updatedAt = Date.now();
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
        }
        catch {
            // Non-fatal — TUI still works from in-memory state.
        }
    }
}
// ── Reader (used by `roland status` observer) ─────────────────────────────────
export function readRunState(stateDir) {
    try {
        const raw = fs.readFileSync(path.join(stateDir, RUN_STATE_FILE), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=run-state.js.map