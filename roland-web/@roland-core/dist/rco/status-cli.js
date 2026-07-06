/**
 * ## CLI-First Simplification
 *
 * Shared CLI printers for mission monitoring — single source of truth used by
 * `roland status`, `roland live`, `roland hitl-status`, `roland mission-summary`,
 * `roland hitl-events`, and MCP parity tools. Hermes polls via MCP; operators use CLI.
 *
 * ## Dashboard Demoted — CLI + Hermes Primary Complete
 */
import path from 'path';
import { buildHitlStatusReport, formatHermesHitlSummary, formatHitlStatusMarkdown, formatMissionCompleteMarkdown, formatHermesMissionCompleteSummary, pollHermesHitlEvents, readMissionCompletionReport, buildMissionCompletionReport, } from './hitl-hermes.js';
import { buildBoardStatusReport, formatConciseUnscSummary } from './board-report.js';
import { printGitCommitApprovalStatus } from './git-commit-approval-cli.js';
import { readRunState } from './run-state.js';
import { readActiveMissionMeta, readSupervisorRecord } from './mission-state.js';
import { isProcessRunning } from './supervisor.js';
import { resolveMissionProjectRootFromState } from '../utils/mcp-project-context.js';
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cy = (s) => `\x1b[36m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const VIA_LABELS = {
    mcp: 'MCP (Hermes/Cursor)',
    cli: 'CLI',
    cursor: 'Cursor @roland',
    dashboard: 'Dashboard (legacy)',
};
function collectSuggestedActions(stateDir, hitl, runActive) {
    const actions = [...hitl.suggestedActions];
    if (runActive) {
        if (!actions.some((a) => a.startsWith('roland live'))) {
            actions.unshift('roland live');
        }
        if (!actions.some((a) => a.startsWith('roland hitl-status'))) {
            actions.push('roland hitl-status');
        }
    }
    else if (!actions.some((a) => a.startsWith('roland mission-summary'))) {
        actions.push('roland mission-summary');
    }
    if (!actions.some((a) => a.startsWith('roland board-status'))) {
        actions.push('roland board-status --concise');
    }
    const sup = readSupervisorRecord(stateDir);
    if (sup && isProcessRunning(sup.pid) && !actions.some((a) => a.startsWith('roland bg-logs'))) {
        actions.push('roland bg-logs --follow');
    }
    return [...new Set(actions)].slice(0, 6);
}
/** One-shot unified mission snapshot — primary `roland status` output. */
export function printUnifiedStatus(stateDir = '.roland', opts = {}) {
    const resolvedStateDir = path.resolve(stateDir);
    const projectRoot = readActiveMissionMeta(resolvedStateDir)?.projectRoot ??
        resolveMissionProjectRootFromState(resolvedStateDir);
    const board = buildBoardStatusReport(resolvedStateDir, opts.goal);
    const hitl = buildHitlStatusReport(resolvedStateDir);
    const runState = readRunState(resolvedStateDir);
    const meta = readActiveMissionMeta(resolvedStateDir);
    const sup = readSupervisorRecord(resolvedStateDir);
    const bgAlive = sup ? isProcessRunning(sup.pid) : false;
    const triggeredVia = runState?.triggeredVia ?? meta?.triggeredVia;
    const suggestedActions = collectSuggestedActions(resolvedStateDir, hitl, board.runActive);
    const payload = {
        runActive: board.runActive,
        goal: board.goal,
        projectRoot,
        stateDir: resolvedStateDir,
        triggeredVia: triggeredVia ?? null,
        background: sup
            ? { pid: sup.pid, alive: bgAlive, logFile: sup.logFile, goal: sup.goal }
            : null,
        board: {
            blockers: board.counts.blockers,
            tasks: board.counts.tasks,
            done: board.counts.done,
            roster: board.roster,
        },
        hitl: {
            waitingOnHitl: hitl.waitingOnHitl,
            summary: formatHermesHitlSummary(hitl),
            currentGate: hitl.currentGate,
            paused: hitl.hitl.paused,
        },
        loop: hitl.loop ?? null,
        missionCompletion: hitl.missionCompletion ?? null,
        suggestedActions,
        concise: formatConciseUnscSummary(board),
    };
    if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    const cols = Math.min((process.stderr.columns ?? 80), 88);
    const hr = dim('─'.repeat(cols - 4));
    const w = (s = '') => console.error(s);
    w();
    w(`  ${bold('Roland Status')}  ${dim('(CLI · Hermes primary · dashboard optional)')}`);
    w(`  ${hr}`);
    w();
    w(`  ${dim('Project')}       ${cy(projectRoot)}`);
    w(`  ${dim('State dir')}     ${dim(resolvedStateDir)}`);
    const runWord = board.runActive ? g('ACTIVE') : dim('idle');
    w(`  ${dim('Run')}           ${runWord}${board.goal ? dim(` — "${board.goal.slice(0, 60)}"`) : ''}`);
    if (triggeredVia) {
        w(`  ${dim('Launched via')}  ${cy(VIA_LABELS[triggeredVia] ?? triggeredVia)}`);
    }
    if (sup) {
        const bgWord = bgAlive ? g(`background PID ${sup.pid}`) : r(`stale PID ${sup.pid}`);
        w(`  ${dim('Supervisor')}    ${bgWord}`);
    }
    if (runState?.status) {
        const wave = runState.currentWave != null ? ` · wave ${runState.currentWave}` : '';
        const tasks = runState.completedTasks != null && runState.totalTasks != null
            ? ` · tasks ${runState.completedTasks}/${runState.totalTasks}`
            : '';
        w(`  ${dim('Phase')}         ${y(String(runState.status))}${wave}${tasks}`);
    }
    w();
    w(`  ${bold('HITL')}  ${hitl.waitingOnHitl ? r('⚠') : g('●')} ${formatHermesHitlSummary(hitl)}`);
    if (hitl.currentGate)
        w(`  ${dim('Gate')}          ${y(hitl.currentGate)}`);
    if (hitl.loop) {
        const lp = hitl.loop;
        w(`  ${dim('Loop')}          ${dim(`${lp.status} · ${lp.phase ?? '—'} · iter ${lp.iteration}`)}`);
    }
    w();
    w(`  ${bold('Board')}  ${board.counts.blockers} blocker${board.counts.blockers === 1 ? '' : 's'} · ${board.counts.done} done · ${board.counts.tasks} tasks`);
    if (board.blockers.length > 0) {
        for (const b of board.blockers.slice(0, 3)) {
            w(`    ${r('•')} ${b.title.slice(0, 70)}${b.assignee ? dim(` → ${b.assignee}`) : ''}`);
        }
    }
    if (hitl.missionCompletion && !board.runActive) {
        w();
        w(`  ${bold('Last mission')}  ${hitl.missionCompletion.summary}`);
    }
    w();
    w(`  ${bold('Suggested actions')}`);
    for (const cmd of suggestedActions.slice(0, 5)) {
        w(`    ${cy(cmd)}`);
    }
    w();
    w(`  ${dim('Live monitor:')} ${cy('roland live')}  ${dim('· TUI:')} ${cy('roland status --tui')}`);
    w();
    printGitCommitApprovalStatus(resolvedStateDir);
    if (!opts.concise) {
        console.log(formatConciseUnscSummary(board));
    }
}
/** Continuous live monitor — refreshes unified status on an interval. */
export async function runLiveMonitor(stateDir = '.roland', opts = {}) {
    if (opts.json) {
        printUnifiedStatus(stateDir, opts);
        return;
    }
    const intervalMs = Math.max(2, opts.intervalSec ?? 5) * 1000;
    const isTty = process.stderr.isTTY;
    let lastEventTs = 0;
    const tick = () => {
        if (isTty)
            process.stderr.write('\x1b[2J\x1b[H');
        printUnifiedStatus(stateDir, { ...opts, concise: true });
        const events = pollHermesHitlEvents(stateDir, lastEventTs, 20);
        if (events.length > 0) {
            lastEventTs = events[events.length - 1].timestamp;
            console.error(`\n  ${bold('Recent events')}  ${dim(`(${events.length} new)`)}\n`);
            for (const ev of events.slice(-5)) {
                const ts = new Date(ev.timestamp).toISOString().slice(11, 19);
                console.error(`    ${dim(ts)} ${y(ev.kind)}${ev.currentGate ? dim(` [${ev.currentGate}]`) : ''}`);
                if (ev.blockerDescription) {
                    console.error(`      ${ev.blockerDescription.slice(0, 100)}`);
                }
            }
            console.error('');
        }
        if (isTty) {
            console.error(dim(`  Refreshing every ${intervalMs / 1000}s · Ctrl+C to stop · roland hitl-events --since ${lastEventTs}`));
        }
    };
    tick();
    if (opts.once)
        return;
    await new Promise((resolve) => {
        const timer = setInterval(tick, intervalMs);
        const onSignal = () => {
            clearInterval(timer);
            console.error('');
            resolve();
        };
        process.on('SIGINT', onSignal);
        process.on('SIGTERM', onSignal);
    });
}
/** Print HITL status — delegates to buildHitlStatusReport (MCP parity). */
export function printHitlStatus(stateDir = '.roland', opts = {}) {
    const report = buildHitlStatusReport(stateDir);
    const summary = formatHermesHitlSummary(report);
    if (opts.json) {
        console.log(JSON.stringify({ ...report, summary }, null, 2));
        return;
    }
    console.error('');
    console.error(`  ${bold('HITL Status')}  ${dim('(CLI · Hermes monitoring)')}`);
    console.error('');
    console.error(`  ${report.waitingOnHitl ? r('⚠') : g('●')} ${summary}`);
    console.error('');
    if (report.currentGate) {
        console.error(`  Gate:          ${y(report.currentGate)}`);
    }
    if (report.blockerDescription) {
        console.error(`  Blocker:       ${report.blockerDescription.slice(0, 120)}`);
    }
    console.error(`  Run active:    ${report.runActive ? g('yes') : dim('no')}${report.goal ? dim(` — "${report.goal.slice(0, 60)}"`) : ''}`);
    console.error(`  Paused:        ${report.hitl.paused ? y('yes ⏸') : dim('no')}`);
    console.error(`  Abort pending: ${report.hitl.abortPending ? y('yes ⚠️') : dim('no')}`);
    console.error(`  Queue length:  ${report.hitl.queueLength > 0 ? y(String(report.hitl.queueLength)) : dim('0')}`);
    if (report.loop) {
        const lp = report.loop;
        console.error(`  Loop:          ${dim(`${lp.status} · phase=${lp.phase ?? '—'} · iter=${lp.iteration} · retries=${lp.retryCount}`)}`);
        if (lp.confidence !== null && lp.confidence !== undefined) {
            console.error(`  Confidence:    ${lp.confidence === 0 ? y('0 (gate failed)') : String(lp.confidence)}`);
        }
    }
    if (report.missionCompletion && !report.runActive) {
        console.error('');
        console.error(`  ${bold('Last mission')}  ${report.missionCompletion.summary}`);
        console.error(`  Status:        ${report.missionCompletion.finalStatus} · ${report.missionCompletion.successRate}% success`);
    }
    console.error('');
    if (report.suggestedActions.length > 0) {
        console.error(`  ${bold('Suggested actions')}`);
        for (const cmd of report.suggestedActions.slice(0, 4)) {
            console.error(`    ${cy(cmd)}`);
        }
        console.error('');
    }
    if (report.runActive && !report.hitl.paused) {
        console.error(`  ${dim('Controls:')} ${cy('roland pause')} · ${cy('roland abort')} · ${cy('roland inject "..."')}`);
    }
    else if (report.hitl.paused) {
        console.error(`  ${dim('Controls:')} ${cy('roland resume')}`);
    }
    printGitCommitApprovalStatus(stateDir);
    console.error('');
    // Full markdown to stdout for piping / Hermes scripts
    console.log(formatHitlStatusMarkdown(report));
}
/** Print latest mission completion snapshot. */
export function printMissionSummary(stateDir = '.roland', opts = {}) {
    let report = readMissionCompletionReport(stateDir);
    if (!report && opts.goal) {
        report = buildMissionCompletionReport(stateDir, { goal: opts.goal });
    }
    if (!report) {
        if (opts.json) {
            console.log(JSON.stringify({ found: false, summary: 'No mission completion recorded yet.' }, null, 2));
            return;
        }
        console.error(dim('No mission completion recorded yet.'));
        console.error(dim('Run `roland team "…"` or poll with `roland hitl-events --since 0`.'));
        return;
    }
    const summary = formatHermesMissionCompleteSummary(report);
    if (opts.json) {
        console.log(JSON.stringify({ found: true, ...report, summary }, null, 2));
        return;
    }
    console.error('');
    console.error(`  ${bold('Mission Summary')}  ${dim('(terminal outcome · Hermes)')}`);
    console.error('');
    console.error(`  ${report.finalStatus === 'completed' ? g('✓') : y('⚠')} ${summary}`);
    console.error('');
    console.log(formatMissionCompleteMarkdown(report));
}
/** Poll HITL events since timestamp (epoch ms). */
export function printHitlEvents(stateDir = '.roland', opts = {}) {
    const since = opts.since ?? 0;
    const limit = opts.limit ?? 50;
    const events = pollHermesHitlEvents(stateDir, since, limit);
    const report = buildHitlStatusReport(stateDir);
    const summary = formatHermesHitlSummary(report);
    const payload = {
        events,
        count: events.length,
        latestTimestamp: events.length > 0 ? events[events.length - 1].timestamp : since,
        waitingOnHitl: report.waitingOnHitl,
        summary,
    };
    if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    console.error('');
    console.error(`  ${bold('HITL Events')}  ${dim(`since ${since} · ${events.length} new`)}`);
    console.error(`  ${summary}`);
    console.error('');
    if (events.length === 0) {
        console.error(dim('  (no new events)'));
        console.error('');
        return;
    }
    for (const ev of events) {
        const ts = new Date(ev.timestamp).toISOString();
        const gate = ev.currentGate ? ` [${ev.currentGate}]` : '';
        console.error(`  ${dim(ts)} ${y(ev.kind)}${gate}`);
        if (ev.blockerDescription) {
            console.error(`    ${ev.blockerDescription.slice(0, 120)}`);
        }
        if (ev.kind === 'mission-complete') {
            console.error(`    ${g('→ run: roland mission-summary')}`);
        }
    }
    console.error('');
}
//# sourceMappingURL=status-cli.js.map