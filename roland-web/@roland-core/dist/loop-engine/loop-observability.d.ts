/**
 * Loop observability — structured phase logging, metrics, and execution history.
 *
 * Persists:
 *   .roland/loop-metrics.json
 *   .roland/loop-execution-history.json
 *
 * Posts summarized history to blackboard when entries exceed HISTORY_SUMMARIZE_AT.
 */
import type { Blackboard } from '../rco/blackboard.js';
import type { Phase } from './loop-phases.js';
import type { LoopState, LoopRunStatus } from './loop-state.js';
import type { PhaseResult } from './phase-handlers/types.js';
export declare const LOOP_METRICS_FILE = "loop-metrics.json";
export declare const LOOP_HISTORY_FILE = "loop-execution-history.json";
/** Summarize blackboard history when entry count exceeds this threshold. */
export declare const HISTORY_SUMMARIZE_AT = 50;
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
export declare function computeLoopMetrics(state: LoopState): LoopMetrics;
export declare function summarizeHistory(history: LoopExecutionHistory): string;
export declare class LoopObservability {
    private readonly stateDir;
    private readonly blackboard?;
    private readonly metricsPath;
    private readonly historyPath;
    constructor(stateDir: string, blackboard?: Blackboard | undefined);
    logPhaseTransition(log: PhaseTransitionLog): void;
    recordPhaseStart(phase: Phase, iteration: number, ctx?: {
        waveNumber?: number;
        hadBlockers?: boolean;
        retryCount?: number;
    }): void;
    recordPhaseComplete(phase: Phase, iteration: number, result: PhaseResult, durationMs: number, templateId: string, ctx?: {
        waveNumber?: number;
        hadBlockers?: boolean;
        retryCount?: number;
    }): void;
    persistMetrics(state: LoopState): LoopMetrics;
    readMetrics(): LoopMetrics | null;
    readHistory(): LoopExecutionHistory;
    postHistoryToBlackboard(state: LoopState): void;
    private appendHistory;
}
//# sourceMappingURL=loop-observability.d.ts.map