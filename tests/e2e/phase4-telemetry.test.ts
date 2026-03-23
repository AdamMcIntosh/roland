/**
 * Phase 4 E2E: Telemetry opt-in flows.
 * Tests consent storage, hasConsent, and initTelemetry (no-op without real DSN).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { hasConsent, setConsent, initTelemetry, captureException } from '../../src/telemetry.js';

const testDir = path.join(os.tmpdir(), `rco-telemetry-test-${Date.now()}`);

describe('E2E Phase 4: Telemetry', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('hasConsent returns false for project scope when no consent file in cwd', () => {
    const origCwd = process.cwd();
    process.chdir(testDir);
    try {
      const consentDir = path.join(testDir, '.rco');
      if (fs.existsSync(consentDir)) fs.rmSync(consentDir, { recursive: true });
      expect(hasConsent('project')).toBe(false);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('setConsent writes file and hasConsent returns true when scope is project', () => {
    const origCwd = process.cwd();
    process.chdir(testDir);
    try {
      setConsent('project');
      const consentDir = path.join(testDir, '.rco');
      expect(fs.existsSync(consentDir)).toBe(true);
      const consentFile = path.join(consentDir, 'telemetry-consent.json');
      expect(fs.existsSync(consentFile)).toBe(true);
      const data = JSON.parse(fs.readFileSync(consentFile, 'utf-8'));
      expect(data.consent).toBe(true);
      expect(hasConsent('project')).toBe(true);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('initTelemetry does not throw (placeholder DSN)', () => {
    expect(() => initTelemetry()).not.toThrow();
  });

  it('captureException does not throw when not initialized', () => {
    expect(() => captureException(new Error('test'))).not.toThrow();
  });
});
