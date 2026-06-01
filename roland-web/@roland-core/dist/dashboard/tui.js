/**
 * Roland TUI — real-time terminal dashboard.
 *
 * Uses alternate screen + ANSI escape codes; zero external dependencies.
 *
 * Usage (live mode, from team-cli):
 *   const tui = new TuiRenderer(stateFilePath);
 *   tui.start();
 *   tui.update(runState);   // call on every lifecycle event
 *   tui.stop();             // restores terminal, returns synthesis
 *
 * Usage (observer mode, from `roland status`):
 *   TuiRenderer.watch(stateDir);  // blocks, watches file, Ctrl+C to exit
 */
import fs from 'fs';
import path from 'path';
import { readRunState } from '../rco/run-state.js';
// ── ANSI helpers (no external deps) ─────────────────────────────────────────
const A = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    white: '\x1b[97m',
    bgBlue: '\x1b[44m',
};
const b = (s) => A.bold + s + A.reset;
const d = (s) => A.dim + s + A.reset;
const r = (s) => A.red + s + A.reset;
const g = (s) => A.green + s + A.reset;
const y = (s) => A.yellow + s + A.reset;
const cy = (s) => A.cyan + s + A.reset;
const mg = (s) => A.magenta + s + A.reset;
function stripAnsi(s) {
    return s.replace(/\x1b\[[0-9;]*[mGKHJF]/g, '');
}
function vlen(s) {
    return stripAnsi(s).length;
}
/** Pad a string (which may contain ANSI codes) to exactly n visible chars. */
function pad(s, n) {
    const v = vlen(s);
    return v >= n ? stripAnsi(s).slice(0, n) : s + ' '.repeat(n - v);
}
function elapsed(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem.toString().padStart(2, '0')}s`;
}
function progressBar(done, total, width) {
    if (total <= 0)
        return d('░'.repeat(width));
    const filled = Math.min(Math.round((done / total) * width), width);
    return g('█'.repeat(filled)) + d('░'.repeat(width - filled));
}
// ── Spinner ──────────────────────────────────────────────────────────────────
const SPINNERS = ['◐', '◓', '◑', '◒'];
// ── Status pipeline ──────────────────────────────────────────────────────────
const STATUS_STEPS = ['planning', 'running', 'reviewing', 'synthesizing', 'done'];
// ── TUI Renderer ─────────────────────────────────────────────────────────────
export class TuiRenderer {
    spinTick = 0;
    timer = null;
    lastState = null;
    stateFilePath;
    active = false;
    // ── Command input state ───────────────────────────────────────────────────
    cmdBuffer = '';
    cmdFlash = '';
    cmdFlashTimer = null;
    _onCommand;
    // Stored as instance properties so they can be passed to removeListener.
    // Arrow functions defined inline in process.on() cannot be removed later.
    _onExit = () => this.stop();
    _onSigint = () => { this.stop(); process.exit(0); };
    _onSigterm = () => { this.stop(); process.exit(0); };
    _onResize = () => { if (this.lastState)
        this.draw(this.lastState); };
    _onStdinData = (key) => {
        if (key === '\x03') {
            this.stop();
            process.exit(0);
            return;
        } // Ctrl+C
        if (key === '\r' || key === '\n') { // Enter
            const cmd = this.cmdBuffer.trim();
            this.cmdBuffer = '';
            if (cmd)
                this._onCommand?.(cmd);
            if (this.lastState)
                this.draw(this.lastState);
            return;
        }
        if (key === '\x7f' || key === '\x08') { // Backspace
            this.cmdBuffer = this.cmdBuffer.slice(0, -1);
            if (this.lastState)
                this.draw(this.lastState);
            return;
        }
        if (key.length === 1 && key >= ' ') { // Printable
            this.cmdBuffer += key;
            if (this.lastState)
                this.draw(this.lastState);
        }
    };
    constructor(stateFilePath, opts = {}) {
        this.stateFilePath = stateFilePath;
        this._onCommand = opts.onCommand ?? null;
    }
    /** Display a message inside the TUI box for `durationMs` milliseconds. */
    showMessage(text, durationMs = 5000) {
        this.cmdFlash = text;
        if (this.cmdFlashTimer)
            clearTimeout(this.cmdFlashTimer);
        this.cmdFlashTimer = setTimeout(() => {
            this.cmdFlash = '';
            this.cmdFlashTimer = null;
            if (this.lastState)
                this.draw(this.lastState);
        }, durationMs);
        if (this.lastState)
            this.draw(this.lastState);
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    start() {
        if (this.active)
            return;
        this.active = true;
        process.stdout.write('\x1b[?1049h'); // enter alternate screen
        process.stdout.write('\x1b[?25l'); // hide cursor
        // Redraw every 250 ms to animate spinner + elapsed times
        this.timer = setInterval(() => {
            this.spinTick++;
            if (this.lastState)
                this.draw(this.lastState);
        }, 250);
        // Capture keystrokes for slash-command input (best-effort; skipped when stdin is not a TTY)
        if (process.stdin.isTTY) {
            try {
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.setEncoding('utf8');
                process.stdin.on('data', this._onStdinData);
            }
            catch { /* non-TTY or unsupported env — silently skip */ }
        }
        // Handle terminal resize
        process.stdout.on('resize', this._onResize);
        // Restore terminal on any exit — registered once, removed in stop()
        process.on('exit', this._onExit);
        process.on('SIGINT', this._onSigint);
        process.on('SIGTERM', this._onSigterm);
    }
    update(state) {
        this.lastState = state;
        this.draw(state);
    }
    stop() {
        if (!this.active)
            return;
        this.active = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.cmdFlashTimer) {
            clearTimeout(this.cmdFlashTimer);
            this.cmdFlashTimer = null;
        }
        // Restore stdin to normal cooked mode
        if (process.stdin.isTTY) {
            try {
                process.stdin.removeListener('data', this._onStdinData);
                process.stdin.setRawMode(false);
                process.stdin.pause();
            }
            catch { /* ignore */ }
        }
        process.stdout.write('\x1b[?1049l'); // leave alternate screen
        process.stdout.write('\x1b[?25h'); // show cursor
        // Remove all listeners added in start() so they don't accumulate
        // across multiple TuiRenderer instances in the same process.
        process.stdout.removeListener('resize', this._onResize);
        process.removeListener('exit', this._onExit);
        process.removeListener('SIGINT', this._onSigint);
        process.removeListener('SIGTERM', this._onSigterm);
    }
    // ── Observer (roland status) ──────────────────────────────────────────────
    /**
     * Block and watch the run-state.json file, redrawing on every change.
     * Exits when the run reaches 'done' or 'error', or when Ctrl+C is pressed.
     */
    static async watch(stateDir) {
        const filePath = path.join(stateDir, 'run-state.json');
        const renderer = new TuiRenderer(filePath);
        // Wait for the file to exist (the run may not have started yet)
        const waitForFile = async (maxWait = 30_000) => {
            const start = Date.now();
            while (!fs.existsSync(filePath)) {
                if (Date.now() - start > maxWait)
                    return false;
                await new Promise((r) => setTimeout(r, 500));
            }
            return true;
        };
        const found = await waitForFile();
        if (!found) {
            process.stderr.write(`\nNo run-state found at ${filePath}.\nStart a run first with: roland team "your goal"\n\n`);
            process.exit(1);
        }
        renderer.start();
        const redraw = () => {
            const state = readRunState(stateDir);
            if (state) {
                // Overlay HITL state from hitl-state.json (updated by CLI immediately
                // when commands are pushed, even before the orchestrator processes them).
                try {
                    const hitlStateFile = path.join(stateDir, 'hitl-state.json');
                    const hitlState = JSON.parse(fs.readFileSync(hitlStateFile, 'utf-8'));
                    if (hitlState.paused)
                        state.hitlPaused = true;
                    if (hitlState.abortPending)
                        state.hitlAbortPending = true;
                }
                catch { /* no hitl state file — fine */ }
                renderer.lastState = state;
                renderer.draw(state);
                if (state.status === 'done' || state.status === 'error') {
                    setTimeout(() => {
                        renderer.stop();
                        if (state.status === 'done') {
                            process.stdout.write(`\n${g('✅')} ${b('Run complete.')} Results in ${stateDir}/blackboard.json\n\n`);
                        }
                        else {
                            process.stdout.write(`\n${r('❌')} ${b('Run error:')} ${state.errorMessage ?? 'unknown'}\n\n`);
                        }
                        process.exit(0);
                    }, 1500);
                }
            }
        };
        // Initial draw
        redraw();
        // Watch for file changes
        let watchTimer = null;
        try {
            fs.watch(filePath, () => {
                if (watchTimer)
                    return; // debounce
                watchTimer = setTimeout(() => { watchTimer = null; redraw(); }, 100);
            });
        }
        catch {
            // fs.watch not available — fall through to polling
        }
        // 1s polling fallback (catches cases where fs.watch misfires)
        setInterval(redraw, 1000);
        // Block forever (Ctrl+C handler in start() calls process.exit)
        await new Promise(() => { });
    }
    // ── Rendering ─────────────────────────────────────────────────────────────
    get width() {
        return Math.max(60, Math.min(process.stdout.columns ?? 80, 120));
    }
    get contentWidth() {
        return this.width - 2; // content between ║ borders
    }
    spinner() {
        return SPINNERS[this.spinTick % SPINNERS.length];
    }
    draw(state) {
        const lines = [];
        const W = this.width;
        const C = this.contentWidth;
        const now = Date.now();
        const top = '╔' + '═'.repeat(W - 2) + '╗';
        const div = '╠' + '═'.repeat(W - 2) + '╣';
        const bottom = '╚' + '═'.repeat(W - 2) + '╝';
        const row = (content) => '║' + pad(content, C) + '║';
        // ── Header ──────────────────────────────────────────────────────────────
        const elapsedStr = elapsed(now - state.startedAt);
        const titleLeft = ` ${b('🚀  Roland PM Team')}`;
        const titleRight = d(`[${elapsedStr}]`) + ' ';
        const titlePad = C - vlen(titleLeft) - vlen(titleRight);
        lines.push(top);
        lines.push(row(titleLeft + ' '.repeat(Math.max(1, titlePad)) + titleRight));
        // ── Goal ────────────────────────────────────────────────────────────────
        const goalText = ` ${d('Goal:')} ${state.goal}`;
        lines.push(row(goalText.slice(0, C + goalText.length - vlen(goalText)))); // ANSI-safe trunc
        lines.push(div);
        // ── Status pipeline ──────────────────────────────────────────────────────
        const curIdx = STATUS_STEPS.indexOf(state.status);
        const pipeline = STATUS_STEPS.map((s, i) => {
            if (i < curIdx)
                return g('●') + ' ' + d(s);
            if (i === curIdx) {
                const icon = (s === 'done') ? g('●') : (s === 'error' ? r('●') : cy(this.spinner()));
                return icon + ' ' + b(s);
            }
            return d('○') + ' ' + d(s);
        }).join(d('  ──  '));
        lines.push(row(' ' + pipeline));
        lines.push(div);
        // ── Wave + progress bar ───────────────────────────────────────────────────
        // Clamp safeDone so completed never visually exceeds total (defense-in-depth;
        // RunStateWriter now derives counts from the task array, but guard anyway).
        const barWidth = 16;
        const safeDone = Math.min(state.completedTasks, Math.max(state.totalTasks, 0));
        const bar = progressBar(safeDone, state.totalTasks, barWidth);
        const waveLabel = state.currentWave > 0
            ? b(`Wave ${state.currentWave}`) + d('  ·  ')
            : '';
        const safePct = state.totalTasks > 0
            ? Math.min(Math.round((safeDone / state.totalTasks) * 100), 100)
            : 0;
        const pctLabel = state.totalTasks > 0 ? ` ${safePct}%` : '';
        const countLabel = d(`  ${safeDone} / ${state.totalTasks} tasks${pctLabel}`);
        const barRow = ` ${waveLabel}[${bar}]${countLabel}`;
        lines.push(row(barRow));
        lines.push(div);
        // ── Connection-drop banner ────────────────────────────────────────────────
        if (state.connectionDropped) {
            lines.push(row(` ${r('🔴')}  ${b('Connection dropped — run paused')}`));
            const detail = state.connectionDropMessage
                ? ` ${d(state.connectionDropMessage.slice(0, C - 4))}`
                : ` ${d('Cursor API unreachable. Restore connectivity then resume.')}`;
            lines.push(row(detail));
            lines.push(row(` ${d('Resume with:')}  ${cy('roland resume')}  ${d('(CLI)')}  ${cy('or')}  ${cy('/resume')}  ${d('(chat)')}`));
            lines.push(div);
        }
        // ── HITL state banner ─────────────────────────────────────────────────────
        if (state.hitlPaused) {
            const pauseMsg = ` ${y('⏸')}  ${b('PAUSED')} ${d('— send')} ${cy('roland resume')} ${d('to continue')}`;
            lines.push(row(pauseMsg));
            lines.push(div);
        }
        else if (state.hitlAbortPending) {
            const abortMsg = ` ${y('⚠️')}  ${b('Abort queued')} ${d('— run will stop after current wave finishes')}`;
            lines.push(row(abortMsg));
            lines.push(div);
        }
        // ── Task list ─────────────────────────────────────────────────────────────
        const maxTaskRows = Math.max(3, Math.min(state.tasks.length, Math.floor((process.stdout.rows ?? 30) - 14)));
        const visibleTasks = state.tasks.slice(-maxTaskRows);
        for (const task of visibleTasks) {
            lines.push(row(this.taskRow(task, now, C)));
        }
        if (state.tasks.length === 0) {
            lines.push(row(d('  (planning…)')));
        }
        lines.push(div);
        // ── Activity (current agents / last output) ───────────────────────────────
        const activeTasks = state.tasks.filter((t) => state.activeTaskIds.includes(t.id));
        if (activeTasks.length > 0) {
            for (const at of activeTasks.slice(0, 2)) {
                const taskElapsed = at.startedAt ? elapsed(now - at.startedAt) : '';
                lines.push(row(` ${mg('▶')} ${b(at.agent)} ${d('·')} ${cy(at.title.slice(0, C - 20))} ${d(taskElapsed)}`));
            }
        }
        else if (state.status === 'reviewing') {
            lines.push(row(` ${cy(this.spinner())} ${b('Lead PM')} ${d('reviewing wave results…')}`));
        }
        else if (state.status === 'synthesizing') {
            lines.push(row(` ${cy(this.spinner())} ${b('Lead PM')} ${d('synthesizing final deliverable…')}`));
        }
        else if (state.status === 'done') {
            lines.push(row(` ${g('✅')} ${b('Complete')} ${d('·')} synthesis printed to stdout`));
        }
        else if (state.status === 'error') {
            lines.push(row(` ${r('❌')} ${b('Error:')} ${d((state.errorMessage ?? '').slice(0, C - 12))}`));
        }
        else {
            // Show last completed task output preview
            const lastDone = [...state.tasks].reverse().find((t) => t.status === 'done' && t.outputPreview);
            if (lastDone?.outputPreview) {
                const preview = lastDone.outputPreview.split('\n').slice(-2).join(' ').trim();
                lines.push(row(d(`  …${preview.slice(0, C - 4)}`)));
            }
            else {
                lines.push(row(d('  Waiting for next wave…')));
            }
        }
        // ── Command flash message ─────────────────────────────────────────────────
        if (this.cmdFlash) {
            lines.push(div);
            for (const line of this.cmdFlash.split('\n').slice(0, 6)) {
                lines.push(row(' ' + cy(line.slice(0, C - 1))));
            }
        }
        lines.push(bottom);
        // ── Footer (outside box) ──────────────────────────────────────────────────
        const footerLeft = d(`  ${this.stateFilePath}`);
        const footerRight = this.cmdBuffer
            ? d('> ') + cy(this.cmdBuffer) + y('█') + d('  Enter↵  ')
            : d('Type /help  ·  Ctrl+C to exit  ');
        const footerPad = W - vlen(footerLeft) - vlen(footerRight);
        lines.push(footerLeft + ' '.repeat(Math.max(1, footerPad)) + footerRight);
        // ── Flush ──────────────────────────────────────────────────────────────────
        process.stdout.write('\x1b[H\x1b[J' + lines.join('\n'));
    }
    taskRow(task, now, C) {
        const iconMap = {
            done: g('✓'),
            running: cy(this.spinner()),
            blocked: r('✗'),
            error: r('✗'),
            pending: d('·'),
        };
        const icon = iconMap[task.status] ?? d('·');
        const idCol = pad(d(`[${task.id}]`), 10);
        const agentCol = pad(task.status === 'running' ? cy(task.agent) : task.agent, 22);
        const maxTitle = C - 1 - 10 - 22 - 8; // 8 for timing
        const titleCol = task.title.slice(0, Math.max(10, maxTitle));
        let timingCol = '';
        if (task.status === 'running' && task.startedAt) {
            timingCol = ' ' + cy(elapsed(now - task.startedAt));
        }
        else if (task.status === 'done' && task.startedAt && task.completedAt) {
            timingCol = ' ' + d(elapsed(task.completedAt - task.startedAt));
        }
        else if (task.status === 'pending') {
            timingCol = ' ' + d('(waiting)');
        }
        else if (task.status === 'blocked') {
            timingCol = ' ' + r('🚨');
        }
        return ` ${icon}  ${idCol}${agentCol}${titleCol}${timingCol}`;
    }
}
//# sourceMappingURL=tui.js.map