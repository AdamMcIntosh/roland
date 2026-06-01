/**
 * Blackboard — durable shared awareness.
 *
 * A keyed store of facts, decisions, tasks, artifacts, blockers and statuses
 * that every agent can read and write. Entries are rev-stamped for optimistic
 * concurrency: a writer may pass expectedRev to guard against clobbering a
 * concurrent update (throws ConcurrencyError on mismatch).
 */
import { BlackboardEntry, BlackboardPatchInput, BlackboardPostInput, BlackboardQuery } from './types.js';
export declare class Blackboard {
    private readonly file;
    constructor(file?: string);
    /** Create a new entry or update an existing one (by key). Bumps rev. */
    post(input: BlackboardPostInput): BlackboardEntry;
    /** Partially update an existing entry. Throws if the key does not exist. */
    patch(input: BlackboardPatchInput): BlackboardEntry;
    /** Read entries matching a filter, newest first. */
    read(query?: BlackboardQuery): BlackboardEntry[];
    /** Soft-delete: mark an entry archived (kept for audit, hidden by default). */
    archive(key: string, author: string): BlackboardEntry;
}
//# sourceMappingURL=blackboard.d.ts.map