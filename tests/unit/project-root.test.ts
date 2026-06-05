import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapRolandEnv,
  resolveProjectRoot,
  resolveRolandInstallRoot,
} from '../../src/utils/project-root.js';

describe('project-root', () => {
  let tmpDir: string;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-root-'));
    for (const key of [
      'ROLAND_PROJECT_ROOT',
      'ROLAND_ROOT',
      'ROLAND_STATE_DIR',
      'ROLAND_INSTALL_ROOT',
    ]) {
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

  it('resolveRolandInstallRoot finds package.json name roland', () => {
    const fakePkg = path.join(tmpDir, 'package.json');
    fs.writeFileSync(fakePkg, JSON.stringify({ name: 'roland' }));
    const bin = path.join(tmpDir, 'bin', 'roland.js');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, '#!/usr/bin/env node\n');
    const root = resolveRolandInstallRoot(`file://${bin}`);
    expect(root).toBe(tmpDir);
  });

  it('resolveProjectRoot walks up to .roland', () => {
    const project = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(path.join(project, '.roland'), { recursive: true });
    const nested = path.join(project, 'src');
    fs.mkdirSync(nested, { recursive: true });
    expect(resolveProjectRoot(nested)).toBe(project);
  });

  it('resolveProjectRoot honors ROLAND_PROJECT_ROOT', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env.ROLAND_PROJECT_ROOT = tmpDir;
    expect(resolveProjectRoot('/tmp/nowhere')).toBe(tmpDir);
  });

  it('resolveProjectRoot derives from ROLAND_STATE_DIR', () => {
    const project = path.join(tmpDir, 'myapp');
    fs.mkdirSync(path.join(project, '.roland'), { recursive: true });
    process.env.ROLAND_STATE_DIR = path.join(project, '.roland');
    expect(resolveProjectRoot('/tmp')).toBe(project);
  });

  it('bootstrapRolandEnv sets ROLAND_PROJECT_ROOT when unset', () => {
    const project = path.join(tmpDir, 'repo');
    fs.mkdirSync(path.join(project, '.git'), { recursive: true });
    const { projectRoot } = bootstrapRolandEnv({ cwd: project });
    expect(projectRoot).toBe(project);
    expect(process.env.ROLAND_PROJECT_ROOT).toBe(project);
  });
});
