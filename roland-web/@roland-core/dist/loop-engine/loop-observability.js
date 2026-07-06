/**
 * Loop observability — structured phase logging, metrics, and execution history.
 *
 * Persists:
 *   .roland/loop-metrics.json
 *   .roland/loop-execution-history.json
 *
 * Posts summarized history to blackboard when entries exceed HISTORY_SUMMARIZE_AT.
 */
import fs from 'fs';
import path from 'path';
import { writeUtf8Json } from '../utils/safe-write.js';
export const LOOP_METRICS_FILE = 'loop-metrics.json';
export const LOOP_HISTORY_FILE = 'loop-execution-history.json';
/** Summarize blackboard history when entry count exceeds this threshold. */
export const HISTORY_SUMMARIZE_AT = 50;
function safeReadJson(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch {
        return fallback;
    }
}
export function computeLoopMetrics(state) {
    const completed = state.phaseHistory.filter((t) => t.completedAt !== undefined);
    const phasesSucceeded = completed.filter((t) => t.success === true).length;
    const phasesFailed = completed.filter((t) => t.success === false).length;
    const phasesCompleted = completed.length;
    const successRate = phasesCompleted > 0 ? Math.round((phasesSucceeded / phasesCompleted) * 100) : 100;
    const byPhase = new Map();
    for (const t of completed) {
        const durationMs = (t.completedAt ?? t.startedAt) - t.startedAt;
        const prev = byPhase.get(t.phase) ?? {
            phase: t.phase,
            count: 0,
            totalMs: 0,
            avgMs: 0,
            successCount: 0,
            failureCount: 0,
        };
        prev.count += 1;
        prev.totalMs += durationMs;
        if (t.success === true)
            prev.successCount += 1;
        if (t.success === false)
            prev.failureCount += 1;
        byPhase.set(t.phase, prev);
    }
    const phaseDurations = [...byPhase.values()].map((p) => ({
        ...p,
        avgMs: p.count > 0 ? Math.round(p.totalMs / p.count) : 0,
    }));
    const totalDuration = phaseDurations.reduce((s, p) => s + p.totalMs, 0);
    const avgPhaseDurationMs = phasesCompleted > 0 ? Math.round(totalDuration / phasesCompleted) : 0;
    const failureReasons = [];
    for (const t of completed) {
        if (t.success === false && t.summary) {
            const snippet = t.summary.slice(0, 120);
            if (!failureReasons.includes(snippet))
                failureReasons.push(snippet);
        }
    }
    if (state.lastCritique?.retryDecision === 'escalate' && state.lastCritique.summary) {
        const esc = `Critique escalate: ${state.lastCritique.summary.slice(0, 100)}`;
        if (!failureReasons.includes(esc))
            failureReasons.push(esc);
    }
    const maxIter = 5;
    const iterProgress = Math.min(state.iteration / maxIter, 1);
    const statusProgress = state.status === 'completed' ? 1 : state.status === 'escalated' ? 0.9 : iterProgress * 0.8;
    const estimatedCompletionPct = Math.round(statusProgress * 100);
    return {
        templateId: state.templateId,
        goal: state.goal,
        iteration: state.iteration,
        retryCount: state.retryCount,
        status: state.status,
        phasesCompleted,
        phasesSucceeded,
        phasesFailed,
        successRate,
        avgPhaseDurationMs,
        phaseDurations,
        failureReasons: failureReasons.slice(0, 10),
        estimatedCompletionPct,
        updatedAt: Date.now(),
    };
}
export function summarizeHistory(history) {
    const entries = history.entries;
    if (entries.length === 0)
        return 'No loop execution history yet.';
    const recent = entries.slice(-20);
    const byPhase = new Map();
    for (const e of recent) {
        byPhase.set(e.phase, (byPhase.get(e.phase) ?? 0) + 1);
    }
    const phaseSummary = [...byPhase.entries()]
        .map(([p, n]) => `${p}×${n}`)
        .join(', ');
    const failures = recent.filter((e) => e.success === false).length;
    const hidden = entries.length - recent.length;
    const hiddenNote = hidden > 0 ? ` (${hidden} earlier entries summarized)` : '';
    return `${entries.length} transitions${hiddenNote}: ${phaseSummary}; ${failures} failure(s) in recent window`;
}
export class LoopObservability {
    stateDir;
    blackboard;
    metricsPath;
    historyPath;
    constructor(stateDir, blackboard) {
        this.stateDir = stateDir;
        this.blackboard = blackboard;
        fs.mkdirSync(stateDir, { recursive: true });
        this.metricsPath = path.join(stateDir, LOOP_METRICS_FILE);
        this.historyPath = path.join(stateDir, LOOP_HISTORY_FILE);
    }
    logPhaseTransition(log) {
        const ctx = log.context
            ? ` wave=${log.context.waveNumber ?? '—'} blockers=${log.context.hadBlockers ?? false} retry=${log.context.retryCount ?? 0}`
            : '';
        const dur = log.durationMs != null ? ` durationMs=${log.durationMs}` : '';
        const outcome = log.event === 'complete'
            ? ` success=${log.success ?? '—'} summary="${(log.summary ?? '').slice(0, 80)}"`
            : '';
        console.error(`[Loop][${log.event}] phase=${log.phase} iter=${log.iteration} at=${log.at}${ctx}${dur}${outcome}`);
    }
    recordPhaseStart(phase, iteration, ctx = {}) {
        const at = Date.now();
        this.logPhaseTransition({ phase, iteration, event: 'start', at, context: ctx });
        this.appendHistory({
            id: `${at}-${phase}-start`,
            templateId: '',
            iteration,
            phase,
            event: 'start',
            at,
        });
    }
    recordPhaseComplete(phase, iteration, result, durationMs, templateId, ctx = {}) {
        const at = Date.now();
        this.logPhaseTransition({
            phase,
            iteration,
            event: 'complete',
            at,
            durationMs,
            success: result.success,
            summary: result.summary,
            context: ctx,
        });
        this.appendHistory({
            id: `${at}-${phase}-complete`,
            templateId,
            iteration,
            phase,
            event: 'complete',
            at,
            durationMs,
            success: result.success,
            summary: result.summary?.slice(0, 200),
        });
    }
    persistMetrics(state) {
        const metrics = computeLoopMetrics(state);
        try {
            writeUtf8Json(this.metricsPath, metrics);
        }
        catch {
            // Non-fatal — metrics still returned to callers.
        }
        return metrics;
    }
    readMetrics() {
        return safeReadJson(this.metricsPath, null);
    }
    readHistory() {
        return safeReadJson(this.historyPath, { entries: [] });
    }
    postHistoryToBlackboard(state) {
        if (!this.blackboard)
            return;
        const history = this.readHistory();
        const summary = summarizeHistory(history);
        const metrics = computeLoopMetrics(state);
        const content = [
            `Iteration ${state.iteration} · retry ${state.retryCount} · status ${state.status}`,
            `Success rate: ${metrics.successRate}% · avg phase ${metrics.avgPhaseDurationMs}ms`,
            summary,
            metrics.failureReasons.length
                ? `Failures: ${metrics.failureReasons.slice(0, 3).join('; ')}`
                : null,
        ]
            .filter(Boolean)
            .join('\n');
        this.blackboard.post({
            type: 'artifact',
            title: `Loop history: ${state.templateId} (iter ${state.iteration})`,
            content,
            status: state.status === 'escalated' ? 'blocked' : 'in_progress',
            author: 'loop-engine',
            priority: state.status === 'escalated' ? 'critical' : 'medium',
            tags: ['loop', 'loop-history', 'observability'],
            relatedIds: [],
        });
        if (history.entries.length >= HISTORY_SUMMARIZE_AT && !history.summarizedAt) {
            const trimmed = {
                entries: history.entries.slice(-HISTORY_SUMMARIZE_AT),
                summarizedAt: Date.now(),
                summary: summarizeHistory(history),
            };
            try {
                writeUtf8Json(this.historyPath, trimmed);
            }
            catch {
                // Best-effort summarization.
            }
        }
    }
    appendHistory(entry) {
        const history = this.readHistory();
        history.entries.push(entry);
        try {
            writeUtf8Json(this.historyPath, history);
        }
        catch {
            // Non-fatal.
        }
    }
}
//# sourceMappingURL=loop-observability.js.map