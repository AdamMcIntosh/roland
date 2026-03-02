/**
 * Phase 4 E2E: Release builds (build-npm, build-plugin-zip).
 * Validates that build scripts exist and dist/ contains expected outputs.
 * Uses a non-destructive approach: runs `tsc` + copy-assets without rimraf
 * to avoid clobbering dist/ for concurrent fork tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

describe('E2E Phase 4: Release builds', () => {
  beforeAll(() => {
    try {
      execSync('tsc && node scripts/copy-assets.js', { cwd: root, stdio: 'pipe' });
    } catch (e) {
      console.error('build failed:', (e as { stderr?: Buffer }).stderr?.toString());
      throw e;
    }
  });

  it('build produces dist/ with index.js', () => {
    const distIndex = path.join(root, 'dist', 'index.js');
    expect(fs.existsSync(distIndex)).toBe(true);
  });

  it('build produces dist/rco/cli.js', () => {
    const cli = path.join(root, 'dist', 'rco', 'cli.js');
    expect(fs.existsSync(cli)).toBe(true);
  });

  it('build-plugin produces dist-plugin/plugin.js', () => {
    try {
      execSync('node scripts/build-plugin.js', { cwd: root, stdio: 'pipe' });
    } catch (e) {
      console.error('build-plugin failed:', (e as { stderr?: Buffer }).stderr?.toString());
      throw e;
    }
    const pluginJs = path.join(root, 'dist-plugin', 'plugin.js');
    expect(fs.existsSync(pluginJs)).toBe(true);
  });

  it('build scripts are defined in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    expect(pkg.scripts).toHaveProperty('build-npm');
    expect(pkg.scripts).toHaveProperty('build-plugin');
    expect(pkg.scripts).toHaveProperty('build-plugin-zip');
    expect(pkg.scripts).toHaveProperty('build-tauri');
  });
});
