/**
 * Atomic JSON store helpers for the coordination substrate.
 *
 * Reuses the existing fs-based lock from src/rco/stateLock.ts (the same scheme
 * parallel-swarm uses) rather than inventing a second locking mechanism. This
 * matters because sub-agents the host spawns are separate processes, each with
 * its own Roland MCP connection — so Blackboard / Bus writes can genuinely race.
 *
 * Each store gets its own file (blackboard.json, bus.json) and therefore its own
 * lock file, so the two primitives never contend with each other.
 */
/** Read a store under the lock, avoiding torn reads against a concurrent write. */
export declare function readLocked<T>(file: string, init: T): T;
/**
 * Read-modify-write a store atomically. `fn` receives the current state (or
 * `init` if the file is absent) and returns the next state to persist.
 * The returned value is the persisted next state.
 */
export declare function mutate<T>(file: string, init: T, fn: (cur: T) => T): T;
//# sourceMappingURL=store.d.ts.map