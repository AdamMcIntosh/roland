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
import type { Blackboard } from '../rco/blackboard.js';
import type { Phase } from './loop-phases.js';
import type { LoopState, LoopRunStatus } from './loop-state.js';
import type { PhaseResult } from './phase-handlers/types.js';

export const LOOP_METRICS_FILE = 'loop-metrics.json';
export const LOOP_HISTORY_FILE = 'loop-execution-history.json';

/** Summarize blackboard history when entry count exceeds this threshold. */
export const HISTORY_SUMMARIZE_AT = 50;

export interface PhaseDurationStats {
  phase: Phase;
  count: number;
  totalMs: number;
  avgMs: number;
  successCount: number;
  failureCount: number;
}

export interface LoopMetrics {
  templateId: string;
  goal: string;
  iteration: number;
  retryCount: number;
  status: LoopRunStatus;
  phasesCompleted: number;
  phasesSucceeded: number;
  phasesFailed: number;
  successRate: number;
  avgPhaseDurationMs: number;
  phaseDurations: PhaseDurationStats[];
  failureReasons: string[];
  estimatedCompletionPct: number;
  updatedAt: number;
}

export interface PhaseTransitionLog {
  phase: Phase;
  iteration: number;
  event: 'start' | 'complete';
  at: number;
  durationMs?: number;
  success?: boolean;
  summary?: string;
  context?: {
    waveNumber?: number;
    hadBlockers?: boolean;
    retryCount?: number;
  };
}

export interface LoopHistoryEntry {
  id: string;
  templateId: string;
  iteration: number;
  phase: Phase;
  event: 'start' | 'complete';
  at: number;
  durationMs?: number;
  success?: boolean;
  summary?: string;
}

export interface LoopExecutionHistory {
  entries: LoopHistoryEntry[];
  summarizedAt?: number;
  summary?: string;
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function computeLoopMetrics(state: LoopState): LoopMetrics {
  const completed = state.phaseHistory.filter((t) => t.completedAt !== undefined);
  const phasesSucceeded = completed.filter((t) => t.success === true).length;
  const phasesFailed = completed.filter((t) => t.success === false).length;
  const phasesCompleted = completed.length;
  const successRate =
    phasesCompleted > 0 ? Math.round((phasesSucceeded / phasesCompleted) * 100) : 100;

  const byPhase = new Map<Phase, PhaseDurationStats>();
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
    if (t.success === true) prev.successCount += 1;
    if (t.success === false) prev.failureCount += 1;
    byPhase.set(t.phase, prev);
  }

  const phaseDurations = [...byPhase.values()].map((p) => ({
    ...p,
    avgMs: p.count > 0 ? Math.round(p.totalMs / p.count) : 0,
  }));

  const totalDuration = phaseDurations.reduce((s, p) => s + p.totalMs, 0);
  const avgPhaseDurationMs =
    phasesCompleted > 0 ? Math.round(totalDuration / phasesCompleted) : 0;

  const failureReasons: string[] = [];
  for (const t of completed) {
    if (t.success === false && t.summary) {
      const snippet = t.summary.slice(0, 120);
      if (!failureReasons.includes(snippet)) failureReasons.push(snippet);
    }
  }
  if (state.lastCritique?.retryDecision === 'escalate' && state.lastCritique.summary) {
    const esc = `Critique escalate: ${state.lastCritique.summary.slice(0, 100)}`;
    if (!failureReasons.includes(esc)) failureReasons.push(esc);
  }

  const maxIter = 5;
  const iterProgress = Math.min(state.iteration / maxIter, 1);
  const statusProgress =
    state.status === 'completed' ? 1 : state.status === 'escalated' ? 0.9 : iterProgress * 0.8;
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

export function summarizeHistory(history: LoopExecutionHistory): string {
  const entries = history.entries;
  if (entries.length === 0) return 'No loop execution history yet.';
  const recent = entries.slice(-20);
  const byPhase = new Map<string, number>();
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
  private readonly metricsPath: string;
  private readonly historyPath: string;

  constructor(
    private readonly stateDir: string,
    private readonly blackboard?: Blackboard,
  ) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.metricsPath = path.join(stateDir, LOOP_METRICS_FILE);
    this.historyPath = path.join(stateDir, LOOP_HISTORY_FILE);
  }

  logPhaseTransition(log: PhaseTransitionLog): void {
    const ctx = log.context
      ? ` wave=${log.context.waveNumber ?? '—'} blockers=${log.context.hadBlockers ?? false} retry=${log.context.retryCount ?? 0}`
      : '';
    const dur = log.durationMs != null ? ` durationMs=${log.durationMs}` : '';
    const outcome =
      log.event === 'complete'
        ? ` success=${log.success ?? '—'} summary="${(log.summary ?? '').slice(0, 80)}"`
        : '';
    console.error(
      `[Loop][${log.event}] phase=${log.phase} iter=${log.iteration} at=${log.at}${ctx}${dur}${outcome}`,
    );
  }

  recordPhaseStart(
    phase: Phase,
    iteration: number,
    ctx: { waveNumber?: number; hadBlockers?: boolean; retryCount?: number } = {},
  ): void {
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

  recordPhaseComplete(
    phase: Phase,
    iteration: number,
    result: PhaseResult,
    durationMs: number,
    templateId: string,
    ctx: { waveNumber?: number; hadBlockers?: boolean; retryCount?: number } = {},
  ): void {
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

  persistMetrics(state: LoopState): LoopMetrics {
    const metrics = computeLoopMetrics(state);
    try {
      fs.writeFileSync(this.metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');
    } catch {
      // Non-fatal — metrics still returned to callers.
    }
    return metrics;
  }

  readMetrics(): LoopMetrics | null {
    return safeReadJson<LoopMetrics | null>(this.metricsPath, null);
  }

  readHistory(): LoopExecutionHistory {
    return safeReadJson<LoopExecutionHistory>(this.historyPath, { entries: [] });
  }

  postHistoryToBlackboard(state: LoopState): void {
    if (!this.blackboard) return;
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
      const trimmed: LoopExecutionHistory = {
        entries: history.entries.slice(-HISTORY_SUMMARIZE_AT),
        summarizedAt: Date.now(),
        summary: summarizeHistory(history),
      };
      try {
        fs.writeFileSync(this.historyPath, JSON.stringify(trimmed, null, 2), 'utf-8');
      } catch {
        // Best-effort summarization.
      }
    }
  }

  private appendHistory(entry: LoopHistoryEntry): void {
    const history = this.readHistory();
    history.entries.push(entry);
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch {
      // Non-fatal.
    }
  }
}
