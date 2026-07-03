/**
 * ## Assumptions
 * - Each closed loop run gets a stable loop-id under `.roland/loops/<loop-id>/`.
 * - `state.json` holds structured exit-tracking and between-iteration history.
 * - `reflection.md` is append-only human-readable learnings across iterations.
 * - Checkpoints and artifacts are written per-iteration for resume and debugging.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
export const LOOPS_ROOT = 'loops';
export const LOOP_STATE_JSON = 'state.json';
export const LOOP_REFLECTION_MD = 'reflection.md';
export const LOOP_CHECKPOINTS_DIR = 'checkpoints';
export const LOOP_ARTIFACTS_DIR = 'artifacts';
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}
/** Derive a stable loop directory id from goal + optional run id. */
export function deriveLoopId(goal, runId) {
    const base = slugify(goal) || 'loop';
    const suffix = runId
        ? slugify(runId).slice(0, 16)
        : crypto.createHash('sha256').update(goal).digest('hex').slice(0, 8);
    return `${base}-${suffix}`;
}
function createInitialDiskState(opts, loopId) {
    const now = Date.now();
    return {
        loopId,
        goal: opts.goal,
        templateId: opts.templateId,
        startedAt: now,
        updatedAt: now,
        iteration: 1,
        confidenceStreak: 0,
        confidenceHistory: [],
        betweenIterationRuns: [],
        exitConditionStatus: [],
        reflections: [],
    };
}
/**
 * LoopMemory — persistent disk layer for closed-loop runs.
 *
 * Layout: `.roland/loops/<loop-id>/state.json`, `reflection.md`, `checkpoints/`, `artifacts/`.
 */
export class LoopMemory {
    opts;
    loopId;
    loopDir;
    diskState;
    constructor(opts) {
        this.opts = opts;
        this.loopId = opts.loopId ?? deriveLoopId(opts.goal);
        this.loopDir = path.join(opts.stateDir, LOOPS_ROOT, this.loopId);
        fs.mkdirSync(path.join(this.loopDir, LOOP_CHECKPOINTS_DIR), { recursive: true });
        fs.mkdirSync(path.join(this.loopDir, LOOP_ARTIFACTS_DIR), { recursive: true });
        this.diskState = this.loadOrCreate();
    }
    getState() {
        return {
            ...this.diskState,
            confidenceHistory: [...this.diskState.confidenceHistory],
            betweenIterationRuns: this.diskState.betweenIterationRuns.map((r) => ({ ...r })),
            exitConditionStatus: this.diskState.exitConditionStatus.map((s) => ({ ...s })),
            reflections: this.diskState.reflections.map((r) => ({ ...r })),
        };
    }
    /** Record verification confidence and update streak tracking. */
    recordVerification(confidence, accepted) {
        if (confidence != null) {
            this.diskState.confidenceHistory.push(confidence);
            if (this.diskState.confidenceHistory.length > 32) {
                this.diskState.confidenceHistory.shift();
            }
        }
        if (accepted) {
            this.diskState.confidenceStreak += 1;
        }
        else {
            this.diskState.confidenceStreak = 0;
        }
        this.touch();
    }
    recordBetweenIteration(run) {
        this.diskState.betweenIterationRuns.push(run);
        this.touch();
        this.writeArtifact(`between-iter-${run.iteration}.txt`, [
            `# Between-iterations (iteration ${run.iteration})`,
            `Command: ${run.command}`,
            `Exit: ${run.exitCode}`,
            `Duration: ${run.durationMs}ms`,
            '',
            '--- stdout ---',
            run.stdout.slice(-4000),
            '',
            '--- stderr ---',
            run.stderr.slice(-2000),
        ].join('\n'));
    }
    recordExitConditionStatus(status) {
        this.diskState.exitConditionStatus = status;
        this.touch();
    }
    /** Append reflection for an iteration to memory and reflection.md. */
    appendReflection(iteration, content) {
        const entry = { iteration, at: Date.now(), content };
        this.diskState.reflections.push(entry);
        this.touch();
        this.appendReflectionMd(entry);
        return entry;
    }
    /** Save loop-state snapshot as a per-iteration checkpoint. */
    saveCheckpoint(iteration, loopState) {
        const file = path.join(this.loopDir, LOOP_CHECKPOINTS_DIR, `iteration-${iteration}.json`);
        try {
            fs.writeFileSync(file, JSON.stringify(loopState, null, 2), 'utf-8');
        }
        catch {
            // Non-fatal.
        }
    }
    writeArtifact(name, content) {
        try {
            fs.writeFileSync(path.join(this.loopDir, LOOP_ARTIFACTS_DIR, name), content, 'utf-8');
        }
        catch {
            // Non-fatal.
        }
    }
    readReflectionMd() {
        try {
            return fs.readFileSync(path.join(this.loopDir, LOOP_REFLECTION_MD), 'utf-8');
        }
        catch {
            return '';
        }
    }
    loadOrCreate() {
        const file = path.join(this.loopDir, LOOP_STATE_JSON);
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (raw.goal === this.opts.goal && raw.templateId === this.opts.templateId) {
                console.error(`[Loop][memory] Resuming loop-id=${this.loopId} streak=${raw.confidenceStreak}`);
                return raw;
            }
        }
        catch {
            // Fresh state.
        }
        const initial = createInitialDiskState(this.opts, this.loopId);
        this.flush(initial);
        console.error(`[Loop][memory] Created loop-id=${this.loopId} dir=${this.loopDir}`);
        return initial;
    }
    appendReflectionMd(entry) {
        const block = [
            '',
            `## Iteration ${entry.iteration} — ${new Date(entry.at).toISOString()}`,
            '',
            entry.content,
            '',
        ].join('\n');
        const file = path.join(this.loopDir, LOOP_REFLECTION_MD);
        try {
            if (fs.existsSync(file)) {
                fs.appendFileSync(file, block, 'utf-8');
            }
            else {
                fs.writeFileSync(file, `# Loop Reflections\n\nGoal: ${this.opts.goal}\nTemplate: ${this.opts.templateId}\n${block}`, 'utf-8');
            }
        }
        catch {
            // Non-fatal.
        }
    }
    touch() {
        this.diskState.updatedAt = Date.now();
        this.flush();
    }
    flush(state = this.diskState) {
        try {
            fs.writeFileSync(path.join(this.loopDir, LOOP_STATE_JSON), JSON.stringify(state, null, 2), 'utf-8');
        }
        catch {
            // Non-fatal — in-memory state still drives the run.
        }
    }
}
export function readLoopMemoryState(stateDir, loopId) {
    try {
        const file = path.join(stateDir, LOOPS_ROOT, loopId, LOOP_STATE_JSON);
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function findLatestLoopMemory(stateDir) {
    const root = path.join(stateDir, LOOPS_ROOT);
    try {
        const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
        let latest = null;
        for (const dir of dirs) {
            const state = readLoopMemoryState(stateDir, dir.name);
            if (state && (!latest || state.updatedAt > latest.updatedAt)) {
                latest = state;
            }
        }
        return latest;
    }
    catch {
        return null;
    }
}
/**
 * ## Loop Integration Complete
 * LoopMemory persists reflections, exit-condition tracking, and between-iteration artifacts
 * under `.roland/loops/<loop-id>/` for autonomous multi-iteration closed loops.
 */
//# sourceMappingURL=loop-memory.js.map