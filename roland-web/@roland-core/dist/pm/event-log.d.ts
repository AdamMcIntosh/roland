/**
 * PMEventLog — an append-only, JSONL audit trail of the team's life (Phase 4).
 *
 * Every PM lifecycle action (spawn, assign, block, unblock, complete, review,
 * usage, recipe-start) appends one line to .roland/pm-events.log. This is the
 * *semantic* history of the project, distinct from the stderr diagnostics the
 * shared logger emits. Writes are strictly best-effort: a logging failure must
 * never break a lifecycle action, so every method swallows its own errors.
 */
export type PMEventAction = 'spawn' | 'assign' | 'block' | 'unblock' | 'complete' | 'review' | 'usage' | 'recipe-start';
export interface PMEvent {
    ts: number;
    action: PMEventAction;
    taskKey?: string;
    actor?: string;
    detail?: string;
}
export declare class PMEventLog {
    private readonly file;
    /** Override the file location (tests). Defaults to .roland/pm-events.log. */
    constructor(file?: string);
    private path;
    /** Append one event. Best-effort — never throws. */
    append(e: Omit<PMEvent, 'ts'> & {
        ts?: number;
    }): void;
    /** Newest-first events, optionally filtered by action or taskKey. */
    tail(limit?: number, filter?: {
        action?: PMEventAction;
        taskKey?: string;
    }): PMEvent[];
}
//# sourceMappingURL=event-log.d.ts.map