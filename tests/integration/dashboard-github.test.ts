/**
 * Integration: Dashboard 2.0 GitHub discovery + clone/open HTTP routes.
 *
 * Spawns scripts/serve-dashboard.js on a free port with:
 *   - tests/loaders/dashboard-github-mock-register.mjs (Octokit + git clone double)
 *   - isolated temp anchor project + clone parent directory
 *
 * Setup: npm run build (serve-dashboard imports dist/rco/*).
 * Isolation: Always create fresh server instances and temp dirs per test —
 * never reuse a module-level singleton across tests.
 *
 * Run: npx vitest run tests/integration/dashboard-github.test.ts
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboardScript = path.join(repoRoot, 'scripts', 'serve-dashboard.js');
const mockRegisterScript = path.join(repoRoot, 'tests/loaders/dashboard-github-mock-register.mjs');
const distMissionState = path.join(repoRoot, 'dist', 'rco', 'mission-state.js');

/** 32-byte hex key for deterministic PAT encryption in connect tests. */
const TEST_PAT_KEY = '0123456789abcdef'.repeat(4);
const VALID_PAT = 'ghp_test_valid_token';

const servers: ChildProcess[] = [];
const tmpRoots: string[] = [];

interface TestHarness {
  anchorRoot: string;
  stateDir: string;
  cloneParent: string;
  port: number;
  baseUrl: string;
  child: ChildProcess;
}

let harness: TestHarness;

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

function bootstrapAnchorTree(): { anchorRoot: string; stateDir: string; cloneParent: string } {
  const anchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-gh-anchor-'));
  const stateDir = path.join(anchorRoot, '.roland');
  const cloneParent = path.join(anchorRoot, 'clone-parent');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(cloneParent, { recursive: true });
  tmpRoots.push(anchorRoot);
  return { anchorRoot, stateDir, cloneParent };
}

function seedLocalRepo(parentDir: string, owner: string, repo: string, withRoland = true): string {
  const dir = path.join(parentDir, `${owner}-${repo}`);
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  if (withRoland) {
    fs.mkdirSync(path.join(dir, '.roland'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.roland', 'memory.md'), '# Project Memory\n', 'utf-8');
  }
  return dir;
}

function spawnDashboardWithMock(
  anchorRoot: string,
  stateDir: string,
  port: number,
  extraEnv: Record<string, string | undefined> = {},
): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PAT_ENCRYPTION_KEY: TEST_PAT_KEY,
    ...extraEnv,
  };
  if (!extraEnv.GITHUB_TOKEN) delete env.GITHUB_TOKEN;
  if (!extraEnv.GH_TOKEN) delete env.GH_TOKEN;

  const child = spawn(
    process.execPath,
    [
      '--import',
      mockRegisterScript,
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
      env,
    },
  );
  servers.push(child);
  return child;
}

