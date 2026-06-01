/**
 * Roland Simple TUI — scrolling terminal output for limited/mobile terminals.
 *
 * Designed for SSH clients (Termius, JuiceSSH, etc.) and other environments
 * where alternate screen buffers and cursor movement codes produce garbage.
 *
 * Key differences from TuiRenderer:
 *   - No alternate screen buffer  (\x1b[?1049h / \x1b[?1049l)
 *   - No cursor movement codes    (\x1b[H\x1b[J, \x1b[A, etc.)
 *   - No Unicode box-drawing or block characters
 *   - No Unicode spinner characters
 *   - Scrolling, delta-only output — only NEW events are printed
 *   - ASCII progress bar  [######--------]
 *   - Basic ANSI colors only (bold, dim, red, green, yellow, cyan)
 *
 * Activated by:
 *   ROLAND_SIMPLE_TUI=1                    env var (explicit opt-in)
 *   roland team "goal" --simple-tui        CLI flag
 *   roland team "goal" --no-fancy          CLI flag alias
 *   auto-detected for TERM=dumb, narrow terminals (< 60 cols), or SSH
 *   sessions without declared truecolor support (SSH_CLIENT/SSH_TTY set
 *   but COLORTERM not 'truecolor' / '24bit').
 */
import fs from 'fs';
import path from 'path';
import { readRunState } from '../rco/run-state.js';
// ── ASCII-safe helpers ────────────────────────────────────────────────────────
// Only basic SGR codes — these work in every terminal including most SSH clients
const c = {
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
function progressBar(done, total, width = 20) {
    if (total <= 0)
        return '[' + '-'.repeat(width) + ']';
    const filled = Math.min(Math.round((done / total) * width), width);
    return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']';
}
function elapsed(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem.toString().padStart(2, '0')}s`;
}
function rpad(s, n) {
    return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}
function cols() {
    return Math.min(process.stderr.columns ?? 80, 100);
}
// ── Terminal environment detection ────────────────────────────────────────────
/**
 * Returns true when the current terminal environment is likely limited
 * (mobile SSH, dumb terminal, very narrow screen) and should use simple mode.
 *
 * Detection heuristics (any one is sufficient):
 *   1. ROLAND_SIMPLE_TUI=1      — explicit user opt-in
 *   2. TERM=dumb                — classic dumb terminal
 *   3. Terminal width < 60      — too narrow for the fancy box UI
 *   4. SSH session (SSH_CLIENT or SSH_TTY) without declared truecolor support
 *      (COLORTERM != 'truecolor' | '24bit') — catches Termius and similar
 *      mobile SSH clients that don't handle alternate screen buffers well.
 *
 * Users on SSH who DO have truecolor (e.g. iTerm2 remote, modern Termius)
 * will pass check 4 and get the full TUI.  They can still force simple mode
 * with ROLAND_SIMPLE_TUI=1 if they prefer.
 */
export function isSimpleTui() {
    // 1. Explicit opt-in
    if (process.env.ROLAND_SIMPLE_TUI === '1')
        return true;
    // 2. Dumb terminal
    if (process.env.TERM === 'dumb')
        return true;
    // 3. Very narrow terminal
    const termCols = process.stdout.columns ?? 0;
    if (termCols > 0 && termCols < 60)
        return true;
    // 4. SSH without truecolor — likely a mobile or basic client
    const isSSH = Boolean(process.env.SSH_CLIENT || process.env.SSH_TTY);
    const truecolor = process.env.COLORTERM;
    const hasTCColor = truecolor === 'truecolor' || truecolor === '24bit';
    if (isSSH && !hasTCColor)
        return true;
    return false;
}
// ── Simple TUI Renderer ───────────────────────────────────────────────────────
export class SimpleTuiRenderer {
    /** Task IDs + state we have already printed a line for, e.g. "task-1:running". */
    printedTaskIds = new Set();
    /** Wave numbers we have already printed a header for. */
    printedWaves = new Set();
    /** Last RunStatus we printed a transition announcement for. */
    lastStatus = '';
    /** Last HITL pause state we printed a transition for. */
    lastHitlPaused = false;
    /** Path to the state file (used in watch mode). */
    stateFilePath;
    active = false;
    // Stored as instance properties so they can be passed to removeListener.
    // Arrow functions defined inline in process.on() cannot be removed later.
    _onExit = () => this.stop();
    _onSigint = () => { this.stop(); process.exit(0); };
    _onSigterm = () => { this.stop(); process.exit(0); };
    constructor(stateFilePath) {
        this.stateFilePath = stateFilePath;
    }
    // ── Public API (same as TuiRenderer) ───────────────────────────────────────
    start() {
        if (this.active)
            return;
        this.active = true;
        const w = Math.min(cols(), 60);
        process.stderr.write('\n' + '='.repeat(w) + '\n');
        process.stderr.write(c.bold('Roland PM Team') + '\n');
        process.stderr.write('='.repeat(w) + '\n\n');
        // Registered once; removed in stop() to prevent accumulation across instances
        process.on('exit', this._onExit);
        process.on('SIGINT', this._onSigint);
        process.on('SIGTERM', this._onSigterm);
    }
    update(state) {
        if (!this.active)
            return;
        this.printDelta(state);
    }
    /** Removes all process listeners registered in start(). */
    stop() {
        if (!this.active)
            return;
        this.active = false;
        // No alternate screen to restore, but clean up signal listeners
        process.removeListener('exit', this._onExit);
        process.removeListener('SIGINT', this._onSigint);
        process.removeListener('SIGTERM', this._onSigterm);
    }
    // ── Observer mode (roland status --simple-tui or auto-detected) ─────────────
    /**
     * Block and watch run-state.json, printing delta updates as the state changes.
     * Exits when the run reaches 'done' or 'error', or on Ctrl+C.
     */
    static async watch(stateDir) {
        const filePath = path.join(stateDir, 'run-state.json');
        const renderer = new SimpleTuiRenderer(filePath);
        // Wait up to 30 s for the run to start
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
            process.stderr.write(`\nNo run-state found at ${filePath}.\n` +
                `Start a run first with: roland team "your goal"\n\n`);
            process.exit(1);
        }
        renderer.start();
        let lastSig = '';
        const redraw = () => {
            const state = readRunState(stateDir);
            if (!state)
                return;
            // Overlay HITL state from hitl-state.json (updated by CLI immediately).
            try {
                const hitlStateFile = path.join(stateDir, 'hitl-state.json');
                const hitlState = JSON.parse(fs.readFileSync(hitlStateFile, 'utf-8'));
                if (hitlState.paused)
                    state.hitlPaused = true;
                if (hitlState.abortPending)
                    state.hitlAbortPending = true;
            }
            catch { /* no hitl state file — fine */ }
            // Only update when something meaningful changed (avoids duplicate lines)
            const sig = `${state.status}:${state.currentWave}:${state.completedTasks}:${state.activeTaskIds.join(',')}:${state.hitlPaused ? 'p' : ''}:${state.hitlAbortPending ? 'a' : ''}`;
            if (sig === lastSig)
                return;
            lastSig = sig;
            renderer.update(state);
            if (state.status === 'done' || state.status === 'error') {
                setTimeout(() => {
                    renderer.stop();
                    if (state.status === 'done') {
                        process.stderr.write(`\nRun complete. Results in ${stateDir}/blackboard.json\n\n`);
                    }
                    else {
                        process.stderr.write(`\nRun error: ${state.errorMessage ?? 'unknown error'}\n\n`);
                    }
                    process.exit(0);
                }, 1500);
            }
        };
        // Initial draw
        redraw();
        // fs.watch for low-latency updates
        let watchTimer = null;
        try {
            fs.watch(filePath, () => {
                if (watchTimer)
                    return;
                watchTimer = setTimeout(() => { watchTimer = null; redraw(); }, 150);
            });
        }
        catch { /* fall through to polling */ }
        // 2 s polling fallback (covers fs.watch gaps on some SSH mounts)
        setInterval(redraw, 2000);
        // Block forever — Ctrl+C handler in start() calls process.exit
        await new Promise(() => { });
    }
    // ── Delta rendering ─────────────────────────────────────────────────────────
    printDelta(state) {
        const now = Date.now();
        const C = cols();
        // ── Wave header ────────────────────────────────────────────────────────────
        if (state.currentWave > 0 && !this.printedWaves.has(state.currentWave)) {
            this.printedWaves.add(state.currentWave);
            // Clamp display values — completed can never visually exceed total.
            const safeDone = Math.min(state.completedTasks, Math.max(state.totalTasks, 0));
            const bar = progressBar(safeDone, state.totalTasks, 16);
            const w = Math.min(C, 60);
            process.stderr.write('\n' + '-'.repeat(w) + '\n');
            process.stderr.write(c.bold(`Wave ${state.currentWave}`) + '  ' + bar + '  ' +
                c.dim(`${safeDone}/${state.totalTasks} done`) + '\n');
            process.stderr.write('-'.repeat(w) + '\n');
        }
        // ── HITL pause / abort transitions ──────────────────────────────────────────
        if (state.hitlPaused && !this.lastHitlPaused) {
            this.lastHitlPaused = true;
            process.stderr.write(`\n  ${c.yellow('[⏸]')} ${c.bold('Run paused')} — send ${c.cyan("'roland resume'")} to continue\n`);
        }
        else if (!state.hitlPaused && this.lastHitlPaused) {
            this.lastHitlPaused = false;
            process.stderr.write(`\n  ${c.green('[▶]')} ${c.bold('Run resumed')}\n`);
        }
        if (state.hitlAbortPending && !this.printedTaskIds.has('abort-pending')) {
            this.printedTaskIds.add('abort-pending');
            process.stderr.write(`\n  ${c.yellow('[⚠]')} Abort queued — run will stop after current wave\n`);
        }
        // ── Task state changes ─────────────────────────────────────────────────────
        for (const task of state.tasks) {
            // Task started running
            if (task.status === 'running' && !this.printedTaskIds.has(`${task.id}:running`)) {
                this.printedTaskIds.add(`${task.id}:running`);
                process.stderr.write(`  ${c.cyan('->')} ${c.dim(rpad('[' + task.id + ']', 10))} ` +
                    `${rpad(task.agent, 22)} ${c.dim(task.title.slice(0, C - 38))}\n`);
            }
            // Task completed successfully
            if (task.status === 'done' && !this.printedTaskIds.has(`${task.id}:done`)) {
                this.printedTaskIds.add(`${task.id}:done`);
                const dur = (task.startedAt && task.completedAt)
                    ? ' ' + c.dim(elapsed(task.completedAt - task.startedAt)) : '';
                process.stderr.write(`  ${c.green('[+]')} ${c.dim(rpad('[' + task.id + ']', 10))} ` +
                    `${rpad(task.agent, 22)} ${task.title.slice(0, C - 42)}${dur}\n`);
            }
            // Task blocked
            if (task.status === 'blocked' && !this.printedTaskIds.has(`${task.id}:blocked`)) {
                this.printedTaskIds.add(`${task.id}:blocked`);
                process.stderr.write(`  ${c.red('[!]')} ${c.dim(rpad('[' + task.id + ']', 10))} ` +
                    `${rpad(task.agent, 22)} ${task.title.slice(0, C - 44)} ${c.red('BLOCKED')}\n`);
            }
            // Task errored
            if (task.status === 'error' && !this.printedTaskIds.has(`${task.id}:error`)) {
                this.printedTaskIds.add(`${task.id}:error`);
                process.stderr.write(`  ${c.red('[X]')} ${c.dim(rpad('[' + task.id + ']', 10))} ` +
                    `${rpad(task.agent, 22)} ${task.title.slice(0, C - 44)} ${c.red('ERROR')}\n`);
            }
        }
        // ── Run status transition announcements ────────────────────────────────────
        const curStatus = state.status;
        if (curStatus !== this.lastStatus) {
            this.lastStatus = curStatus;
            if (curStatus === 'reviewing') {
                process.stderr.write(`\n  ${c.cyan('[~]')} ${c.dim(`Lead PM reviewing wave ${state.currentWave} results...`)}\n`);
            }
            else if (curStatus === 'synthesizing') {
                process.stderr.write(`\n  ${c.cyan('[~]')} ${c.dim('Lead PM synthesizing final deliverable...')}\n`);
            }
            else if (curStatus === 'done') {
                const safeDone = Math.min(state.completedTasks, Math.max(state.totalTasks, 0));
                const bar = progressBar(safeDone, state.totalTasks, 20);
                const elapsedStr = elapsed(now - state.startedAt);
                const w = Math.min(C, 60);
                process.stderr.write('\n' + '='.repeat(w) + '\n');
                process.stderr.write(c.green('[OK]') + '  ' + bar + '  ' +
                    `${safeDone}/${state.totalTasks} tasks  ` +
                    c.dim(elapsedStr) + '\n');
                process.stderr.write('='.repeat(w) + '\n\n');
            }
            else if (curStatus === 'error') {
                process.stderr.write(`\n  ${c.red('[ERR]')} ${state.errorMessage ?? 'unknown error'}\n`);
            }
        }
    }
}
//# sourceMappingURL=simple-tui.js.map