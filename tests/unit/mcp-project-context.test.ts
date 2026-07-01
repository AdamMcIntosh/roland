import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMcpProjectEnv,
  deriveProjectRootFromStateDir,
  resolveMcpProjectContext,
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

  it('applyMcpProjectEnv pins env without requiring chdir', () => {
    const project = path.join(tmpDir, 'env-test');
    const stateDir = path.join(project, '.roland');
    fs.mkdirSync(stateDir, { recursive: true });

    applyMcpProjectEnv({ projectRoot: project, stateDir });

    expect(process.env.ROLAND_PROJECT_ROOT).toBe(project);
    expect(process.env.ROLAND_STATE_DIR).toBe(stateDir);
  });
});
