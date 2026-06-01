/**
 * PMEventLog — an append-only, JSONL audit trail of the team's life (Phase 4).
 *
 * Every PM lifecycle action (spawn, assign, block, unblock, complete, review,
 * usage, recipe-start) appends one line to .roland/pm-events.log. This is the
 * *semantic* history of the project, distinct from the stderr diagnostics the
 * shared logger emits. Writes are strictly best-effort: a logging failure must
 * never break a lifecycle action, so every method swallows its own errors.
 */
import fs from 'fs';
import { pmEventsFile } from '../coordination/paths.js';
export class PMEventLog {
    file;
    /** Override the file location (tests). Defaults to .roland/pm-events.log. */
    constructor(file = '') {
        this.file = file;
    }
    path() {
        return this.file || pmEventsFile();
    }
    /** Append one event. Best-effort — never throws. */
    append(e) {
        try {
            const line = JSON.stringify({ ts: e.ts ?? Date.now(), ...e }) + '\n';
            fs.appendFileSync(this.path(), line, 'utf-8');
        }
        catch {
            // Observability must never block the team.
        }
    }
    /** Newest-first events, optionally filtered by action or taskKey. */
    tail(limit = 50, filter) {
        let events;
        try {
            const raw = fs.readFileSync(this.path(), 'utf-8');
            events = raw
                .split('\n')
                .filter((l) => l.trim().length > 0)
                .map((l) => {
                try {
                    return JSON.parse(l);
                }
                catch {
                    return null;
                }
            })
                .filter((e) => e !== null);
        }
        catch {
            return [];
        }
        if (filter?.action)
            events = events.filter((e) => e.action === filter.action);
        if (filter?.taskKey)
            events = events.filter((e) => e.taskKey === filter.taskKey);
        return events.reverse().slice(0, limit);
    }
}
//# sourceMappingURL=event-log.js.map