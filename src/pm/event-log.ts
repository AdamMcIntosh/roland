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

export type PMEventAction =
  | 'spawn'
  | 'assign'
  | 'block'
  | 'unblock'
  | 'complete'
  | 'review'
  | 'usage'
  | 'recipe-start';

export interface PMEvent {
  ts: number;
  action: PMEventAction;
  taskKey?: string;
  actor?: string;
  detail?: string;
}

export class PMEventLog {
  /** Override the file location (tests). Defaults to .roland/pm-events.log. */
  constructor(private readonly file: string = '') {}

  private path(): string {
    return this.file || pmEventsFile();
  }

  /** Append one event. Best-effort — never throws. */
  append(e: Omit<PMEvent, 'ts'> & { ts?: number }): void {
    try {
      const line = JSON.stringify({ ts: e.ts ?? Date.now(), ...e }) + '\n';
      fs.appendFileSync(this.path(), line, 'utf-8');
    } catch {
      // Observability must never block the team.
    }
  }

  /** Newest-first events, optionally filtered by action or taskKey. */
  tail(limit = 50, filter?: { action?: PMEventAction; taskKey?: string }): PMEvent[] {
    let events: PMEvent[];
    try {
      const raw = fs.readFileSync(this.path(), 'utf-8');
      events = raw
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => {
          try {
            return JSON.parse(l) as PMEvent;
          } catch {
            return null;
          }
        })
        .filter((e): e is PMEvent => e !== null);
    } catch {
      return [];
    }
    if (filter?.action) events = events.filter((e) => e.action === filter.action);
    if (filter?.taskKey) events = events.filter((e) => e.taskKey === filter.taskKey);
    return events.reverse().slice(0, limit);
  }
}
