/**
 * Phase 4 E2E: Release builds (build-npm, build-plugin-zip).
 * Ensures dist/ and plugin zip are produced.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

describe('E2E Phase 4: Release builds', () => {
  beforeAll(() => {
    try {
      execSync('npm run build-npm', { cwd: root, stdio: 'pipe' });
    } catch (e) {
      console.error('build-npm failed:', (e as { stderr?: Buffer }).stderr?.toString());
      throw e;
    }
  });

  it('build-npm produces dist/ with index.js', () => {
    const distIndex = path.join(root, 'dist', 'index.js');
    expect(fs.existsSync(distIndex)).toBe(true);
  });

  it('build-npm produces dist/rco/cli.js', () => {
    const cli = path.join(root, 'dist', 'rco', 'cli.js');
    expect(fs.existsSync(cli)).toBe(true);
  });

  it('build-plugin-zip produces a zip in dist-plugin', () => {
    try {
      execSync('npm run build-plugin-zip', { cwd: root, stdio: 'pipe' });
    } catch (e) {
      console.error('build-plugin-zip failed:', (e as { stderr?: Buffer }).stderr?.toString());
      throw e;
    }
    const distPlugin = path.join(root, 'dist-plugin');
    const files = fs.readdirSync(distPlugin);
    const zip = files.find((f) => f.endsWith('.zip'));
    expect(zip).toBeDefined();
    expect(zip).toMatch(/roland-plugin-\d+\.\d+\.\d+\.zip/);
  });
});
