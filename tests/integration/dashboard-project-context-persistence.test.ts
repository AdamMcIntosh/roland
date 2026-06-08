/**
 * Integration: project context persists across server restart after switch/create.
 *
 * Spawns scripts/serve-dashboard.js with --state-dir and --project-root (CLI override
 * path that previously skipped lastProjectPath restore on boot).
 *
 * Run: npx vitest run tests/integration/dashboard-project-context-persistence.test.ts
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboardScript = path.join(repoRoot, 'scripts', 'serve-dashboard.js');
const distMissionState = path.join(repoRoot, 'dist', 'rco', 'mission-state.js');

const servers: ChildProcess[] = [];
const tmpRoots: string[] = [];

interface Harness {
  anchorRoot: string;
  stateDir: string;
  secondaryRoot: string;
  port: number;
  baseUrl: string;
  child: ChildProcess;
}

function ensureDistBuilt(): void {
  if (fs.existsSync(distMissionState)) return;
  execSync('npm run build', { cwd: repoRoot, stdio: 'pipe' });
}

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

function seedProject(root: string, withRoland = true): void {
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  if (withRoland) {
    fs.mkdirSync(path.join(root, '.roland'), { recursive: true });
    fs.writeFileSync(path.join(root, '.roland', 'memory.md'), '# Project Memory\n', 'utf-8');
  }
}

function bootstrapTree(): { anchorRoot: string; stateDir: string; secondaryRoot: string } {
  const anchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-persist-anchor-'));
  const stateDir = path.join(anchorRoot, '.roland');
  const secondaryRoot = path.join(anchorRoot, 'secondary-project');
  fs.mkdirSync(stateDir, { recursive: true });
  seedProject(anchorRoot);
  seedProject(secondaryRoot);
  tmpRoots.push(anchorRoot);
  return { anchorRoot, stateDir, secondaryRoot };
}

function spawnDashboard(
  anchorRoot: string,
  stateDir: string,
  port: number,
): ChildProcess {
  const child = spawn(
    process.execPath,
    [
      dashboardScript,
      '--state-dir',
      stateDir,
      '--project-root',
      anchorRoot,
      '--port',
      String(port),
      '--host',
      '127.0.0.1',
    ],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    },
  );
  servers.push(child);
  return child;
}

async function waitForDashboard(baseUrl: string, timeoutMs = 15_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/project-context`);
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

async function jsonFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function startHarness(): Promise<Harness> {
  const { anchorRoot, stateDir, secondaryRoot } = bootstrapTree();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawnDashboard(anchorRoot, stateDir, port);
  await waitForDashboard(baseUrl);
  return { anchorRoot, stateDir, secondaryRoot, port, baseUrl, child };
}

describe('dashboard project context persistence across restart', () => {
  beforeAll(() => {
    ensureDistBuilt();
  }, 120_000);

  afterEach(async () => {
    for (const proc of servers.splice(0)) {
      await stopDashboard(proc);
    }
    for (const dir of tmpRoots.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('restores switched project after server restart with CLI overrides', async () => {
    const harness = await startHarness();

    const initial = await jsonFetch<{ cwd: string }>(
      `${harness.baseUrl}/api/project-context`,
    );
    expect(initial.body.cwd).toBe(harness.anchorRoot);

    const switched = await jsonFetch<{
      ok: boolean;
      switched: boolean;
      projectContext: { cwd: string };
    }>(`${harness.baseUrl}/api/switch-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: harness.secondaryRoot }),
    });
    expect(switched.status).toBe(200);
    expect(switched.body.switched).toBe(true);
    expect(switched.body.projectContext.cwd).toBe(harness.secondaryRoot);

    const cfg = JSON.parse(
      fs.readFileSync(path.join(harness.anchorRoot, '.roland', 'config.json'), 'utf-8'),
    ) as { lastProjectPath: string };
    expect(cfg.lastProjectPath).toBe(harness.secondaryRoot);

    await stopDashboard(harness.child);

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const restarted = spawnDashboard(harness.anchorRoot, harness.stateDir, port);
    await waitForDashboard(baseUrl);

    const afterRestart = await jsonFetch<{ cwd: string }>(
      `${baseUrl}/api/project-context`,
    );
    expect(afterRestart.body.cwd).toBe(harness.secondaryRoot);

    const projects = await jsonFetch<{ activePath: string }>(
      `${baseUrl}/api/projects`,
    );
    expect(projects.body.activePath).toBe(harness.secondaryRoot);

    await stopDashboard(restarted);
  }, 30_000);

  it('persists create-project auto-switch across server restart', async () => {
    const harness = await startHarness();
    const newProjectPath = path.join(harness.anchorRoot, 'created-project');

    const created = await jsonFetch<{
      ok: boolean;
      switched: boolean;
      path: string;
      projectContext: { cwd: string };
    }>(`${harness.baseUrl}/api/create-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'created-project',
        parentDir: harness.anchorRoot,
        template: 'empty',
        initGit: true,
        initRoland: true,
        installDeps: false,
        switchContext: true,
      }),
    });
    expect(created.status).toBe(200);
    expect(created.body.switched).toBe(true);
    expect(created.body.path).toBe(newProjectPath);
    expect(created.body.projectContext.cwd).toBe(newProjectPath);

    await stopDashboard(harness.child);

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const restarted = spawnDashboard(harness.anchorRoot, harness.stateDir, port);
    await waitForDashboard(baseUrl);

    const afterRestart = await jsonFetch<{ cwd: string }>(
      `${baseUrl}/api/project-context`,
    );
    expect(afterRestart.body.cwd).toBe(newProjectPath);

    await stopDashboard(restarted);
  }, 30_000);
});
