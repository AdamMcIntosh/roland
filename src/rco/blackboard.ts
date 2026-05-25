/**
 * RCO Blackboard — shared persistent state for the PM agent team.
 *
 * The Blackboard is the team's single source of truth: tasks, decisions,
 * artifacts, blockers, and results all live here. Every agent can read it;
 * only the Lead PM and the orchestrator write to it directly (workers post
 * results that are then written by the orchestrator on their behalf).
 *
 * Persistence: `.roland/blackboard.json` in the project directory.
 * All mutations are rev-stamped for lightweight optimistic concurrency.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type EntryType   = 'task' | 'decision' | 'artifact' | 'blocker' | 'result';
export type EntryStatus = 'pending' | 'in_progress' | 'blocked' | 'done' | 'archived';
export type Priority    = 'critical' | 'high' | 'medium' | 'low';

export interface BlackboardEntry {
  id: string;
  type: EntryType;
  title: string;
  content: string;
  status: EntryStatus;
  author: string;
  assignee?: string;
  priority: Priority;
  tags: string[];
  relatedIds: string[];
  rev: number;
  createdAt: number;
  updatedAt: number;
}

export type BlackboardFilter = Partial<
  Pick<BlackboardEntry, 'type' | 'status' | 'assignee' | 'author'>
>;

export type NewEntry = Omit<BlackboardEntry, 'id' | 'rev' | 'createdAt' | 'updatedAt'>;

export class Blackboard {
  private readonly filePath: string;
  private entries: Map<string, BlackboardEntry> = new Map();

  constructor(stateDir: string = '.roland') {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, 'blackboard.json');
    this.load();
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as BlackboardEntry[];
      this.entries = new Map(data.map((e) => [e.id, e]));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // File exists but is corrupt (e.g. partial write after a crash) — warn so
        // the operator knows state was lost rather than silently starting empty.
        console.error('[Blackboard] State file could not be parsed; starting empty.', err);
      }
      this.entries = new Map();
    }
  }

  private save(): void {
    const data = Array.from(this.entries.values());
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  post(entry: NewEntry): BlackboardEntry {
    const now = Date.now();
    const full: BlackboardEntry = { ...entry, id: randomUUID(), rev: 1, createdAt: now, updatedAt: now };
    this.entries.set(full.id, full);
    this.save();
    return full;
  }

  patch(
    id: string,
    updates: Partial<Omit<BlackboardEntry, 'id' | 'rev' | 'createdAt'>>,
  ): BlackboardEntry | null {
    const existing = this.entries.get(id);
    if (!existing) return null;
    const updated: BlackboardEntry = { ...existing, ...updates, rev: existing.rev + 1, updatedAt: Date.now() };
    this.entries.set(id, updated);
    this.save();
    return updated;
  }

  archive(id: string): BlackboardEntry | null {
    return this.patch(id, { status: 'archived' });
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  get(id: string): BlackboardEntry | undefined {
    return this.entries.get(id);
  }

  read(filter?: BlackboardFilter): BlackboardEntry[] {
    let list = Array.from(this.entries.values());
    if (!filter) return list;
    for (const [k, v] of Object.entries(filter) as [keyof BlackboardFilter, unknown][]) {
      if (v !== undefined) list = list.filter((e) => e[k] === v);
    }
    return list;
  }

  /**
   * Human-readable snapshot of active entries (non-archived).
   * Injected into every agent prompt so agents share situational awareness.
   */
  snapshot(): string {
    const active = this.read().filter((e) => e.status !== 'archived');
    if (active.length === 0) return '(Blackboard is empty)';

    const grouped: Partial<Record<EntryType, BlackboardEntry[]>> = {};
    for (const e of active) {
      (grouped[e.type] ??= []).push(e);
    }

    const sections: string[] = [];
    const order: EntryType[] = ['blocker', 'task', 'decision', 'result', 'artifact'];
    for (const type of order) {
      const items = grouped[type];
      if (!items?.length) continue;
      sections.push(
        `### ${type.toUpperCase()}S\n` +
        items.map((e) =>
          `- [${e.status}] **${e.title}**${e.assignee ? ` (→ ${e.assignee})` : ''}\n  ${e.content.slice(0, 200)}`
        ).join('\n'),
      );
    }
    return sections.join('\n\n');
  }
}
