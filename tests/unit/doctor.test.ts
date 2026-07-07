/**
 * roland doctor — CURSOR_API_KEY diagnosis.
 *
 * Regression: doctor reported 16/16 checks passed while `roland mission`
 * refused to start because CURSOR_API_KEY was unset. Doctor must diagnose
 * every mission preflight requirement.
 *
 * Scoped: npm run test:run -- tests/unit/doctor.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectDoctorChecks } from '../../src/cli/dispatch.js';

const ORIGINAL_KEY = process.env.CURSOR_API_KEY;

describe('roland doctor', () => {
  beforeEach(() => {
    delete process.env.CURSOR_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.CURSOR_API_KEY;
    } else {
      process.env.CURSOR_API_KEY = ORIGINAL_KEY;
    }
  });

  it('fails the CURSOR_API_KEY check when the key is unset', () => {
    const checks = collectDoctorChecks();
    const keyCheck = checks.find((c) => c.label.includes('CURSOR_API_KEY'));
    expect(keyCheck).toBeDefined();
    expect(keyCheck!.ok).toBe(false);
    expect(keyCheck!.hint).toContain('cursor.com/settings');
  });

  it('passes the CURSOR_API_KEY check when set, masking the key', () => {
    process.env.CURSOR_API_KEY = 'key_1234567890abcdef';
    const checks = collectDoctorChecks();
    const keyCheck = checks.find((c) => c.label.includes('CURSOR_API_KEY'));
    expect(keyCheck).toBeDefined();
    expect(keyCheck!.ok).toBe(true);
    expect(keyCheck!.label).not.toContain('key_1234567890abcdef');
    expect(keyCheck!.label).toContain('key_');
    expect(keyCheck!.label).toContain('cdef');
  });

  it('treats a whitespace-only key as unset', () => {
    process.env.CURSOR_API_KEY = '   ';
    const checks = collectDoctorChecks();
    const keyCheck = checks.find((c) => c.label.includes('CURSOR_API_KEY'));
    expect(keyCheck!.ok).toBe(false);
  });
});
