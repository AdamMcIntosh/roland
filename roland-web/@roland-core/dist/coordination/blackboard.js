/**
 * Blackboard — durable shared awareness.
 *
 * A keyed store of facts, decisions, tasks, artifacts, blockers and statuses
 * that every agent can read and write. Entries are rev-stamped for optimistic
 * concurrency: a writer may pass expectedRev to guard against clobbering a
 * concurrent update (throws ConcurrencyError on mismatch).
 */
import { BlackboardPatchInputSchema, BlackboardPostInputSchema, BlackboardQuerySchema, ConcurrencyError, } from './types.js';
import { blackboardFile } from './paths.js';
import { mutate, readLocked } from './store.js';
/**
 * A fresh empty store. Must be a factory, never a shared constant: `mutate`
 * writes into the init object when the file is absent, so handing out the same
 * object (or a shallow `{ ...EMPTY }` copy, which shares the nested `entries`)
 * would let the first write to one file leak into reads of every other file.
 */
const emptyStore = () => ({ entries: {} });
export class Blackboard {
    file;
    constructor(file = blackboardFile()) {
        this.file = file;
    }
    /** Create a new entry or update an existing one (by key). Bumps rev. */
    post(input) {
        const parsed = BlackboardPostInputSchema.parse(input);
        const now = Date.now();
        let result;
        mutate(this.file, emptyStore(), (cur) => {
            const existing = cur.entries[parsed.key];
            if (existing &&
                parsed.expectedRev !== undefined &&
                existing.rev !== parsed.expectedRev) {
                throw new ConcurrencyError(parsed.key, parsed.expectedRev, existing.rev);
            }
            const entry = {
                key: parsed.key,
                type: parsed.type,
                value: parsed.value,
                tags: parsed.tags ?? existing?.tags ?? [],
                author: parsed.author,
                status: parsed.status ?? existing?.status,
                rev: existing ? existing.rev + 1 : 1,
                createdAt: existing ? existing.createdAt : now,
                updatedAt: now,
            };
            cur.entries[parsed.key] = entry;
            result = entry;
            return cur;
        });
        return result;
    }
    /** Partially update an existing entry. Throws if the key does not exist. */
    patch(input) {
        const parsed = BlackboardPatchInputSchema.parse(input);
        const now = Date.now();
        let result;
        mutate(this.file, emptyStore(), (cur) => {
            const existing = cur.entries[parsed.key];
            if (!existing) {
                throw new Error(`Blackboard entry not found: ${parsed.key}`);
            }
            if (parsed.expectedRev !== undefined && existing.rev !== parsed.expectedRev) {
                throw new ConcurrencyError(parsed.key, parsed.expectedRev, existing.rev);
            }
            const entry = {
                ...existing,
                type: parsed.changes.type ?? existing.type,
                value: 'value' in parsed.changes ? parsed.changes.value : existing.value,
                tags: parsed.changes.tags ?? existing.tags,
                status: parsed.changes.status ?? existing.status,
                author: parsed.author,
                rev: existing.rev + 1,
                updatedAt: now,
            };
            cur.entries[parsed.key] = entry;
            result = entry;
            return cur;
        });
        return result;
    }
    /** Read entries matching a filter, newest first. */
    read(query = { limit: 50 }) {
        const q = BlackboardQuerySchema.parse(query);
        const store = readLocked(this.file, emptyStore());
        let entries = Object.values(store.entries);
        if (!q.includeArchived) {
            entries = entries.filter((e) => e.status !== 'archived');
        }
        if (q.key !== undefined)
            entries = entries.filter((e) => e.key === q.key);
        if (q.type !== undefined)
            entries = entries.filter((e) => e.type === q.type);
        if (q.author !== undefined)
            entries = entries.filter((e) => e.author === q.author);
        if (q.status !== undefined)
            entries = entries.filter((e) => e.status === q.status);
        if (q.since !== undefined)
            entries = entries.filter((e) => e.updatedAt >= q.since);
        if (q.tags && q.tags.length > 0) {
            const want = new Set(q.tags);
            entries = entries.filter((e) => e.tags.some((t) => want.has(t)));
        }
        entries.sort((a, b) => b.updatedAt - a.updatedAt);
        return entries.slice(0, q.limit);
    }
    /** Soft-delete: mark an entry archived (kept for audit, hidden by default). */
    archive(key, author) {
        return this.patch({ key, author, changes: { status: 'archived' } });
    }
}
//# sourceMappingURL=blackboard.js.map