async function waitForDashboard(baseUrl: string, timeoutMs = 15_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/github/status`);
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
): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T;
  return { status: res.status, body, headers: res.headers };
}

async function startHarness(extraEnv: Record<string, string | undefined> = {}): Promise<TestHarness> {
  const { anchorRoot, stateDir, cloneParent } = bootstrapAnchorTree();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawnDashboardWithMock(anchorRoot, stateDir, port, extraEnv);
  await waitForDashboard(baseUrl);
  return { anchorRoot, stateDir, cloneParent, port, baseUrl, child };
}

describe('dashboard GitHub discovery + clone/open (wired HTTP)', () => {
  beforeAll(() => {
    ensureDistBuilt();
  }, 120_000);

  beforeEach(async () => {
    harness = await startHarness();
  }, 30_000);

  afterEach(async () => {
    await stopDashboard(harness.child);
    for (const proc of servers.splice(0)) {
      if (proc !== harness.child) await stopDashboard(proc);
    }
    for (const dir of tmpRoots.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns disconnected status and structured 400 when GitHub is not connected', async () => {
    const status = await jsonFetch<{ connected: boolean; authSource: null }>(
      `${harness.baseUrl}/api/github/status`,
    );
    expect(status.status).toBe(200);
    expect(status.body.connected).toBe(false);
    expect(status.body.authSource).toBeNull();

    const repos = await jsonFetch<{ error: string }>(`${harness.baseUrl}/api/github/repos`);
    expect(repos.status).toBe(400);
    expect(repos.body.error).toMatch(/not connected/i);
    expect(JSON.stringify(repos.body)).not.toMatch(/stack|at /i);
  });

  it('connects via PAT, lists remote repos with local badges, and honors refresh for new repos', async () => {
    seedLocalRepo(harness.cloneParent, 'testuser', 'already-local');

    const connect = await jsonFetch<{ ok: boolean; login: string }>(
      `${harness.baseUrl}/api/github/connect`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-secret-should-not-leak',
        },
        body: JSON.stringify({ pat: VALID_PAT }),
      },
    );
    expect(connect.status).toBe(200);
    expect(connect.body.ok).toBe(true);
    expect(connect.body.login).toBe('testuser');

    const status = await jsonFetch<{ connected: boolean; authSource: string; login: string }>(
      `${harness.baseUrl}/api/github/status`,
    );
    expect(status.body.connected).toBe(true);
    expect(status.body.authSource).toBe('stored');
    expect(status.body.login).toBe('testuser');

    const parentParam = encodeURIComponent(harness.cloneParent);
    const initial = await jsonFetch<{
      repos: Array<{ name: string; isLocal: boolean; localPath: string | null; isPrivate: boolean }>;
      refreshed: boolean;
      cachedAt: number;
    }>(`${harness.baseUrl}/api/github/repos?parentDir=${parentParam}`);

    expect(initial.status).toBe(200);
    expect(initial.body.refreshed).toBe(false);
    const names = initial.body.repos.map((r) => r.name);
    expect(names).toContain('remote-only');
    expect(names).toContain('already-local');
    expect(names).toContain('private-repo');
    expect(names).not.toContain('brand-new');

    const local = initial.body.repos.find((r) => r.name === 'already-local');
    expect(local?.isLocal).toBe(true);
    expect(local?.localPath).toContain('testuser-already-local');

    const privateRepo = initial.body.repos.find((r) => r.name === 'private-repo');
    expect(privateRepo?.isPrivate).toBe(true);

    const cachedAgain = await jsonFetch<{ cachedAt: number }>(
      `${harness.baseUrl}/api/github/repos?parentDir=${parentParam}`,
    );
    expect(cachedAgain.body.cachedAt).toBe(initial.body.cachedAt);

    const refreshed = await jsonFetch<{
      repos: Array<{ name: string }>;
      refreshed: boolean;
      cachedAt: number;
    }>(`${harness.baseUrl}/api/github/repos?refresh=true&parentDir=${parentParam}`);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshed).toBe(true);
    expect(refreshed.body.cachedAt).toBeGreaterThan(initial.body.cachedAt);
    expect(refreshed.body.repos.map((r) => r.name)).toContain('brand-new');
  });

  it('POST /api/github/clone clones a remote repo, initializes .roland/, and switches context', async () => {
    await jsonFetch(`${harness.baseUrl}/api/github/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pat: VALID_PAT }),
    });

    const clone = await jsonFetch<{
      ok: boolean;
      cloned: boolean;
      alreadyExists: boolean;
      path: string;
      switched: boolean;
      projectContext: { cwd: string; projectName: string };
    }>(`${harness.baseUrl}/api/github/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'testuser',
        repo: 'remote-only',
        parentDir: harness.cloneParent,
        installDeps: false,
        switchContext: true,
      }),
    });

    expect(clone.status).toBe(200);
    expect(clone.body.ok).toBe(true);
    expect(clone.body.cloned).toBe(true);
    expect(clone.body.alreadyExists).toBe(false);
    expect(clone.body.switched).toBe(true);

    const clonePath = clone.body.path;
    expect(fs.existsSync(path.join(clonePath, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(clonePath, '.roland', 'memory.md'))).toBe(true);

    const ctx = await jsonFetch<{ cwd: string; projectName: string }>(
      `${harness.baseUrl}/api/project-context`,
    );
    expect(ctx.status).toBe(200);
    expect(ctx.body.cwd).toBe(clonePath);
    expect(ctx.body.projectName).toBe('testuser-remote-only');
    expect(clone.body.projectContext.cwd).toBe(clonePath);
  });

  it('opens an already-local repo without cloning again', async () => {
    const localPath = seedLocalRepo(harness.cloneParent, 'testuser', 'already-local');

    await jsonFetch(`${harness.baseUrl}/api/github/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pat: VALID_PAT }),
    });

    const open = await jsonFetch<{
      ok: boolean;
      cloned: boolean;
      alreadyExists: boolean;
      path: string;
      switched: boolean;
    }>(`${harness.baseUrl}/api/github/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'testuser',
        repo: 'already-local',
        parentDir: harness.cloneParent,
        installDeps: false,
      }),
    });

    expect(open.status).toBe(200);
    expect(open.body.ok).toBe(true);
    expect(open.body.cloned).toBe(false);
    expect(open.body.alreadyExists).toBe(true);
    expect(open.body.path).toBe(localPath);
    expect(open.body.switched).toBe(true);
  });

  it('uses GITHUB_TOKEN env for private repo listing without stored PAT', async () => {
    await stopDashboard(harness.child);
    servers.splice(servers.indexOf(harness.child), 1);
    harness = await startHarness({ GITHUB_TOKEN: VALID_PAT });

    const status = await jsonFetch<{ connected: boolean; authSource: string; envToken: boolean }>(
      `${harness.baseUrl}/api/github/status`,
    );
    expect(status.body.connected).toBe(true);
    expect(status.body.authSource).toBe('env');

    const repos = await jsonFetch<{ repos: Array<{ name: string; isPrivate: boolean }> }>(
      `${harness.baseUrl}/api/github/repos?parentDir=${encodeURIComponent(harness.cloneParent)}`,
    );
    expect(repos.status).toBe(200);
    expect(repos.body.repos.some((r) => r.name === 'private-repo' && r.isPrivate)).toBe(true);
  });

  it('clones via SSH mock when no PAT is configured', async () => {
    const clone = await jsonFetch<{
      ok: boolean;
      cloned: boolean;
      cloneMethod?: string;
      path: string;
    }>(`${harness.baseUrl}/api/github/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'testuser',
        repo: 'ssh-only',
        parentDir: harness.cloneParent,
        installDeps: false,
      }),
    });

    expect(clone.status).toBe(200);
    expect(clone.body.ok).toBe(true);
    expect(clone.body.cloned).toBe(true);
    expect(fs.existsSync(path.join(clone.body.path, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(clone.body.path, '.roland', 'memory.md'))).toBe(true);
  });

  it('returns structured client errors for invalid connect PAT and corrupted stored PAT', async () => {
    const badConnect = await jsonFetch<{ error: string; needsReconnect?: boolean }>(
      `${harness.baseUrl}/api/github/connect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: 'bad-token' }),
      },
    );
    expect(badConnect.status).toBe(401);
    expect(badConnect.body.error).toMatch(/reconnect|credentials|GitHub/i);
    expect(badConnect.body.needsReconnect).toBe(true);
    expect(JSON.stringify(badConnect.body)).not.toMatch(/stack|at Object/i);

    fs.writeFileSync(
      path.join(harness.anchorRoot, '.roland', 'config.json'),
      JSON.stringify({ githubPatEncrypted: 'not-valid-ciphertext' }),
      'utf-8',
    );

    const corruptedStatus = await jsonFetch<{ connected: boolean; needsReconnect: boolean }>(
      `${harness.baseUrl}/api/github/status`,
    );
    expect(corruptedStatus.body.connected).toBe(false);
    expect(corruptedStatus.body.needsReconnect).toBe(true);

    const corruptedList = await jsonFetch<{ error: string; needsReconnect: boolean }>(
      `${harness.baseUrl}/api/github/repos`,
    );
    expect(corruptedList.status).toBe(400);
    expect(corruptedList.body.needsReconnect).toBe(true);
    expect(corruptedList.body.error).toMatch(/corrupted|reconnect/i);
  });

  it('handles CORS preflight and disconnect clears stored credentials', async () => {
    await jsonFetch(`${harness.baseUrl}/api/github/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pat: VALID_PAT }),
    });

    const preflight = await fetch(`${harness.baseUrl}/api/github/repos`, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/GET/);

    const disconnect = await jsonFetch<{ ok: boolean }>(
      `${harness.baseUrl}/api/github/disconnect`,
      { method: 'DELETE' },
    );
    expect(disconnect.status).toBe(200);
    expect(disconnect.body.ok).toBe(true);

    const status = await jsonFetch<{ connected: boolean }>(`${harness.baseUrl}/api/github/status`);
    expect(status.body.connected).toBe(false);
  });

  it('returns structured client errors for invalid clone input without leaking stack traces', async () => {
    await jsonFetch(`${harness.baseUrl}/api/github/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pat: VALID_PAT }),
    });

    const missing = await jsonFetch<{ error: string }>(`${harness.baseUrl}/api/github/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'testuser' }),
    });
    expect(missing.status).toBe(500);
    expect(missing.body.error).toMatch(/Something went wrong with GitHub/i);
    expect(JSON.stringify(missing.body)).not.toMatch(/stack|SyntaxError|owner and repo are required/i);
  });
});
