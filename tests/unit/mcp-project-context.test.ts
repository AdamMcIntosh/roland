import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMcpProjectEnv,
  chdirToProject,
  deriveProjectRootFromStateDir,
  ensureMissionProjectContext,
  resolveMcpProjectContext,
  resolveMissionProjectRoot,
  scopedProjectEnv,
} from '../../src/utils/mcp-project-context.js';

describe('mcp-project-context', () => {
  let tmpDir: string;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-mcp-ctx-'));
    for (const key of ['ROLAND_PROJECT_ROOT', 'ROLAND_ROOT', 'ROLAND_STATE_DIR']) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('resolveMcpProjectContext honors explicit project_root', () => {
    const project = path.join(tmpDir, 'loblollydigital');
    const stateDir = path.join(project, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });

    const ctx = resolveMcpProjectContext({
      project_root: project,
    });

    expect(ctx.projectRoot).toBe(project);
    expect(ctx.stateDir).toBe(stateDir);
  });

  it('resolveMcpProjectContext accepts cwd alias for Hermes', () => {
    const project = path.join(tmpDir, 'hermes-target');
    fs.mkdirSync(path.join(project, '.roland'), { recursive: true });

    const ctx = resolveMcpProjectContext({ cwd: project });
    expect(ctx.projectRoot).toBe(project);
    expect(ctx.stateDir).toBe(path.join(project, '.roland'));
  });

  it('deriveProjectRootFromStateDir extracts parent of .roland', () => {
    const project = path.join(tmpDir, 'app');
    const stateDir = path.join(project, '.roland');
    expect(deriveProjectRootFromStateDir(stateDir)).toBe(project);
  });

  it('scopedProjectEnv builds overrides without mutating process.env', () => {
    const project = path.join(tmpDir, 'scoped-env');
    const stateDir = path.join(project, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });
    delete process.env.ROLAND_PROJECT_ROOT;

    const scoped = scopedProjectEnv({ projectRoot: project, stateDir });
    expect(scoped.ROLAND_PROJECT_ROOT).toBe(project);
    expect(process.env.ROLAND_PROJECT_ROOT).toBeUndefined();
  });

  it('applyMcpProjectEnv pins env without requiring chdir', () => {
    const project = path.join(tmpDir, 'env-test');
    const stateDir = path.join(project, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });

    applyMcpProjectEnv({ projectRoot: project, stateDir });

    expect(process.env.ROLAND_PROJECT_ROOT).toBe(project);
    expect(process.env.ROLAND_STATE_DIR).toBe(stateDir);
  });

  it('explicit project_root ignores stale ROLAND_STATE_DIR env', () => {
    const stale = path.join(tmpDir, 'test-hybrid-2');
    const target = path.join(tmpDir, 'linux-utils');
    fs.mkdirSync(path.join(stale, '.roland'), { recursive: true });
    fs.mkdirSync(path.join(target, '.roland'), { recursive: true });

    process.env.ROLAND_PROJECT_ROOT = stale;
    process.env.ROLAND_STATE_DIR = path.join(stale, '.roland');

    const ctx = resolveMcpProjectContext({ project_root: target });
    expect(ctx.projectRoot).toBe(target);
    expect(ctx.stateDir).toBe(path.join(target, '.roland'));
  });

  it('explicit state_dir ignores stale ROLAND_PROJECT_ROOT env', () => {
    const stale = path.join(tmpDir, 'test-hybrid-2');
    const target = path.join(tmpDir, 'linux-utils');
    fs.mkdirSync(path.join(stale, '.roland'), { recursive: true });
    fs.mkdirSync(path.join(target, '.roland'), { recursive: true });

    process.env.ROLAND_PROJECT_ROOT = stale;
    process.env.ROLAND_ROOT = stale;

    const ctx = resolveMcpProjectContext({ state_dir: path.join(target, '.roland') });
    expect(ctx.projectRoot).toBe(target);
    expect(ctx.stateDir).toBe(path.join(target, '.roland'));
  });

  it('ensureMissionProjectContext chdirs workers into project root', () => {
    const project = path.join(tmpDir, 'chdir-target');
    const stateDir = path.join(project, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });
    const priorCwd = process.cwd();

    ensureMissionProjectContext({ projectRoot: project, stateDir });

    expect(process.cwd()).toBe(project);
    expect(resolveMissionProjectRoot()).toBe(project);

    process.chdir(priorCwd);
  });

  it('chdirToProject is a no-op when project root does not exist', () => {
    const priorCwd = process.cwd();
    chdirToProject({ projectRoot: path.join(tmpDir, 'missing-project'), stateDir: tmpDir });
    expect(process.cwd()).toBe(priorCwd);
  });
});
