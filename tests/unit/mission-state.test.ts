import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archiveMissionMeta,
  buildSupervisorStartDiagnostics,
  cleanupPreviousRuns,
  isolateProjectMissionState,
  readActiveMissionMeta,
  readActiveRunStateForClient,
  readMissionMetaFile,
  sanitizeStaleMissionState,
  waitForSupervisorReady,
  SUPERVISOR_PID_FILE,
  MISSION_META_FILE,
  RUN_STATE_FILE,
} from '../../src/rco/mission-state.js';

const tmpDirs: string[] = [];

function makeStateDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-mission-state-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('mission-state', () => {
  it('archives stale run-state when supervisor PID is dead', () => {
    const stateDir = makeStateDir();
    fs.writeFileSync(
      path.join(stateDir, SUPERVISOR_PID_FILE),
      JSON.stringify({ pid: 999999999, goal: 'old goal', startedAt: Date.now() }),
    );
    fs.writeFileSync(
      path.join(stateDir, RUN_STATE_FILE),
      JSON.stringify({
        runId: 'abc123',
        goal: 'Fix Zod',
        status: 'running',
        startedAt: Date.now(),
        updatedAt: Date.now(),
        totalTasks: 2,
        completedTasks: 0,
        tasks: [],
        activeTaskIds: [],
      }),
    );

    const result = sanitizeStaleMissionState(stateDir);
    expect(result.changed).toBe(true);
    expect(result.actions).toContain('removed_stale_supervisor_pid');
    expect(result.actions).toContain('archived_stale_run_state');

    const rs = JSON.parse(fs.readFileSync(path.join(stateDir, RUN_STATE_FILE), 'utf-8'));
    expect(rs.status).toBe('done');
    expect(fs.existsSync(path.join(stateDir, SUPERVISOR_PID_FILE))).toBe(false);
  });

  it('readActiveMissionMeta returns null for archived meta', () => {
    const stateDir = makeStateDir();
    fs.writeFileSync(
      path.join(stateDir, MISSION_META_FILE),
      JSON.stringify({
        goal: 'FinTrack bootstrap',
        status: 'archived',
        startedAt: Date.now() - 60_000,
      }),
    );
    expect(readActiveMissionMeta(stateDir)).toBeNull();
  });

  it('isolateProjectMissionState archives idle mission-meta in target project', () => {
    const stateDir = makeStateDir();
    fs.writeFileSync(
      path.join(stateDir, MISSION_META_FILE),
      JSON.stringify({
        goal: 'Jest blocker fix',
        status: 'active',
        startedAt: Date.now() - 3_600_000,
        pid: null,
      }),
    );

    const result = isolateProjectMissionState(stateDir);
    expect(result.archived).toBe(true);

    const meta = readMissionMetaFile(stateDir);
    expect(meta?.status).toBe('archived');
    expect(readActiveMissionMeta(stateDir)).toBeNull();
  });

  it('cleanupPreviousRuns archives prior mission-meta before a new launch', () => {
    const stateDir = makeStateDir();
    fs.writeFileSync(
      path.join(stateDir, MISSION_META_FILE),
      JSON.stringify({
        goal: 'Old mission',
        status: 'active',
        startedAt: Date.now() - 120_000,
      }),
    );

    const boardCalls: string[] = [];
    const result = cleanupPreviousRuns(stateDir, 'FinTrack MVP', {
      runBoardCleanup: (dir, g) => {
        boardCalls.push(`${dir}:${g}`);
        return { ok: true };
      },
    });

    expect(result.metaArchived).toBe(true);
    expect(boardCalls).toHaveLength(1);
    expect(archiveMissionMeta(stateDir, 'again')).toBe(false);
  });

  it('readActiveRunStateForClient returns null for stale run-state without supervisor', () => {
    const stateDir = makeStateDir();
    fs.writeFileSync(
      path.join(stateDir, RUN_STATE_FILE),
      JSON.stringify({
        runId: 'old',
        status: 'running',
        updatedAt: Date.now() - 900_000,
      }),
    );
    expect(readActiveRunStateForClient(stateDir)).toBeNull();
  });

  it('readActiveRunStateForClient returns run-state when supervisor is alive', () => {
    const stateDir = makeStateDir();
    const rs = {
      runId: 'live',
      status: 'done',
      updatedAt: Date.now() - 900_000,
      goal: 'test',
    };
    fs.writeFileSync(path.join(stateDir, RUN_STATE_FILE), JSON.stringify(rs));
    fs.writeFileSync(
      path.join(stateDir, SUPERVISOR_PID_FILE),
      JSON.stringify({ pid: process.pid, goal: 'test', startedAt: Date.now() }),
    );
    expect(readActiveRunStateForClient(stateDir)).toMatchObject({ runId: 'live' });
  });

  it('waitForSupervisorReady resolves when supervisor.pid has live PID', async () => {
    const stateDir = makeStateDir();
    fs.writeFileSync(
      path.join(stateDir, SUPERVISOR_PID_FILE),
      JSON.stringify({
        pid: process.pid,
        goal: 'ready test',
        startedAt: Date.now(),
        logFile: path.join(stateDir, 'logs', 'bg-test.log'),
      }),
    );

    const result = await waitForSupervisorReady(stateDir, { timeoutMs: 2_000 });
    expect(result.ready).toBe(true);
    expect(result.record?.pid).toBe(process.pid);
  });

  it('waitForSupervisorReady times out when supervisor.pid is missing', async () => {
    const stateDir = makeStateDir();
    const result = await waitForSupervisorReady(stateDir, {
      timeoutMs: 400,
      pollIntervalMs: 100,
    });
    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/not written|not running/i);
  });

  it('buildSupervisorStartDiagnostics includes log tail when log file exists', () => {
    const stateDir = makeStateDir();
    const logDir = path.join(stateDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'bg-test.log');
    fs.writeFileSync(logFile, 'line1\nline2\nSUPERVISOR_FAIL\n');
    fs.writeFileSync(
      path.join(stateDir, SUPERVISOR_PID_FILE),
      JSON.stringify({ pid: 999999999, goal: 'x', startedAt: Date.now(), logFile }),
    );

    const diag = buildSupervisorStartDiagnostics(stateDir, 'spawn failed');
    expect(diag.message).toContain('spawn failed');
    expect(diag.logFile).toBe(logFile);
    expect(diag.logTail).toContain('SUPERVISOR_FAIL');
    expect(diag.hints.length).toBeGreaterThan(0);
  });
});
