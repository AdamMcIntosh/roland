import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { isRunActive } from '../../src/rco/hitl.js';
import { RUN_STATE_FILE, SUPERVISOR_PID_FILE } from '../../src/rco/mission-state.js';

const tmpDirs: string[] = [];

function makeStateDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-hitl-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('hitl.isRunActive', () => {
  it('returns false for stale run-state without supervisor', () => {
    const stateDir = makeStateDir();
    const staleAt = Date.now() - 900_000;
    fs.writeFileSync(
      path.join(stateDir, RUN_STATE_FILE),
      JSON.stringify({
        runId: 'old',
        status: 'running',
        updatedAt: staleAt,
      }),
    );
    expect(isRunActive(stateDir)).toBe(false);
  });

  it('returns true for fresh active run-state', () => {
    const stateDir = makeStateDir();
    const now = Date.now();
    fs.writeFileSync(
      path.join(stateDir, RUN_STATE_FILE),
      JSON.stringify({
        runId: 'live',
        status: 'running',
        updatedAt: now,
      }),
    );
    expect(isRunActive(stateDir)).toBe(true);
  });

  it('returns true when supervisor is alive even if run-state is stale', () => {
    const stateDir = makeStateDir();
    fs.writeFileSync(
      path.join(stateDir, SUPERVISOR_PID_FILE),
      JSON.stringify({ pid: process.pid, goal: 'test', startedAt: Date.now() }),
    );
    fs.writeFileSync(
      path.join(stateDir, RUN_STATE_FILE),
      JSON.stringify({
        runId: 'old',
        status: 'done',
        updatedAt: Date.now() - 900_000,
      }),
    );
    expect(isRunActive(stateDir)).toBe(true);
  });
});
