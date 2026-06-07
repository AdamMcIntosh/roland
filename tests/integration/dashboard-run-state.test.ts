/**
 * Integration: dashboard HTTP /api/run-state and WebSocket state-update parity.
 * Spawns scripts/serve-dashboard.js on a free port with a seeded temp state dir.
 */

import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  RUN_STATE_FILE,
  SUPERVISOR_PID_FILE,
} from '../../src/rco/mission-state.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboardScript = path.join(repoRoot, 'scripts', 'serve-dashboard.js');

const servers: ChildProcess[] = [];
const tmpDirs: string[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function makeStateDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-dash-e2e-'));
  tmpDirs.push(dir);
  return dir;
}

function writeRunState(
  stateDir: string,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const record = {
    runId: 'test-run',
    goal: 'integration test mission',
    status: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    totalTasks: 1,
    completedTasks: 0,
    tasks: [],
    activeTaskIds: [],
    ...partial,
  };
  fs.writeFileSync(path.join(stateDir, RUN_STATE_FILE), JSON.stringify(record));
  return record;
}

function writeSupervisor(stateDir: string, pid: number): void {
  fs.writeFileSync(
    path.join(stateDir, SUPERVISOR_PID_FILE),
    JSON.stringify({ pid, goal: 'integration test', startedAt: Date.now() }),
  );
}

function spawnDashboard(stateDir: string, port: number): ChildProcess {
  const child = spawn(
    process.execPath,
    [dashboardScript, '--state-dir', stateDir, '--port', String(port), '--host', '127.0.0.1'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    },
  );
  servers.push(child);
  return child;
}

async function waitForDashboard(baseUrl: string, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/run-state`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error(`Dashboard not ready at ${baseUrl}`);
}

async function stopDashboard(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    sleep(2_000).then(() => {
      if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
    }),
  ]);
}

async function fetchRunState(baseUrl: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/api/run-state`);
  expect(res.status).toBe(200);
  return res.json();
}

async function readInitialWsUpdate(wsUrl: string): Promise<{
  type: string;
  runState: unknown;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('WebSocket initial message timeout'));
    }, 5_000);

    ws.on('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()) as { type: string; runState: unknown });
      } catch (err) {
        reject(err);
      } finally {
        ws.close();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function expectHttpWsParity(baseUrl: string, wsUrl: string): Promise<void> {
  const httpRunState = await fetchRunState(baseUrl);
  const wsMsg = await readInitialWsUpdate(wsUrl);
  expect(wsMsg.type).toBe('state-update');
  expect(wsMsg.runState).toEqual(httpRunState);
}

describe('dashboard /api/run-state and WebSocket parity', () => {
  let stateDir: string;
  let port: number;
  let baseUrl: string;
  let wsUrl: string;
  let child: ChildProcess;

  beforeEach(async () => {
    stateDir = makeStateDir();
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}`;
    child = spawnDashboard(stateDir, port);
    await waitForDashboard(baseUrl);
  });

  afterEach(async () => {
    await stopDashboard(child);
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const proc of servers.splice(0)) {
      await stopDashboard(proc);
    }
  });

  it('returns null when run-state is stale and supervisor is absent', async () => {
    writeRunState(stateDir, {
      runId: 'stale-run',
      status: 'running',
      updatedAt: Date.now() - 900_000,
    });

    await expectHttpWsParity(baseUrl, wsUrl);
    expect(await fetchRunState(baseUrl)).toBeNull();
  });

  it('returns null when supervisor PID is dead and run-state is stale', async () => {
    writeSupervisor(stateDir, 9_999_999_999);
    writeRunState(stateDir, {
      runId: 'dead-supervisor',
      status: 'running',
      updatedAt: Date.now() - 900_000,
    });

    await expectHttpWsParity(baseUrl, wsUrl);
    expect(await fetchRunState(baseUrl)).toBeNull();
  });

  it('returns run-state when supervisor is alive', async () => {
    const seeded = writeRunState(stateDir, {
      runId: 'live-supervisor',
      status: 'planning',
      updatedAt: Date.now() - 900_000,
    });
    writeSupervisor(stateDir, process.pid);

    const httpRunState = await fetchRunState(baseUrl);
    expect(httpRunState).toMatchObject({ runId: 'live-supervisor', goal: seeded.goal });

    const wsMsg = await readInitialWsUpdate(wsUrl);
    expect(wsMsg.type).toBe('state-update');
    expect(wsMsg.runState).toEqual(httpRunState);
  });

  it('returns run-state when run-state is fresh and active', async () => {
    const seeded = writeRunState(stateDir, {
      runId: 'fresh-run',
      status: 'running',
      updatedAt: Date.now(),
    });
    writeSupervisor(stateDir, process.pid);

    await expectHttpWsParity(baseUrl, wsUrl);
    expect(await fetchRunState(baseUrl)).toMatchObject({
      runId: 'fresh-run',
      goal: seeded.goal,
      status: 'running',
    });
  });
});
