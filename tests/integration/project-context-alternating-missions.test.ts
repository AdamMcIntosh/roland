/**
 * P0: Alternating missions between two projects — zero cross-contamination.
 *
 * Run: npx vitest run tests/integration/project-context-alternating-missions.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/config-loader.js';
import { McpServer } from '../../src/server/mcp-server.js';
import {
  MISSION_META_FILE,
  prepareMissionStart,
  writeMissionMetaFile,
} from '../../src/rco/mission-state.js';
import {
  resolveMcpProjectContext,
  scopedProjectEnv,
  withProjectContext,
} from '../../src/utils/mcp-project-context.js';

describe('alternating project missions — zero cross-contamination', () => {
  let tmpRoot: string;
  let projectA: string;
  let projectB: string;
  const envBackup: Record<string, string | undefined> = {};
  const cwdBackup = process.cwd();

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-alt-missions-'));
    projectA = path.join(tmpRoot, 'alpha-app');
    projectB = path.join(tmpRoot, 'beta-service');

    for (const p of [projectA, projectB]) {
      fs.mkdirSync(path.join(p, '.roland'), { recursive: true });
      fs.mkdirSync(path.join(p, '.git'), { recursive: true });
    }

    for (const key of ['ROLAND_PROJECT_ROOT', 'ROLAND_ROOT', 'ROLAND_STATE_DIR']) {
      envBackup[key] = process.env[key];
    }
  });

  afterEach(() => {
    process.chdir(cwdBackup);
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function metaPath(project: string): string {
    return path.join(project, '.roland', MISSION_META_FILE);
  }

  it('alternates missions A → B → A with explicit project_root and no bleed', async () => {
    // Seed stale env pointing at project A (simulates prior MCP session).
    process.env.ROLAND_PROJECT_ROOT = projectA;
    process.env.ROLAND_STATE_DIR = path.join(projectA, '.roland');

    const ctxA1 = resolveMcpProjectContext({ project_root: projectA });
    await withProjectContext(ctxA1, () => {
      prepareMissionStart(ctxA1.stateDir, 'Alpha mission one', { projectRoot: ctxA1.projectRoot });
      writeMissionMetaFile(ctxA1.stateDir, {
        id: 'alpha-1',
        goal: 'Alpha mission one',
        effectiveGoal: 'Alpha mission one',
        status: 'active',
        startedAt: Date.now(),
        projectRoot: projectA,
        stateDir: ctxA1.stateDir,
        triggeredVia: 'mcp',
        loopTemplate: 'small-fix-loop',
      });
    });

    expect(fs.existsSync(metaPath(projectA))).toBe(true);
    expect(fs.existsSync(metaPath(projectB))).toBe(false);

    // Mission on B — stale env still points at A; explicit project_root must win.
    const ctxB = resolveMcpProjectContext({ project_root: projectB });
    expect(ctxB.projectRoot).toBe(projectB);
    expect(ctxB.stateDir).toBe(path.join(projectB, '.roland'));

    await withProjectContext(ctxB, () => {
      prepareMissionStart(ctxB.stateDir, 'Beta mission', { projectRoot: ctxB.projectRoot });
      writeMissionMetaFile(ctxB.stateDir, {
        id: 'beta-1',
        goal: 'Beta mission',
        effectiveGoal: 'Beta mission',
        status: 'active',
        startedAt: Date.now(),
        projectRoot: projectB,
        stateDir: ctxB.stateDir,
        triggeredVia: 'cli',
        loopTemplate: 'full-cycle-verified-loop',
      });
    });

    const alphaMeta = JSON.parse(fs.readFileSync(metaPath(projectA), 'utf-8'));
    const betaMeta = JSON.parse(fs.readFileSync(metaPath(projectB), 'utf-8'));
    expect(alphaMeta.goal).toBe('Alpha mission one');
    expect(betaMeta.goal).toBe('Beta mission');
    expect(alphaMeta.projectRoot).toBe(projectA);
    expect(betaMeta.projectRoot).toBe(projectB);

    // Back to A — explicit project_root again; B meta must remain untouched.
    const ctxA2 = resolveMcpProjectContext({ cwd: projectA });
    await withProjectContext(ctxA2, () => {
      prepareMissionStart(ctxA2.stateDir, 'Alpha mission two', { projectRoot: ctxA2.projectRoot });
      writeMissionMetaFile(ctxA2.stateDir, {
        id: 'alpha-2',
        goal: 'Alpha mission two',
        effectiveGoal: 'Alpha mission two',
        status: 'active',
        startedAt: Date.now(),
        projectRoot: projectA,
        stateDir: ctxA2.stateDir,
        triggeredVia: 'mcp',
        loopTemplate: 'small-fix-loop',
      });
    });

    expect(JSON.parse(fs.readFileSync(metaPath(projectA), 'utf-8')).goal).toBe('Alpha mission two');
    expect(JSON.parse(fs.readFileSync(metaPath(projectB), 'utf-8')).goal).toBe('Beta mission');
  });

  it('scopedProjectEnv does not mutate process.env', () => {
    delete process.env.ROLAND_PROJECT_ROOT;
    const ctx = resolveMcpProjectContext({ project_root: projectB });
    const scoped = scopedProjectEnv(ctx);
    expect(scoped.ROLAND_PROJECT_ROOT).toBe(projectB);
    expect(process.env.ROLAND_PROJECT_ROOT).toBeUndefined();
  });

  it('explicit cwd ignores stale ROLAND_STATE_DIR when resolving state dir', () => {
    process.env.ROLAND_STATE_DIR = path.join(projectA, '.roland');
    const ctx = resolveMcpProjectContext({ cwd: projectB });
    expect(ctx.projectRoot).toBe(projectB);
    expect(ctx.stateDir).toBe(path.join(projectB, '.roland'));
  });

  it('McpServer callTool scopes env via withProjectContext (production path)', async () => {
    process.env.ROLAND_PROJECT_ROOT = projectA;
    process.env.ROLAND_STATE_DIR = path.join(projectA, '.roland');

    const config = await loadConfig();
    const server = new McpServer(config, { skipSidecars: true });

    const result = (await server.callTool('board_status', {
      project_root: projectB,
      format: 'json',
    })) as { project_root: string; state_dir: string };

    expect(result.project_root).toBe(projectB);
    expect(result.state_dir).toBe(path.join(projectB, '.roland'));
    expect(process.env.ROLAND_PROJECT_ROOT).toBe(projectA);
  });
});
