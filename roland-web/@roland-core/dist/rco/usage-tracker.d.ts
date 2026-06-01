/**
 * RCO Usage Tracker — per-run token estimation and cost recording.
 *
 * Token counts are estimated from character counts (4 chars ≈ 1 token), which
 * is a reasonable heuristic for English prose + code.  Costs are estimated from
 * per-model rates; actual charges depend on your contract / tier.
 *
 * Data is appended to  .roland/usage-history.json  (one JSON array).
 */
export interface TaskUsageRecord {
    taskId: string;
    taskTitle: string;
    agent: string;
    model: string;
    inputChars: number;
    outputChars: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    durationMs: number;
    estimatedCostUsd: number;
}
export interface RunUsageRecord {
    runId: string;
    /** Unix ms — start of the run. */
    timestamp: number;
    goal: string;
    wavesRun: number;
    blockersEncountered: number;
    durationMs: number;
    tasks: TaskUsageRecord[];
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostUsd: number;
}
export declare function estimateTokenCost(model: string, inputTokens: number, outputTokens: number): number;
/**
 * Build a TaskUsageRecord from raw char counts and wall-clock duration.
 * Called immediately after each callCursorAgent() returns.
 */
export declare function buildTaskUsage(taskId: string, taskTitle: string, agent: string, model: string, inputChars: number, outputChars: number, durationMs: number): TaskUsageRecord;
/**
 * Aggregate per-task records into a RunUsageRecord for the whole run.
 */
export declare function buildRunUsage(opts: {
    runId: string;
    runStart: number;
    runEnd: number;
    goal: string;
    wavesRun: number;
    blockersEncountered: number;
    tasks: TaskUsageRecord[];
}): RunUsageRecord;
/** Append a RunUsageRecord to .roland/usage-history.json (creates file if absent). */
export declare function saveRunUsage(stateDir: string, record: RunUsageRecord): void;
/** Read all RunUsageRecords from .roland/usage-history.json (returns [] on any error). */
export declare function loadUsageHistory(stateDir: string): RunUsageRecord[];
//# sourceMappingURL=usage-tracker.d.ts.map