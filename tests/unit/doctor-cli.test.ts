/**
 * doctor-cli — extended doctor checks and fix mode.
 *
 * Scoped: npm run test:run -- tests/unit/doctor-cli.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  collectDoctorChecks,
  runDoctorFix,
} from '../../src/cli/doctor-cli.js';

const ORIGINAL_KEY = process.env.CURSOR_API_KEY;
const MODULE_URL = new URL('../../src/cli/doctor-cli.ts', import.meta.url).href;

describe('doctor-cli', () => {
  beforeEach(() => {
    delete process.env.CURSOR_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.CURSOR_API_KEY;
    else process.env.CURSOR_API_KEY = ORIGINAL_KEY;
  });

  it('fails CURSOR_API_KEY check when unset with platform-aware hint', () => {
    const checks = collectDoctorChecks(MODULE_URL);
    const keyCheck = checks.find((c) => c.label.includes('CURSOR_API_KEY'));
    expect(keyCheck?.ok).toBe(false);
    expect(keyCheck?.hint).toContain('roland init');
  });

  it('includes worktree check label', () => {
    const checks = collectDoctorChecks(MODULE_URL);
    const wt = checks.find((c) => c.label.toLowerCase().includes('worktree'));
    expect(wt).toBeDefined();
  });

  it('runDoctorFix creates .roland and env template without touching git', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-doc-'));
    const origHome = process.env.HOME;
    const origUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-doc-proj-'));
    const origCwd = process.cwd();
    process.chdir(cwd);

    try {
      const { actions } = runDoctorFix(MODULE_URL);
      expect(actions.some((a) => a.includes('.roland'))).toBe(true);
      expect(fs.existsSync(path.join(cwd, '.roland'))).toBe(true);
    } finally {
      process.chdir(origCwd);
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
      if (origUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = origUserProfile;
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
