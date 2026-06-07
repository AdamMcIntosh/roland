/**
 * Mission state isolation — per-project cleanup, archival, and stale-file hygiene.
 *
 * Used by the dashboard server and CLI to prevent mission context bleeding
 * across project switches and to retire dead supervisor / run-state artifacts.
 */

import fs from 'fs';
import path from 'path';

export const MISSION_META_FILE = 'mission-meta.json';
export const SUPERVISOR_PID_FILE = 'supervisor.pid';
export const RUN_STATE_FILE = 'run-state.json';
export const MISSION_ARCHIVE_FILE = 'mission-archive.jsonl';

const ACTIVE_RUN_STATUSES = new Set(['planning', 'running', 'reviewing', 'synthesizing']);
const RUN_STALE_MS = 600_000;

export type StateLogger = (msg: string, detail?: Record<string, unknown>) => void;

export interface MissionMetaRecord {
  id?: string;
  goal?: string;
  effectiveGoal?: string;
  runName?: string | null;
  status?: 'active' | 'archived' | 'completed';
  startedAt?: number;
  archivedAt?: number;
  archiveReason?: string;
  pid?: number | null;
  projectRoot?: string;
  stateDir?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface SupervisorRecord {
  pid: number;
  goal?: string;
  startedAt?: number;
  logFile?: string;
  restarts?: number;
}

export interface RunStateRecord {
  runId?: string;
  goal?: string;
  status?: string;
  startedAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface SanitizeResult {
  changed: boolean;
  actions: string[];
}

export interface IsolateResult extends SanitizeResult {
  archived: boolean;
}

export interface CleanupPreviousRunsResult {
  sanitized: SanitizeResult;
  metaArchived: boolean;
  boardCleanup?: unknown;
}

function noopLog(): void { /* */ }

export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function appendMissionArchiveLine(stateDir: string, record: MissionMetaRecord): void {
  const line = JSON.stringify({ ...record, archivedAt: record.archivedAt ?? Date.now() });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.appendFileSync(path.join(stateDir, MISSION_ARCHIVE_FILE), line + '\n', 'utf-8');
}

export function readMissionMetaFile(stateDir: string): MissionMetaRecord | null {
  const meta = readJsonFile<MissionMetaRecord | null>(
    path.join(stateDir, MISSION_META_FILE),
    null,
  );
  return meta && typeof meta === 'object' ? meta : null;
}

export function writeMissionMetaFile(stateDir: string, meta: MissionMetaRecord): void {
  writeJsonFile(path.join(stateDir, MISSION_META_FILE), { ...meta, updatedAt: Date.now() });
}

export function readSupervisorRecord(stateDir: string): SupervisorRecord | null {
  const rec = readJsonFile<SupervisorRecord | null>(
    path.join(stateDir, SUPERVISOR_PID_FILE),
    null,
  );
  return rec?.pid ? rec : null;
}

export function readRunStateRecord(stateDir: string): RunStateRecord | null {
  const rs = readJsonFile<RunStateRecord | null>(
    path.join(stateDir, RUN_STATE_FILE),
    null,
  );
  return rs?.runId ? rs : null;
}

export function isSupervisorAlive(stateDir: string): boolean {
  const rec = readSupervisorRecord(stateDir);
  return Boolean(rec?.pid && isProcessAlive(rec.pid));
}

export function isRunStateActive(stateDir: string, now = Date.now()): boolean {
  const rs = readRunStateRecord(stateDir);
  if (!rs?.runId || !rs.status) return false;
  const fresh = Boolean(rs.updatedAt && now - rs.updatedAt < RUN_STALE_MS);
  return ACTIVE_RUN_STATUSES.has(rs.status) && fresh;
}

/** Mission meta is active only when not archived and supervisor or run-state is live. */
export function isMissionMetaActive(meta: MissionMetaRecord | null, stateDir: string): boolean {
  if (!meta || meta.status === 'archived' || meta.status === 'completed') return false;
  if (isSupervisorAlive(stateDir)) return true;
  return isRunStateActive(stateDir);
}

/** Return mission-meta only when it represents a live mission in this state dir. */
export function readActiveMissionMeta(stateDir: string): MissionMetaRecord | null {
  const meta = readMissionMetaFile(stateDir);
  return isMissionMetaActive(meta, stateDir) ? meta : null;
}

export function archiveMissionMeta(
  stateDir: string,
  reason: string,
  log: StateLogger = noopLog,
): boolean {
  const meta = readMissionMetaFile(stateDir);
  if (!meta || meta.status === 'archived' || meta.status === 'completed') return false;

  const archived: MissionMetaRecord = {
    ...meta,
    status: 'archived',
    archivedAt: Date.now(),
    archiveReason: reason,
  };

  try {
    appendMissionArchiveLine(stateDir, archived);
    writeMissionMetaFile(stateDir, archived);
    log('Archived mission-meta', { stateDir, reason, goal: meta.goal?.slice(0, 80) ?? null });
    return true;
  } catch (e) {
    log('Failed to archive mission-meta', {
      stateDir,
      reason,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/**
 * Remove dead supervisor PID files and retire stale active run-state / mission-meta.
 */
export function sanitizeStaleMissionState(
  stateDir: string,
  log: StateLogger = noopLog,
  now = Date.now(),
): SanitizeResult {
  const actions: string[] = [];
  let changed = false;

  const supervisorPath = path.join(stateDir, SUPERVISOR_PID_FILE);
  const supervisor = readSupervisorRecord(stateDir);
  const supervisorAlive = Boolean(supervisor?.pid && isProcessAlive(supervisor.pid));

  if (supervisor && !supervisorAlive) {
    try {
      fs.rmSync(supervisorPath, { force: true });
      actions.push('removed_stale_supervisor_pid');
      changed = true;
      log('Removed stale supervisor.pid', { stateDir, pid: supervisor.pid });
    } catch { /* ignore */ }
  }

  const runStatePath = path.join(stateDir, RUN_STATE_FILE);
  const runState = readRunStateRecord(stateDir);
  const runActive = Boolean(
    runState?.runId
    && runState.status
    && ACTIVE_RUN_STATUSES.has(runState.status)
    && runState.updatedAt
    && now - runState.updatedAt < RUN_STALE_MS,
  );

  if (runActive && !supervisorAlive) {
    const updated: RunStateRecord = {
      ...runState,
      status: 'done',
      updatedAt: now,
      errorMessage: 'Supervisor process ended — run-state archived by dashboard',
    };
    try {
      writeJsonFile(runStatePath, updated);
      actions.push('archived_stale_run_state');
      changed = true;
      log('Archived stale run-state (dead supervisor)', {
        stateDir,
        runId: runState?.runId ?? null,
        previousStatus: runState?.status ?? null,
      });
    } catch { /* ignore */ }
  }

  const meta = readMissionMetaFile(stateDir);
  const metaStillActive = isMissionMetaActive(meta, stateDir);
  if (meta && meta.status !== 'archived' && meta.status !== 'completed' && !metaStillActive) {
    if (archiveMissionMeta(stateDir, 'stale_mission_state', log)) {
      actions.push('archived_stale_mission_meta');
      changed = true;
    }
  }

  if (!changed) {
    log('Mission state clean', { stateDir, supervisorAlive });
  }

  return { changed, actions };
}

/**
 * On project switch / create (no migration): archive non-active mission context
 * in the target project so prior missions do not bleed into the UI.
 */
export function isolateProjectMissionState(
  stateDir: string,
  log: StateLogger = noopLog,
): IsolateResult {
  log('Isolating project mission context', { stateDir });
  const sanitized = sanitizeStaleMissionState(stateDir, log);
  const meta = readMissionMetaFile(stateDir);
  let archived = sanitized.actions.includes('archived_stale_mission_meta');

  if (!archived && meta && meta.status !== 'archived' && meta.status !== 'completed' && !isMissionMetaActive(meta, stateDir)) {
    archived = archiveMissionMeta(stateDir, 'project_context_isolation', log);
  }

  const actions = [...sanitized.actions];
  if (archived && !actions.includes('archived_isolated_mission_meta') && !actions.includes('archived_stale_mission_meta')) {
    actions.push('archived_isolated_mission_meta');
  }

  return {
    changed: sanitized.changed || archived,
    actions,
    archived,
  };
}

/**
 * Before starting a fresh mission: sanitize stale artifacts and archive prior mission-meta.
 */
export function cleanupPreviousRuns(
  stateDir: string,
  goal: string,
  options: {
    dryRun?: boolean;
    runBoardCleanup?: (stateDir: string, missionGoal: string) => unknown;
  } = {},
  log: StateLogger = noopLog,
): CleanupPreviousRunsResult {
  log('Cleaning up previous runs before new mission', {
    stateDir,
    goal: goal.slice(0, 80),
    dryRun: Boolean(options.dryRun),
  });

  const sanitized = sanitizeStaleMissionState(stateDir, log);
  let metaArchived = sanitized.actions.includes('archived_stale_mission_meta');

  const meta = readMissionMetaFile(stateDir);
  if (!metaArchived && meta && meta.status !== 'archived' && meta.status !== 'completed') {
    if (options.dryRun) {
      metaArchived = true;
      log('Would archive prior mission-meta (dry run)', { stateDir });
    } else {
      metaArchived = archiveMissionMeta(stateDir, 'new_mission_start', log);
    }
  }

  let boardCleanup: unknown;
  if (!options.dryRun && options.runBoardCleanup) {
    boardCleanup = options.runBoardCleanup(stateDir, goal);
    log('Board cleanup completed for new mission', { stateDir });
  }

  return { sanitized, metaArchived, boardCleanup };
}
