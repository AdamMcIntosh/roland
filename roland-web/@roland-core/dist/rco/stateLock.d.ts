/**
 * Simple fs-based lock for parallel-swarm shared state access
 */
export declare function acquireLock(stateFilePath: string): () => void;
export declare function readStateUnlocked<T>(stateFilePath: string): T | null;
export declare function writeStateUnlocked(stateFilePath: string, state: unknown): void;
//# sourceMappingURL=stateLock.d.ts.map