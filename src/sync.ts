/**
 * Phase 4 stub: Cloud sync using Git remotes for state (YAML push/pull).
 * Full implementation planned for v0.2 (see ROADMAP.md).
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const LOG_PREFIX = '[RCO sync]';

export const SyncRemoteSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  branch: z.string().default('main'),
});

export type SyncRemote = z.infer<typeof SyncRemoteSchema>;

export const SyncStateSchema = z.object({
  lastPushAt: z.number().optional(),
  lastPullAt: z.number().optional(),
  remote: z.string().optional(),
});

export type SyncState = z.infer<typeof SyncStateSchema>;

const SYNC_STATE_FILE = '.rco-sync-state.json';

/** Stub: resolve path to state file (project root or cwd). */
export function getSyncStatePath(cwd: string = process.cwd()): string {
  return path.join(cwd, SYNC_STATE_FILE);
}

/** Stub: read current sync state. Returns null if not initialized. */
export function readSyncState(cwd: string = process.cwd()): SyncState | null {
  const p = getSyncStatePath(cwd);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as unknown;
    const parsed = SyncStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Stub: write sync state (e.g. after push/pull). */
export function writeSyncState(state: SyncState, cwd: string = process.cwd()): void {
  const p = getSyncStatePath(cwd);
  fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
  if (process.env.RCO_VERBOSE !== '0') {
    console.error(`${LOG_PREFIX} State written to ${p}`);
  }
}

/**
 * Stub: push local state (e.g. YAML exports) to a Git remote.
 * Full impl in v0.2 will run git push to configured remote/branch.
 */
export async function pushToRemote(
  _remote: SyncRemote,
  _paths: string[],
  _cwd?: string
): Promise<{ success: boolean; error?: string }> {
  if (process.env.RCO_VERBOSE !== '0') {
    console.error(`${LOG_PREFIX} pushToRemote stub — full impl in v0.2`);
  }
  return { success: false, error: 'Cloud sync not implemented; planned for v0.2' };
}

/**
 * Stub: pull remote state into local (e.g. YAML).
 * Full impl in v0.2 will run git pull from configured remote/branch.
 */
export async function pullFromRemote(
  _remote: SyncRemote,
  _cwd?: string
): Promise<{ success: boolean; error?: string }> {
  if (process.env.RCO_VERBOSE !== '0') {
    console.error(`${LOG_PREFIX} pullFromRemote stub — full impl in v0.2`);
  }
  return { success: false, error: 'Cloud sync not implemented; planned for v0.2' };
}
