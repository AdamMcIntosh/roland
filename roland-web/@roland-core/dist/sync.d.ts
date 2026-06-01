/**
 * Phase 4 stub: Cloud sync using Git remotes for state (YAML push/pull).
 * Full implementation planned for v0.2 (see ROADMAP.md).
 */
import { z } from 'zod';
export declare const SyncRemoteSchema: z.ZodObject<{
    name: z.ZodString;
    url: z.ZodString;
    branch: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    url: string;
    branch: string;
}, {
    name: string;
    url: string;
    branch?: string | undefined;
}>;
export type SyncRemote = z.infer<typeof SyncRemoteSchema>;
export declare const SyncStateSchema: z.ZodObject<{
    lastPushAt: z.ZodOptional<z.ZodNumber>;
    lastPullAt: z.ZodOptional<z.ZodNumber>;
    remote: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    lastPushAt?: number | undefined;
    lastPullAt?: number | undefined;
    remote?: string | undefined;
}, {
    lastPushAt?: number | undefined;
    lastPullAt?: number | undefined;
    remote?: string | undefined;
}>;
export type SyncState = z.infer<typeof SyncStateSchema>;
/** Stub: resolve path to state file (project root or cwd). */
export declare function getSyncStatePath(cwd?: string): string;
/** Stub: read current sync state. Returns null if not initialized. */
export declare function readSyncState(cwd?: string): SyncState | null;
/** Stub: write sync state (e.g. after push/pull). */
export declare function writeSyncState(state: SyncState, cwd?: string): void;
/**
 * Stub: push local state (e.g. YAML exports) to a Git remote.
 * Full impl in v0.2 will run git push to configured remote/branch.
 */
export declare function pushToRemote(_remote: SyncRemote, _paths: string[], _cwd?: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Stub: pull remote state into local (e.g. YAML).
 * Full impl in v0.2 will run git pull from configured remote/branch.
 */
export declare function pullFromRemote(_remote: SyncRemote, _cwd?: string): Promise<{
    success: boolean;
    error?: string;
}>;
//# sourceMappingURL=sync.d.ts.map