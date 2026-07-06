/**
 * ## P1 Honesty & Consolidation
 *
 * Legacy blackboard API (title/content/id entries) backed by the locked
 * coordination store. Loop-engine and legacy team-orchestrator post here;
 * Lead PM uses coordination/blackboard.ts with keyed entries — both share
 * `.roland/blackboard.json` under one lock scheme.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import { mutate, readLocked } from './store.js';
import { blackboardFile } from './paths.js';
import type { BlackboardStore } from './types.js';

export type EntryType = 'task' | 'decision' | 'artifact' | 'blocker' | 'result';
export type EntryStatus = 'pending' | 'in_progress' | 'blocked' | 'done' | 'archived';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

/** Payload stored in coordination entry `value` for legacy consumers. */
export interface LegacyBlackboardPayload {
  id: string;
  title: string;
  content: string;
  priority: Priority;
  assignee?: string;
  relatedIds: string[];
}

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

const LEGACY_PREFIX = 'legacy:';

function emptyStore(): BlackboardStore {
  return { entries: {} };
}

function legacyKey(id: string): string {
  return `${LEGACY_PREFIX}${id}`;
}

function payloadToEntry(
  key: string,
  storeEntry: import('./types.js').BlackboardEntry,
): BlackboardEntry | null {
  const value = storeEntry.value as LegacyBlackboardPayload | undefined;
  if (!value?.id || !value.title) return null;
  const status = mapCoordStatus(storeEntry.status);
  return {
    id: value.id,
    type: storeEntry.type as EntryType,
    title: value.title,
    content: value.content ?? '',
    status,
    author: storeEntry.author,
    assignee: value.assignee,
    priority: value.priority ?? 'medium',
    tags: storeEntry.tags ?? [],
    relatedIds: value.relatedIds ?? [],
    rev: storeEntry.rev,
    createdAt: storeEntry.createdAt,
    updatedAt: storeEntry.updatedAt,
  };
}

function mapCoordStatus(
  status: import('./types.js').BlackboardStatus | undefined,
): EntryStatus {
  switch (status) {
    case 'open':
      return 'pending';
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
      return 'blocked';
    case 'done':
    case 'in_review':
      return 'done';
    case 'archived':
      return 'archived';
    default:
      return 'pending';
  }
}

function mapLegacyStatus(status: EntryStatus): import('./types.js').BlackboardStatus {
  switch (status) {
    case 'pending':
      return 'open';
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
      return 'blocked';
    case 'done':
      return 'done';
    case 'archived':
      return 'archived';
  }
}

function readAllEntries(file: string): BlackboardEntry[] {
  const store = readLocked<BlackboardStore>(file, emptyStore());
  const entries: BlackboardEntry[] = [];
  for (const [key, entry] of Object.entries(store.entries)) {
    if (!key.startsWith(LEGACY_PREFIX)) continue;
    const mapped = payloadToEntry(key, entry);
    if (mapped) entries.push(mapped);
  }
  return entries;
}

/**
 * Locked legacy blackboard — same API as the former rco/blackboard.ts.
 */
export class Blackboard {
  private readonly filePath: string;

  constructor(stateDir?: string) {
    this.filePath = stateDir
      ? path.join(stateDir, 'blackboard.json')
      : blackboardFile();
  }

  post(entry: NewEntry): BlackboardEntry {
    const now = Date.now();
    const id = randomUUID();
    let result!: BlackboardEntry;

    mutate<BlackboardStore>(this.filePath, emptyStore(), (cur) => {
      const key = legacyKey(id);
      const payload: LegacyBlackboardPayload = {
        id,
        title: entry.title,
        content: entry.content,
        priority: entry.priority,
        assignee: entry.assignee,
        relatedIds: entry.relatedIds ?? [],
      };
      const stamped = Math.max(
        now,
        ...Object.values(cur.entries).map((e) => e.updatedAt),
        0,
      ) + (Object.keys(cur.entries).length > 0 ? 1 : 0);

      const storeEntry: import('./types.js').BlackboardEntry = {
        key,
        type: entry.type as import('./types.js').BlackboardEntryType,
        value: payload,
        tags: entry.tags ?? [],
        author: entry.author,
        status: mapLegacyStatus(entry.status),
        rev: 1,
        createdAt: stamped,
        updatedAt: stamped,
      };
      cur.entries[key] = storeEntry;
      result = payloadToEntry(key, storeEntry)!;
      return cur;
    });

    return result;
  }

  patch(
    id: string,
    updates: Partial<Omit<BlackboardEntry, 'id' | 'rev' | 'createdAt'>>,
  ): BlackboardEntry | null {
    const now = Date.now();
    let result: BlackboardEntry | null = null;

    mutate<BlackboardStore>(this.filePath, emptyStore(), (cur) => {
      const key = legacyKey(id);
      const existing = cur.entries[key];
      if (!existing) return cur;

      const prev = payloadToEntry(key, existing);
      if (!prev) return cur;

      const merged: BlackboardEntry = {
        ...prev,
        ...updates,
        id,
        rev: existing.rev + 1,
        updatedAt: now,
      };

      const payload: LegacyBlackboardPayload = {
        id,
        title: merged.title,
        content: merged.content,
        priority: merged.priority,
        assignee: merged.assignee,
        relatedIds: merged.relatedIds,
      };

      cur.entries[key] = {
        ...existing,
        type: (updates.type ?? prev.type) as import('./types.js').BlackboardEntryType,
        value: payload,
        tags: updates.tags ?? prev.tags,
        author: updates.author ?? prev.author,
        status: mapLegacyStatus(merged.status),
        rev: existing.rev + 1,
        updatedAt: now,
      };
      result = payloadToEntry(key, cur.entries[key]!)!;
      return cur;
    });

    return result;
  }

  archive(id: string): BlackboardEntry | null {
    return this.patch(id, { status: 'archived' });
  }

  get(id: string): BlackboardEntry | undefined {
    const store = readLocked<BlackboardStore>(this.filePath, emptyStore());
    const entry = store.entries[legacyKey(id)];
    if (!entry) return undefined;
    return payloadToEntry(legacyKey(id), entry) ?? undefined;
  }

  read(filter?: BlackboardFilter): BlackboardEntry[] {
    let list = readAllEntries(this.filePath);
    if (!filter) return list;
    for (const [k, v] of Object.entries(filter) as [keyof BlackboardFilter, unknown][]) {
      if (v !== undefined) list = list.filter((e) => e[k] === v);
    }
    return list;
  }

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
          items
            .map(
              (e) =>
                `- [${e.status}] **${e.title}**${e.assignee ? ` (→ ${e.assignee})` : ''}\n  ${e.content.slice(0, 200)}`,
            )
            .join('\n'),
      );
    }
    return sections.join('\n\n');
  }
}
