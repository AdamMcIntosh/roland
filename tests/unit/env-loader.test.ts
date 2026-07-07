/**
 * env-loader — .env parsing and loading.
 *
 * Scoped: npm run test:run -- tests/unit/env-loader.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseEnvFile,
  applyEnvRecord,
  loadEnvFiles,
  writeEnvTemplateIfMissing,
} from '../../src/utils/env-loader.js';

describe('env-loader', () => {
  const ORIGINAL_ENV = { ...process.env };
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-env-'));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses basic KEY=VALUE pairs and ignores comments', () => {
    const parsed = parseEnvFile(`
# comment
CURSOR_API_KEY=abc123
GITHUB_TOKEN="quoted-value"
EMPTY=
    `);
    expect(parsed.CURSOR_API_KEY).toBe('abc123');
    expect(parsed.GITHUB_TOKEN).toBe('quoted-value');
    expect(parsed.EMPTY).toBe('');
  });

  it('does not overwrite existing process.env keys', () => {
    process.env.TEST_ROLAND_KEY = 'existing';
    applyEnvRecord({ TEST_ROLAND_KEY: 'new', OTHER_KEY: 'yes' });
    expect(process.env.TEST_ROLAND_KEY).toBe('existing');
    expect(process.env.OTHER_KEY).toBe('yes');
    delete process.env.OTHER_KEY;
  });

  it('loads project .env without overwriting shell vars', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'FROM_FILE=loaded\nCURSOR_API_KEY=file-key\n', 'utf-8');
    process.env.CURSOR_API_KEY = 'shell-key';

    const result = loadEnvFiles({ projectRoot: tmpDir, homeDir: path.join(tmpDir, 'empty-home') });
    expect(result.loadedPaths).toContain(envPath);
    expect(process.env.FROM_FILE).toBe('loaded');
    expect(process.env.CURSOR_API_KEY).toBe('shell-key');
    delete process.env.FROM_FILE;
  });

  it('writeEnvTemplateIfMissing creates file once', () => {
    const target = path.join(tmpDir, 'nested', '.env');
    expect(writeEnvTemplateIfMissing(target)).toBe(true);
    expect(fs.existsSync(target)).toBe(true);
    expect(writeEnvTemplateIfMissing(target)).toBe(false);
  });
});
