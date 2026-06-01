/**
 * Roland Chat Interface — calm, modern, Claude-Code-style terminal UX.
 *
 * Activated when `roland` is run with no arguments in an interactive TTY.
 * Provides a chat-first experience: type a natural language goal or /command.
 *
 * Design principles (v2):
 *   - Conversational: Roland "speaks" before and after every run
 *   - Quiet progress: compact task lines, wave summaries not verbose transcripts
 *   - Visual hierarchy: dim=infrastructure, bold=user goals, cyan=actions
 *   - No alternate screen: scroll-back-friendly, SSH-safe (unless fancy TUI picked)
 *   - Auto-detects simple/SSH mode via isSimpleTui()
 */
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { runTeam } from './team-orchestrator.js';
import { RunStateWriter } from './run-state.js';
import { Notifier } from './notifier.js';
import { HitlQueue } from './hitl.js';
import { isSimpleTui } from '../dashboard/simple-tui.js';
// ── Terminal helpers ──────────────────────────────────────────────────────────
const cols = () => Math.min(process.stderr.columns ?? 80, 100);
/** ANSI colour helpers — every one resets after the string. */
const c = {
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    italic: (s) => `\x1b[3m${s}\x1b[0m`,
    reset: (s) => `\x1b[0m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
    magenta: (s) => `\x1b[35m${s}\x1b[0m`,
    blue: (s) => `\x1b[34m${s}\x1b[0m`,
    white: (s) => `\x1b[97m${s}\x1b[0m`,
};
/** Strip ANSI codes (for length math). */
const visLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
/** Right-pad a string to visual length n. */
function rpad(s, n) {
    const v = visLen(s);
    return v >= n ? s : s + ' '.repeat(n - v);
}
/** Write a line to stderr (all UI output; only synthesis goes to stdout). */
const ln = (s = '') => { process.stderr.write(s + '\n'); };
/** Horizontal rule using ch, full terminal width minus small left-margin. */
function rule(ch = '─', indent = 2) {
    return ' '.repeat(indent) + ch.repeat(Math.max(4, cols() - indent));
}
/** Simple [███░░░] progress bar. */
function progressBar(done, total, width = 16) {
    if (total <= 0)
        return c.dim('░'.repeat(width));
    const filled = Math.min(Math.round((done / total) * width), width);
    return c.green('█'.repeat(filled)) + c.dim('░'.repeat(width - filled));
}
/** Human-readable elapsed time. */
function elapsedStr(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem.toString().padStart(2, '0')}s`;
}
/** Very rough ETA: assume ~3 min per parallel wave task capped at 25 min. */
function estimateWaveMin(taskCount) {
    const mins = Math.min(Math.ceil(taskCount * 3), 25);
    return mins <= 5 ? `~${mins} min` : `~${mins}–${Math.min(mins + 5, 30)} min`;
}
const SPINNERS = ['◐', '◓', '◑', '◒'];
// ── Welcome banner ────────────────────────────────────────────────────────────
function printWelcome(ctx) {
    const W = Math.min(cols(), 64);
    const simple = ctx.simple;
    ln('');
    if (simple) {
        // ── ASCII fallback (SSH / narrow / dumb) ─────────────────────────────────
        ln('  ' + '='.repeat(Math.max(4, W - 4)));
        ln(`  ${c.bold('Roland')}  ·  AI Engineering Team`);
        ln('  ' + '='.repeat(Math.max(4, W - 4)));
        ln('');
        ln('  Type a goal to run your team.');
        ln(`  ${c.dim('/help')} for commands  ·  ${c.dim('/exit')} to quit`);
    }
    else {
        // ── Unicode box (full terminal) ───────────────────────────────────────────
        const inner = W - 4;
        const row = (text) => {
            const pad = inner - visLen(text) - 1;
            return '  │ ' + text + ' '.repeat(Math.max(0, pad)) + '│';
        };
        const h = (ch) => '  ├' + ch.repeat(inner) + '┤';
        ln('  ╭' + '─'.repeat(inner) + '╮');
        ln(row(''));
        ln(row(c.bold(c.white('Roland')) + '  ' + c.dim('AI Engineering Team')));
        ln(row(''));
        ln(h('─'));
        ln(row(c.dim('Type a goal to run your team')));
        ln(row(c.dim('/help for commands  ·  /exit to quit')));
        ln(row(''));
        ln('  ╰' + '─'.repeat(inner) + '╯');
    }
    ln('');
    // ── Session config line ───────────────────────────────────────────────────
    const notifyLabel = ctx.notify ? c.green('on') : c.dim('off');
    const streamLabel = ctx.stream ? c.green('on') : c.dim('off');
    const improveLabel = !ctx.noImprove ? c.green('on') : c.dim('off');
    const modeLabel = ctx.parallel ? c.green('parallel (4)') : c.yellow('sequential');
    ln(`  ${c.dim('State:')} ${c.dim(ctx.stateDir)}  ` +
        `${c.dim('·')}  ${c.dim('mode:')} ${modeLabel}  ` +
        `${c.dim('·')}  ${c.dim('notify:')} ${notifyLabel}  ` +
        `${c.dim('·')}  ${c.dim('stream:')} ${streamLabel}  ` +
        `${c.dim('·')}  ${c.dim('improve:')} ${improveLabel}`);
    if (!process.env.CURSOR_API_KEY) {
        ln('');
        ln(`  ${c.yellow('⚠')}  ${c.bold('CURSOR_API_KEY not set')} — goals will fail.`);
        ln(`     ${c.dim('export CURSOR_API_KEY=your_key_here')}`);
    }
    ln('');
}
// ── Help reference ────────────────────────────────────────────────────────────
function printChatHelp() {
    const S = '  ';
    ln('');
    ln(`${S}${c.bold('GOALS')}  ${c.dim('— just type naturally')}`);
    ln(`${S}  ${c.dim(c.italic('"Add rate limiting to the password reset endpoint"'))}`);
    ln(`${S}  ${c.dim(c.italic('"Write unit tests for the auth module"'))}`);
    ln(`${S}  ${c.dim(c.italic('"Refactor the database layer to use repositories"'))}`);
    ln('');
    ln(`${S}${c.bold('RUN CONTROLS')}`);
    ln(`${S}  ${c.cyan('/pause')}                    Pause before next wave`);
    ln(`${S}  ${c.cyan('/resume')}                   Resume a paused run`);
    ln(`${S}  ${c.cyan('/abort')}                    Stop after current wave`);
    ln(`${S}  ${c.cyan('/inject')} ${c.dim('"directive"')}       PM directive (mid-run)`);
    ln(`${S}  ${c.cyan('/replan')}                   Ask PM to re-evaluate`);
    ln(`${S}  ${c.cyan('/unblock')} ${c.dim('<id> [msg]')}       Unblock a task`);
    ln(`${S}  ${c.cyan('/status')}                   Show current run state`);
    ln('');
    ln(`${S}${c.bold('BACKGROUND')}`);
    ln(`${S}  ${c.cyan('/bg-status')}                Check background run`);
    ln(`${S}  ${c.cyan('/bg-logs')}                  Tail background logs`);
    ln(`${S}  ${c.cyan('/bg-stop')}                  Stop background run`);
    ln('');
    ln(`${S}${c.bold('SETTINGS')}`);
    ln(`${S}  ${c.cyan('/stream')} ${c.dim('[on|off]')}           Toggle task output previews`);
    ln(`${S}  ${c.cyan('/notify')} ${c.dim('[on|off]')}           Toggle desktop notifications`);
    ln(`${S}  ${c.cyan('/improve')} ${c.dim('[on|off]')}          Toggle self-improvement`);
    ln(`${S}  ${c.cyan('/parallel')} ${c.dim('[on|off]')}         Toggle parallel (default: on) / sequential safe mode`);
    ln(`${S}  ${c.cyan('/state-dir')} ${c.dim('<dir>')}           Set persistence directory`);
    ln(`${S}  ${c.cyan('/clean')}                    Clear blackboard + messages`);
    ln('');
    ln(`${S}${c.bold('META')}`);
    ln(`${S}  ${c.cyan('/refine')} ${c.dim('"goal"')}             Run a follow-up goal`);
    ln(`${S}  ${c.cyan('/clear')}                    Clear the screen`);
    ln(`${S}  ${c.cyan('/help')}                     Show this help`);
    ln(`${S}  ${c.cyan('/exit')}  ${c.dim('or')}  ${c.cyan('/quit')}           Exit Roland`);
    ln('');
}
// ── Live status block ─────────────────────────────────────────────────────────
/**
 * Renders a live in-place status block during a goal run.
 *
 * Fancy mode (default): uses ANSI cursor-up + erase-to-end to rewrite a fixed
 * block of lines in place — a live "dashboard" without alternate screen.
 *
 * Simple mode (SSH / dumb terminal): no cursor movement; falls back to
 * periodic one-line heartbeat prints every 25 s so the terminal doesn't appear
 * frozen during long test-author / test-executor steps.
 */
class ChatLiveStatus {
    blockLines = 0;
    tickTimer = null;
    simple;
    sequential;
    spinTick = 0;
    liveMode = false;
    get isLive() { return this.liveMode; }
    phase = 'planning';
    waveNumber = 0;
    totalTasks = 0;
    completedTasks = 0;
    taskList = [];
    activeTasks = new Map();
    constructor(simple, sequential) {
        this.simple = simple;
        this.sequential = sequential;
    }
    // ── Block rendering ─────────────────────────────────────────────────────────
    renderBlock() {
        const w = Math.min(cols(), 100);
        const spin = SPINNERS[this.spinTick % SPINNERS.length];
        const lines = [];
        if (this.phase === 'planning') {
            lines.push(`  ${c.dim(spin)}  ${c.italic(c.dim('Planning your team…'))}`);
        }
        else if (this.phase === 'reviewing') {
            lines.push(`  ${c.dim(spin)}  ${c.dim('Lead PM reviewing results…')}`);
        }
        else if (this.phase === 'synthesizing') {
            lines.push(`  ${c.dim(spin)}  ${c.dim('Synthesizing final deliverable…')}`);
        }
        else {
            // ── Wave/step header with progress bar ─────────────────────────────────
            const bar = progressBar(this.completedTasks, this.totalTasks, 14);
            const pct = this.totalTasks > 0
                ? Math.min(Math.round((this.completedTasks / this.totalTasks) * 100), 100)
                : 0;
            const cnt = c.dim(`${this.completedTasks}/${this.totalTasks} tasks${this.totalTasks > 0 ? ' ' + pct + '%' : ''}`);
            if (this.sequential) {
                const active = [...this.activeTasks.values()][0];
                lines.push(`  ${c.bold(`Step ${this.waveNumber}`)}  ${c.dim('·')}  ` +
                    `${active ? c.cyan(active.agent) : c.dim('waiting')}  ` +
                    `[${bar}]  ${cnt}`);
            }
            else {
                lines.push(`  ${c.bold(`Wave ${this.waveNumber}`)}  ${c.dim('·')}  [${bar}]  ${cnt}`);
            }
            // ── Full task list (✓ done  ● running  · pending) ──────────────────────
            if (this.taskList.length > 0) {
                lines.push('');
                const termRows = process.stderr.rows ?? 24;
                const maxRows = Math.max(3, Math.min(this.taskList.length, termRows - 8));
                const visible = this.taskList.slice(-maxRows);
                for (const task of visible) {
                    const icon = task.status === 'done' ? c.green('✓')
                        : task.status === 'running' ? c.cyan(spin)
                            : task.status === 'blocked' ? c.red('✗')
                                : c.dim('·');
                    const idCol = rpad(c.dim('[' + task.id + ']'), 10);
                    const agentCol = rpad(task.status === 'running' ? c.cyan(task.agent) : c.dim(task.agent), 20);
                    const titleStr = task.title.slice(0, Math.max(10, w - 48));
                    let timing = '';
                    if (task.status === 'running' && task.startMs) {
                        timing = '  ' + c.cyan(elapsedStr(Date.now() - task.startMs));
                    }
                    else if (task.durationMs !== undefined && (task.status === 'done' || task.status === 'blocked')) {
                        timing = '  ' + c.dim(elapsedStr(task.durationMs));
                    }
                    else if (task.status === 'pending') {
                        timing = '  ' + c.dim('(waiting)');
                    }
                    lines.push(`  ${icon}  ${idCol}${agentCol}${titleStr}${timing}`);
                }
            }
            // ── Activity line: first running agent ──────────────────────────────────
            if (this.activeTasks.size > 0) {
                const [, first] = [...this.activeTasks][0];
                lines.push('');
                lines.push(`  ${c.magenta('▶')}  ${c.bold(first.agent)}  ${c.dim('·')}  ` +
                    `${c.cyan(first.title.slice(0, w - 32))}  ` +
                    `${c.dim(elapsedStr(Date.now() - first.startMs))}`);
            }
        }
        return lines.join('\n') + '\n';
    }
    eraseBlock() {
        if (this.simple || this.blockLines === 0)
            return;
        process.stderr.write(`\x1b[${this.blockLines}A\x1b[0J`);
        this.blockLines = 0;
    }
    drawBlock() {
        if (this.simple)
            return;
        const content = this.renderBlock();
        process.stderr.write(content);
        this.blockLines = (content.match(/\n/g) ?? []).length;
    }
    refresh() {
        if (!this.liveMode)
            return;
        this.eraseBlock();
        this.drawBlock();
    }
    // ── Public API — permanent output ───────────────────────────────────────────
    /** Write a permanent scrolling line. In live mode, erases+redraws the block. */
    printLine(s = '') {
        if (this.liveMode && !this.simple) {
            this.eraseBlock();
            process.stderr.write(s + '\n');
            this.drawBlock();
        }
        else {
            process.stderr.write(s + '\n');
        }
    }
    /** Print a horizontal rule as a permanent scrolling line. */
    printRule(ch = '─', indent = 2) {
        this.printLine(' '.repeat(indent) + ch.repeat(Math.max(4, Math.min(cols(), 100) - indent)));
    }
    // ── Public API — state transitions ──────────────────────────────────────────
    /** Initialise tracking state. Does NOT start rendering; call activate() for that. */
    start() { }
    /** Enter live-view mode: draw the block and start the tick timer. */
    activate() {
        if (this.liveMode)
            return;
        this.liveMode = true;
        this.drawBlock();
        if (!this.tickTimer) {
            const interval = this.simple ? 25_000 : 1_000;
            this.tickTimer = setInterval(() => {
                this.spinTick++;
                if (this.simple) {
                    for (const { agent, title, startMs } of this.activeTasks.values()) {
                        process.stderr.write(`  ${c.dim('↻')}  ${c.dim(rpad(agent, 20))}  ` +
                            `${c.dim(title.slice(0, 44))}  ` +
                            `${c.dim('(' + elapsedStr(Date.now() - startMs) + ' elapsed…)')}\n`);
                    }
                }
                else {
                    this.refresh();
                }
            }, interval);
        }
    }
    /** Exit live-view mode: erase the block and stop the tick timer. */
    deactivate() {
        if (!this.liveMode)
            return;
        this.liveMode = false;
        this.eraseBlock();
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
    }
    /** Toggle live view. Returns true if now live. */
    toggle() {
        if (this.liveMode) {
            this.deactivate();
            return false;
        }
        this.activate();
        return true;
    }
    planReady(tasks) {
        this.totalTasks = tasks.length;
        this.taskList = tasks.map((t) => ({ ...t, status: 'pending' }));
        this.phase = 'running';
        this.refresh();
    }
    addTasks(tasks) {
        for (const t of tasks) {
            if (!this.taskList.find((x) => x.id === t.id)) {
                this.taskList.push({ ...t, status: 'pending' });
            }
        }
        this.totalTasks = this.taskList.length;
        this.refresh();
    }
    waveStart(waveNumber, completedTasks, totalTasks) {
        this.waveNumber = waveNumber;
        this.completedTasks = completedTasks;
        this.totalTasks = totalTasks;
        this.activeTasks.clear();
        this.phase = 'running';
        this.refresh();
    }
    taskStart(id, agent, title) {
        this.activeTasks.set(id, { agent, title, startMs: Date.now() });
        const item = this.taskList.find((t) => t.id === id);
        if (item) {
            item.status = 'running';
            item.startMs = Date.now();
        }
        if (this.simple) {
            process.stderr.write(`  ${c.dim('→')}  ${c.dim(rpad(agent, 20))}  ${c.dim(title.slice(0, 50))}\n`);
        }
        else {
            this.refresh();
        }
    }
    taskDone(id, completedTasks, hadBlocker = false) {
        const entry = this.activeTasks.get(id);
        this.activeTasks.delete(id);
        this.completedTasks = completedTasks;
        const item = this.taskList.find((t) => t.id === id);
        if (item) {
            item.status = hadBlocker ? 'blocked' : 'done';
            item.durationMs = entry ? Date.now() - entry.startMs : undefined;
        }
        this.refresh();
    }
    reviewing() {
        this.phase = 'reviewing';
        this.refresh();
    }
    synthesizing() {
        this.phase = 'synthesizing';
        this.refresh();
    }
    stop() {
        this.deactivate(); // erases block + stops timer if live
    }
}
// ── Run a goal inline ─────────────────────────────────────────────────────────
async function runGoalInline(goal, ctx) {
    const W = cols();
    // ── Conversational lead-in ─────────────────────────────────────────────────
    ln('');
    const goalDisplay = goal.length > W - 18 ? goal.slice(0, W - 21) + '…' : goal;
    ln(`  ${c.bold('You')}  ${c.dim('·')}  ${goalDisplay}`);
    ln('');
    if (!process.env.CURSOR_API_KEY) {
        ln(`  ${c.red('✗')}  ${c.bold('CURSOR_API_KEY not set.')}  Set it first:`);
        ln(`     ${c.dim('export CURSOR_API_KEY=your_key_here')}`);
        ln('');
        return;
    }
    const runState = new RunStateWriter(ctx.stateDir, goal);
    const useNotify = ctx.notify || Boolean(ctx.webhookUrl);
    const notifier = new Notifier({
        desktop: ctx.notify,
        webhookUrl: ctx.webhookUrl,
        onComplete: useNotify,
        onError: useNotify,
        onBlocker: useNotify,
        onWave: false,
    });
    const hitlQueue = new HitlQueue(ctx.stateDir);
    const runStart = Date.now();
    const liveStatus = new ChatLiveStatus(ctx.simple, !ctx.parallel);
    const waveEntries = new Map();
    let waveStartTime = Date.now();
    let totalPlanned = 0;
    // Register as active so /status can toggle the live view during this run
    ctx.activeLiveStatus = liveStatus;
    liveStatus.start(); // no-op: rendering only starts when user types /status
    try {
        const result = await runTeam({
            goal,
            stateDir: ctx.stateDir,
            agentsDir: ctx.agentsDir,
            hitlQueue,
            noImprove: ctx.noImprove,
            interactive: Boolean(process.stderr.isTTY) && !ctx.noImprove,
            sequential: !ctx.parallel,
            rl: ctx.rl,
            onBlockerDetected: (_taskId, agent, description, waveNumber) => {
                void notifier.notify({
                    event: 'blocker', goal,
                    summary: `${agent} blocked on wave ${waveNumber}`,
                    blockerAgent: agent,
                    blockerDescription: description,
                    waveNumber,
                });
            },
            // ── Plan ready ──────────────────────────────────────────────────────────
            onPlanReady: (tasks) => {
                runState.planReady(tasks);
                totalPlanned = tasks.length;
                liveStatus.planReady(tasks);
                const est = estimateWaveMin(tasks.length);
                liveStatus.printLine(`  ${c.green('✅')}  ${c.bold(`Plan ready (${tasks.length} task${tasks.length !== 1 ? 's' : ''})`)}` +
                    `  ${c.dim('·')}  ${c.dim('est. ' + est)}`);
                liveStatus.printLine(`  ${c.dim('○')}  Type ${c.cyan('/status')} to enter live monitoring view.`);
                liveStatus.printLine('');
            },
            // ── Wave starting ────────────────────────────────────────────────────────
            onWaveStart: (waveNumber, tasks) => {
                runState.waveStart(waveNumber, tasks.map((t) => t.id));
                waveEntries.clear();
                waveStartTime = Date.now();
                for (const t of tasks) {
                    waveEntries.set(t.id, { agent: t.agent, title: t.title, hadBlocker: false });
                }
                const rs = runState.get();
                const bar = progressBar(rs.completedTasks, rs.totalTasks, 14);
                liveStatus.waveStart(waveNumber, rs.completedTasks, rs.totalTasks);
                liveStatus.printRule('─');
                if (!ctx.parallel) {
                    const task = tasks[0];
                    liveStatus.printLine(`  ${c.bold(`Step ${waveNumber}`)}` +
                        `  ${c.dim('·')}  ${c.cyan(task?.agent ?? '?')}` +
                        `  ${bar}  ${c.dim(rs.completedTasks + '/' + rs.totalTasks)}`);
                }
                else {
                    liveStatus.printLine(`  ${c.bold(`Wave ${waveNumber}`)}` +
                        `  ${c.dim('·')}  ${tasks.length} task${tasks.length !== 1 ? 's' : ''}` +
                        `  ${bar}  ${c.dim(rs.completedTasks + '/' + rs.totalTasks)}`);
                }
                liveStatus.printLine('');
            },
            // ── Task starting — live block shows it; simple mode prints a → line ─────
            onTaskStart: (id, agent, title) => {
                runState.taskStart(id);
                const entry = waveEntries.get(id);
                if (entry)
                    entry.startMs = Date.now();
                liveStatus.taskStart(id, agent, title);
            },
            // ── Task complete — erase block, print permanent line, redraw block ────────
            onTaskComplete: (id, agent, output, hadBlocker) => {
                runState.taskComplete(id, output, hadBlocker);
                const entry = waveEntries.get(id);
                if (entry)
                    entry.hadBlocker = hadBlocker;
                const rs = runState.get();
                const task = rs.tasks.find((t) => t.id === id);
                const dur = (task?.startedAt && task?.completedAt)
                    ? c.dim('  ' + elapsedStr(task.completedAt - task.startedAt))
                    : '';
                const badge = hadBlocker ? `  ${c.red('⚡ blocked')}` : '';
                liveStatus.taskDone(id, rs.completedTasks, hadBlocker);
                liveStatus.printLine(`  ${hadBlocker ? c.red('✗') : c.green('✓')}  ` +
                    `${rpad(agent, 20)}  ` +
                    `${(entry?.title ?? '').slice(0, Math.max(10, W - 32))}` +
                    `${dur}${badge}`);
                if (ctx.stream && output.trim()) {
                    const preview = output.slice(0, 320).replace(/\n{3,}/g, '\n\n');
                    liveStatus.printLine('');
                    for (const l of preview.split('\n'))
                        liveStatus.printLine(`     ${c.dim(l)}`);
                    if (output.length > 320)
                        liveStatus.printLine(`     ${c.dim('…(full output in synthesis)')}`);
                    liveStatus.printLine('');
                }
            },
            // ── Wave review — update live block phase ────────────────────────────────
            onWaveReview: () => {
                runState.waveReviewing();
                liveStatus.reviewing();
            },
            // ── Tasks spawned mid-run ────────────────────────────────────────────────
            onTasksSpawned: (tasks) => {
                runState.addTasks(tasks);
                liveStatus.addTasks(tasks);
                for (const t of tasks) {
                    liveStatus.printLine(`  ${c.cyan('+')}  ${c.dim('spawn')}  ${c.bold(rpad(t.agent, 18))}  ` +
                        `${c.dim('"' + t.title.slice(0, 52) + '"')}`);
                }
            },
            // ── Wave complete ────────────────────────────────────────────────────────
            onWaveComplete: (waveNumber, decision) => {
                void waveNumber;
                runState.waveComplete(decision.pmNotes);
                const blockers = [...waveEntries.values()].filter((e) => e.hadBlocker).length;
                const waveDur = elapsedStr(Date.now() - waveStartTime);
                const newTasks = decision.newTasks ?? [];
                const unblocks = decision.unblocks ?? [];
                const adjust = decision.decision !== 'continue';
                liveStatus.printLine('');
                if (blockers > 0) {
                    liveStatus.printLine(`  ${c.red('⚡')}  ${blockers} blocker${blockers !== 1 ? 's' : ''} this wave` +
                        `  ${c.dim('—')}  ${c.dim('see synthesis for details')}`);
                }
                if (!adjust) {
                    liveStatus.printLine(`  ${c.dim('└')}  Wave done  ${c.dim('·')}  ${c.dim(waveDur)}` +
                        `  ${c.dim('·')}  ${c.green('PM approved')}`);
                }
                else {
                    liveStatus.printLine(`  ${c.dim('└')}  Wave done  ${c.dim('·')}  ${c.dim(waveDur)}` +
                        `  ${c.dim('·')}  ${c.yellow('PM adjusted plan')}`);
                    if (decision.pmNotes) {
                        liveStatus.printLine(`     ${c.dim(decision.pmNotes.slice(0, W - 8).replace(/\n/g, ' '))}`);
                    }
                    for (const t of newTasks) {
                        liveStatus.printLine(`     ${c.cyan('+')}  ${c.bold(rpad(t.agent, 18))}  ` +
                            `${c.dim('"' + t.title.slice(0, 52) + '"')}`);
                    }
                    for (const u of unblocks) {
                        liveStatus.printLine(`     ${c.yellow('↑')}  ${c.bold(rpad(u.forAgent, 18))}  ` +
                            `${c.dim('"' + u.message.slice(0, 52) + '"')}`);
                    }
                }
                liveStatus.printLine('');
            },
            // ── Synthesizing ─────────────────────────────────────────────────────────
            onSynthesizing: () => {
                runState.synthesizing();
                liveStatus.printRule('─');
                liveStatus.synthesizing();
            },
            // ── HITL pause / resume ───────────────────────────────────────────────────
            onHitlPause: (paused) => {
                runState.setHitlPaused(paused);
                liveStatus.printLine('');
                if (paused) {
                    liveStatus.printLine(`  ${c.yellow('⏸')}  ${c.bold('Run paused')}  ${c.dim('—')}  type ${c.cyan('/resume')} to continue`);
                }
                else {
                    liveStatus.printLine(`  ${c.green('▶')}  ${c.bold('Resumed')}`);
                }
                liveStatus.printLine('');
            },
            // ── Abort pending ─────────────────────────────────────────────────────────
            onAbortPending: () => {
                runState.setAbortPending();
                liveStatus.printLine('');
                liveStatus.printLine(`  ${c.yellow('⚠')}  Abort queued — stopping after current wave`);
                liveStatus.printLine('');
            },
            // ── Circuit breaker ───────────────────────────────────────────────────────
            onCircuitBreak: (info) => {
                const CW = Math.min(cols(), 72);
                const bar = '═'.repeat(CW - 4);
                liveStatus.printLine('');
                liveStatus.printLine(`  ${c.red('╔' + bar + '╗')}`);
                liveStatus.printLine(`  ${c.red('║')}  ${c.bold(c.red('Connection lost — run paused'))}${' '.repeat(Math.max(0, CW - 36))}${c.red('║')}`);
                liveStatus.printLine(`  ${c.red('╚' + bar + '╝')}`);
                liveStatus.printLine('');
                liveStatus.printLine(`  ${c.red('✗')}  Wave ${info.waveNumber} interrupted` +
                    `  ${c.dim('·')}  ${info.errorCount} network error${info.errorCount !== 1 ? 's' : ''}` +
                    (info.failedAgents.length > 0 ? `  ${c.dim('·')}  ${c.red(info.failedAgents.join(', '))}` : ''));
                liveStatus.printLine('');
                if (info.savedTasks.length > 0) {
                    liveStatus.printLine(`  ${c.green('✓')}  ${c.bold(`${info.savedTasks.length} task${info.savedTasks.length !== 1 ? 's' : ''} saved`)}`);
                    for (const t of info.savedTasks) {
                        liveStatus.printLine(`     ${c.dim('·')}  ${c.dim(t.agent)}  ${t.title.slice(0, CW - 20)}`);
                    }
                    liveStatus.printLine('');
                }
                if (info.blockedTasks.length > 0) {
                    liveStatus.printLine(`  ${c.yellow('⚡')}  ${c.bold(`${info.blockedTasks.length} task${info.blockedTasks.length !== 1 ? 's' : ''} need retry`)}`);
                    for (const t of info.blockedTasks) {
                        liveStatus.printLine(`     ${c.dim('·')}  ${c.dim(t.agent)}  ${t.title.slice(0, CW - 20)}`);
                    }
                    liveStatus.printLine('');
                }
                liveStatus.printLine(`  ${c.dim('Partial progress has been saved to the project blackboard.')}`);
                liveStatus.printLine(`  ${c.dim('The PM will automatically retry blocked tasks when you resume.')}`);
                liveStatus.printLine('');
                liveStatus.printLine(`  ${c.bold('Restore connectivity, then resume with:')}`);
                liveStatus.printLine(`    ${c.cyan('❯')} ${c.bold('/resume')}         ${c.dim('(in this chat)')}`);
                liveStatus.printLine(`    ${c.cyan('❯')} ${c.bold('roland resume')}   ${c.dim('(from another terminal)')}`);
                liveStatus.printLine('');
            },
        });
        // ── Run complete ───────────────────────────────────────────────────────────
        const total = Object.keys(result.taskResults).length;
        const blockers = result.blockersEncountered;
        const dur = elapsedStr(Date.now() - runStart);
        runState.done();
        hitlQueue.cleanup();
        liveStatus.stop(); // exits live view cleanly if active
        ctx.activeLiveStatus = undefined;
        ctx.lastGoal = goal;
        ctx.runCount++;
        ln(rule('═'));
        ln(`  ${c.bold(c.green('✓  Complete'))}` +
            `  ${c.dim('·')}  ${total} task${total !== 1 ? 's' : ''}` +
            `  ${c.dim('·')}  ${result.wavesRun} wave${result.wavesRun !== 1 ? 's' : ''}` +
            `  ${c.dim('·')}  ${blockers > 0 ? c.red(blockers + ' blocked') : c.green('clean')}` +
            `  ${c.dim('·')}  ${c.dim(dur)}`);
        ln(rule('═'));
        ln('');
        if (blockers > 0) {
            ln(`  ${c.yellow('⚠')}  ${blockers} task${blockers !== 1 ? 's' : ''} blocked — ` +
                `see ${c.red('🔴 Release Blockers')} in the synthesis below.`);
            ln('');
        }
        // Synthesis to stdout so it can be piped/redirected independently of UI
        console.log(result.synthesis);
        // ── Conversational "what next?" ────────────────────────────────────────────
        ln('');
        ln(`  ${c.bold('Run complete.')}  ${c.dim('What would you like to do next?')}`);
        ln('');
        ln(`  ${c.dim('Type a new goal, or try:')}`);
        ln(`  ${c.cyan('/refine')} ${c.dim('"Fix the failing tests"')}    follow up on this run`);
        ln(`  ${c.cyan('/status')}                         show run details`);
        ln(`  ${c.cyan('/help')}                           all commands`);
        ln('');
        await notifier.notify({
            event: 'complete', goal, summary: 'Run complete',
            tasksCompleted: total, wavesRun: result.wavesRun,
            blockersEncountered: blockers, durationMs: Date.now() - runStart,
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        runState.error(msg);
        hitlQueue.cleanup();
        liveStatus.stop(); // exits live view cleanly if active
        ctx.activeLiveStatus = undefined;
        ln('');
        ln(`  ${c.red('✗')}  ${c.bold('Run failed')}  ${c.dim('·')}  ${msg.slice(0, 200)}`);
        if (msg.includes('CURSOR_API_KEY')) {
            ln(`     ${c.dim('Set your key: export CURSOR_API_KEY=your_key_here')}`);
        }
        ln('');
        await notifier.notify({
            event: 'error', goal, summary: msg, errorMessage: msg,
        });
    }
}
// ── Slash command handler ─────────────────────────────────────────────────────
async function handleCommand(input, ctx) {
    const parts = input.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();
    const args = parts.slice(1);
    // Strip surrounding quotes from a joined arg string
    const argStr = args.join(' ').replace(/^['"]|['"]$/g, '');
    switch (cmd) {
        // ── Help / meta ───────────────────────────────────────────────────────────
        case 'help':
        case 'h':
            printChatHelp();
            break;
        case 'exit':
        case 'quit':
        case 'q':
            ln('');
            ln(`  ${c.dim('Goodbye. Run')} ${c.cyan('roland')} ${c.dim('anytime.')}`);
            ln('');
            process.exit(0);
            break;
        case 'clear':
            // Full-screen clear then redraw welcome
            process.stderr.write('\x1b[2J\x1b[H');
            printWelcome(ctx);
            break;
        // ── Run state / live view toggle ──────────────────────────────────────────
        case 'status': {
            if (ctx.activeLiveStatus) {
                // A run is in progress — toggle the live monitoring view
                const nowLive = ctx.activeLiveStatus.toggle();
                if (!nowLive) {
                    ln(`  ${c.dim('Live view off.')}  Type ${c.cyan('/status')} to re-enter.`);
                    ln('');
                }
                // If entering live view the block draws itself — no extra message needed
            }
            else {
                // No active run — show last persisted run state
                const { readRunState } = await import('./run-state.js');
                const state = readRunState(ctx.stateDir);
                ln('');
                if (!state) {
                    ln(`  ${c.dim('No active run in')} ${ctx.stateDir}`);
                    ln(`  ${c.dim('Type a goal to start.')}`);
                }
                else {
                    const W = cols();
                    const bar = progressBar(state.completedTasks, state.totalTasks, 14);
                    ln(`  ${c.bold('Status')}  ${c.dim('·')}  ${state.goal.slice(0, W - 18)}`);
                    ln('');
                    ln(`  ${rpad(state.status, 14)}  ` +
                        `${bar}  ` +
                        `${c.dim(state.completedTasks + '/' + state.totalTasks + ' tasks')}  ` +
                        `${c.dim('wave ' + state.currentWave)}`);
                    if (state.hitlPaused)
                        ln(`  ${c.yellow('⏸  Paused')}`);
                    if (state.hitlAbortPending)
                        ln(`  ${c.yellow('⚠  Abort pending')}`);
                }
                ln('');
            }
            break;
        }
        // ── HITL controls ─────────────────────────────────────────────────────────
        case 'pause': {
            const { writeHitlCommand, isRunActive } = await import('./hitl.js');
            if (!isRunActive(ctx.stateDir)) {
                ln(`  ${c.yellow('⚠')}  No active run.`);
            }
            else {
                writeHitlCommand(ctx.stateDir, { cmd: 'pause' });
                ln(`  ${c.yellow('⏸')}  Pause sent.  Type ${c.cyan('/resume')} to continue.`);
            }
            ln('');
            break;
        }
        case 'resume': {
            const { writeHitlCommand } = await import('./hitl.js');
            writeHitlCommand(ctx.stateDir, { cmd: 'resume' });
            ln(`  ${c.green('▶')}  Resume sent.`);
            ln('');
            break;
        }
        case 'abort': {
            const { writeHitlCommand } = await import('./hitl.js');
            writeHitlCommand(ctx.stateDir, { cmd: 'abort' });
            ln(`  ${c.red('■')}  Abort sent — run stops after current wave.`);
            ln('');
            break;
        }
        case 'inject': {
            if (!argStr) {
                ln(`  ${c.dim('Usage:')} /inject "directive text"`);
                ln('');
                break;
            }
            const { writeHitlCommand } = await import('./hitl.js');
            writeHitlCommand(ctx.stateDir, { cmd: 'inject', text: argStr });
            ln(`  ${c.cyan('→')}  Injected to Lead PM: ${c.dim('"' + argStr.slice(0, 80) + '"')}`);
            ln('');
            break;
        }
        case 'replan': {
            const { writeHitlCommand } = await import('./hitl.js');
            writeHitlCommand(ctx.stateDir, { cmd: 'replan' });
            ln(`  ${c.cyan('↺')}  Replan queued — PM re-evaluates on next review.`);
            ln('');
            break;
        }
        case 'unblock': {
            const taskId = args[0];
            const message = args.slice(1).join(' ') || undefined;
            if (!taskId) {
                ln(`  ${c.dim('Usage:')} /unblock <task-id> [guidance]`);
                ln('');
                break;
            }
            const { writeHitlCommand } = await import('./hitl.js');
            writeHitlCommand(ctx.stateDir, { cmd: 'unblock', taskId, message });
            ln(`  ${c.cyan('↑')}  Unblocked ${c.bold(taskId)}${message ? `: ${c.dim('"' + message + '"')}` : ''}`);
            ln('');
            break;
        }
        // ── Background supervisor ─────────────────────────────────────────────────
        case 'bg-status':
        case 'bg_status': {
            const { bgStatus } = await import('./supervisor.js');
            bgStatus(ctx.stateDir, false);
            break;
        }
        case 'bg-logs':
        case 'bg_logs': {
            const { bgLogs } = await import('./supervisor.js');
            bgLogs(ctx.stateDir, 50);
            break;
        }
        case 'bg-stop':
        case 'bg_stop': {
            const { bgStop } = await import('./supervisor.js');
            bgStop(ctx.stateDir);
            break;
        }
        // ── Settings toggles ──────────────────────────────────────────────────────
        case 'stream': {
            const v = args[0]?.toLowerCase();
            if (v === 'on' || v === '1')
                ctx.stream = true;
            else if (v === 'off' || v === '0')
                ctx.stream = false;
            else
                ctx.stream = !ctx.stream;
            ln(`  ${ctx.stream ? c.green('●') : c.dim('○')}  Stream ${ctx.stream ? c.green('on') : c.dim('off')}`);
            ln('');
            break;
        }
        case 'notify': {
            const v = args[0]?.toLowerCase();
            if (v === 'on' || v === '1')
                ctx.notify = true;
            else if (v === 'off' || v === '0')
                ctx.notify = false;
            else
                ctx.notify = !ctx.notify;
            ln(`  ${ctx.notify ? c.green('●') : c.dim('○')}  Desktop notifications ${ctx.notify ? c.green('on') : c.dim('off')}`);
            ln('');
            break;
        }
        case 'improve': {
            const v = args[0]?.toLowerCase();
            if (v === 'on' || v === '1')
                ctx.noImprove = false;
            else if (v === 'off' || v === '0')
                ctx.noImprove = true;
            else
                ctx.noImprove = !ctx.noImprove;
            ln(`  ${!ctx.noImprove ? c.green('●') : c.dim('○')}  Self-improvement ${!ctx.noImprove ? c.green('on') : c.dim('off')}`);
            ln('');
            break;
        }
        case 'parallel': {
            const v = args[0]?.toLowerCase();
            if (v === 'on' || v === '1')
                ctx.parallel = true;
            else if (v === 'off' || v === '0')
                ctx.parallel = false;
            else
                ctx.parallel = !ctx.parallel;
            ln(`  ${ctx.parallel ? c.green('●') : c.yellow('●')}  ${ctx.parallel ? c.green('Parallel mode') : c.yellow('Sequential mode')} ${ctx.parallel ? c.dim('— 4 concurrent agents') : c.dim('— one agent at a time (safe mode)')}`);
            ln('');
            break;
        }
        case 'state-dir':
        case 'statedir': {
            if (!args[0]) {
                ln(`  ${c.dim('Current:')} ${ctx.stateDir}`);
                ln(`  ${c.dim('Usage:')} /state-dir <directory>`);
            }
            else {
                ctx.stateDir = args[0];
                ln(`  ${c.green('●')}  State dir → ${ctx.stateDir}`);
            }
            ln('');
            break;
        }
        case 'clean': {
            const targets = ['blackboard.json', 'messages.json'];
            const removed = [];
            for (const name of targets) {
                const p = path.join(ctx.stateDir, name);
                if (fs.existsSync(p)) {
                    fs.rmSync(p);
                    removed.push(name);
                }
            }
            ln(removed.length > 0
                ? `  ${c.yellow('✓')}  Cleaned: ${removed.join(', ')}  ${c.dim('(memory.md kept)')}`
                : `  ${c.dim('Nothing to clean in')} ${ctx.stateDir}`);
            ln('');
            break;
        }
        // ── /refine "follow-up goal" ──────────────────────────────────────────────
        case 'refine': {
            if (!argStr) {
                ln(ctx.lastGoal
                    ? `  ${c.dim('Last goal:')} ${ctx.lastGoal.slice(0, 80)}\n  ${c.dim('Usage:')} /refine "what to change or fix"`
                    : `  ${c.dim('Usage:')} /refine "follow-up goal"`);
                ln('');
                break;
            }
            await runGoalInline(argStr, ctx);
            break;
        }
        default:
            ln(`  ${c.yellow('?')}  Unknown command: /${cmd}  ${c.dim('(try /help)')}`);
            ln('');
            break;
    }
}
// ── REPL loop ─────────────────────────────────────────────────────────────────
/** Prompt string — bold cyan chevron, matches Claude Code style. */
const PROMPT = `\x1b[1m\x1b[36m  ❯\x1b[0m `;
async function replLoop(rl, ctx) {
    return new Promise((resolve) => {
        rl.once('close', resolve);
        let runActive = false;
        const nextPrompt = () => { rl.setPrompt(PROMPT); rl.prompt(); };
        // Persistent listener — stays active for the entire session.
        // During a run, only slash commands are forwarded (goal text is ignored).
        rl.on('line', (rawLine) => {
            const line = rawLine.trim();
            if (runActive) {
                if (line.startsWith('/')) {
                    // Fire-and-forget: HITL commands are fast file writes; status just prints.
                    void handleCommand(line, ctx);
                }
                else if (line) {
                    ln(`  ${c.dim('Run in progress.')}  ` +
                        `${c.dim('Try:')} ${c.cyan('/status')}  ${c.cyan('/pause')}  ` +
                        `${c.cyan('/abort')}  ${c.cyan('/resume')}`);
                }
                return;
            }
            if (!line) {
                nextPrompt();
                return;
            }
            // Wrap in async IIFE so the listener returns immediately and readline
            // stays responsive while we await the (potentially long) async work.
            void (async () => {
                if (line.startsWith('/')) {
                    await handleCommand(line, ctx);
                    nextPrompt();
                }
                else {
                    runActive = true;
                    try {
                        await runGoalInline(line, ctx);
                    }
                    finally {
                        runActive = false;
                        nextPrompt();
                    }
                }
            })();
        });
        nextPrompt();
    });
}
export async function startChat(options = {}) {
    const ctx = {
        stateDir: options.stateDir ?? process.env.ROLAND_STATE_DIR ?? '.roland',
        notify: options.notify ?? (process.env.ROLAND_NOTIFY === '1'),
        stream: options.stream ?? false,
        noImprove: options.noImprove ?? false,
        parallel: options.parallel ?? (process.env.ROLAND_SEQUENTIAL !== '1'),
        webhookUrl: options.webhookUrl,
        agentsDir: options.agentsDir,
        simple: isSimpleTui(),
        runCount: 0,
    };
    printWelcome(ctx);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: true,
        historySize: 200,
        completer: (line) => {
            if (line.startsWith('/')) {
                const cmds = [
                    '/help', '/status', '/pause', '/resume', '/abort',
                    '/inject ', '/replan', '/unblock ', '/refine ',
                    '/bg-status', '/bg-logs', '/bg-stop',
                    '/stream', '/notify', '/improve', '/parallel', '/state-dir ', '/clean',
                    '/clear', '/exit', '/quit',
                ];
                const hits = cmds.filter((x) => x.startsWith(line));
                return [hits.length > 0 ? hits : cmds, line];
            }
            return [[], line];
        },
    });
    // Share the readline with ctx so runTeam can reuse it for self-improvement
    // prompts instead of creating a competing interface that would close stdin.
    ctx.rl = rl;
    // Ctrl+C: first press shows a hint; second press within 1.5 s exits cleanly.
    let lastSigint = 0;
    rl.on('SIGINT', () => {
        const now = Date.now();
        if (now - lastSigint < 1500) {
            ln('');
            ln(`  ${c.dim('Goodbye. Run')} ${c.cyan('roland')} ${c.dim('anytime.')}`);
            ln('');
            process.exit(0);
        }
        lastSigint = now;
        ln('');
        ln(`  ${c.dim('Press Ctrl+C again to exit, or type')} ${c.cyan('/exit')}`);
        ln('');
        rl.setPrompt(PROMPT);
        rl.prompt();
    });
    await replLoop(rl, ctx);
    ln('');
    ln(`  ${c.dim('Session ended.')}`);
    ln('');
}
//# sourceMappingURL=chat-interface.js.map