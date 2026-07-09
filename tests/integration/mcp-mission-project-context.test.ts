/**
 * Integration: MCP roland_run_team must honor project_root even when stale env
 * points at a different project.
 *
 * Run: npx vitest run tests/integration/mcp-mission-project-context.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/config-loader.js';
import { McpServer } from '../../src/server/mcp-server.js';
import {
  MISSION_META_FILE,
  prepareMissionStart,
  readMissionMetaFile,
} from '../../src/rco/mission-state.js';
import { resolveMcpProjectContext } from '../../src/utils/mcp-project-context.js';

const spawnMock = vi.fn().mockResolvedValue({ pid: 4242, logFile: '/tmp/bg-test.log' });

vi.mock('../../src/rco/supervisor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/rco/supervisor.js')>();
  return {
    ...actual,
    spawnBackground: (...args: unknown[]) => spawnMock(...args),
  };
});

describe('MCP mission project context', () => {
  let tmpRoot: string;
  let staleProject: string;
  let targetProject: string;
  let server: McpServer;
  const envBackup: Record<string, string | undefined> = {};
  const cwdBackup = process.cwd();

  beforeEach(async () => {
    spawnMock.mockClear();
    // realpathSync: macOS tmpdir is a symlink (/var -> /private/var), and
    // process.cwd() after chdir returns the resolved path.
    tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'roland-mcp-mission-')));
    staleProject = path.join(tmpRoot, 'test-hybrid-2');
    targetProject = path.join(tmpRoot, 'linux-utils');

    for (const p of [staleProject, targetProject]) {
      fs.mkdirSync(path.join(p, '.roland'), { recursive: true });
      fs.mkdirSync(path.join(p, '.git'), { recursive: true });
    }

    for (const key of ['ROLAND_PROJECT_ROOT', 'ROLAND_ROOT', 'ROLAND_STATE_DIR']) {
      envBackup[key] = process.env[key];
    }

    process.env.ROLAND_PROJECT_ROOT = staleProject;
    process.env.ROLAND_ROOT = staleProject;
    process.env.ROLAND_STATE_DIR = path.join(staleProject, '.roland');

    const config = await loadConfig();
    server = new McpServer(config);
  });

  afterEach(() => {
    process.chdir(cwdBackup);
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('resolveMcpProjectContext prefers explicit project_root over stale env', () => {
    const ctx = resolveMcpProjectContext({ project_root: targetProject });
    expect(ctx.projectRoot).toBe(targetProject);
    expect(ctx.stateDir).toBe(path.join(targetProject, '.roland'));
  });

  it('resolveMcpProjectContext derives from explicit state_dir and ignores stale env', () => {
    const targetState = path.join(targetProject, '.roland');
    const ctx = resolveMcpProjectContext({ state_dir: targetState });
    expect(ctx.projectRoot).toBe(targetProject);
    expect(ctx.stateDir).toBe(targetState);
  });

  it('prepareMissionStart chdirs into the requested project root', () => {
    const stateDir = path.join(targetProject, '.roland');
    prepareMissionStart(stateDir, 'Bootstrap linux-utils', { projectRoot: targetProject });
    expect(process.cwd()).toBe(targetProject);
    expect(process.env.ROLAND_PROJECT_ROOT).toBe(targetProject);
    expect(process.env.ROLAND_STATE_DIR).toBe(stateDir);
  });

  it('roland_run_team writes mission-meta and spawns worker in target project', async () => {
    const handler = server.getTool('roland_run_team');
    expect(handler).toBeTruthy();

    const goal = 'Add hello-world.ts to linux-utils';
    const result = await handler!({
      goal,
      project_root: targetProject,
      loop_template: 'full-cycle-verified-loop',
    });

    expect(result.started).toBe(true);
    expect(result.project_root).toBe(targetProject);
    expect(result.state_dir).toBe(path.join(targetProject, '.roland'));

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, teamArgv, stateDir, spawnOpts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      string,
      { projectRoot?: string },
    ];
    expect(stateDir).toBe(path.join(targetProject, '.roland'));
    expect(spawnOpts.projectRoot).toBe(targetProject);
    expect(teamArgv).toContain('--state-dir');
    expect(teamArgv).toContain(path.join(targetProject, '.roland'));

    const meta = readMissionMetaFile(path.join(targetProject, '.roland'));
    expect(meta?.goal).toBe(goal);
    expect(meta?.projectRoot).toBe(targetProject);
    expect(meta?.triggeredVia).toBe('mcp');
    expect(fs.existsSync(path.join(targetProject, '.roland', MISSION_META_FILE))).toBe(true);
    expect(fs.existsSync(path.join(staleProject, '.roland', MISSION_META_FILE))).toBe(false);
  });
});
