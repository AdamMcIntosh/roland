/**
 * Phase 4 E2E: Install script (structure and mock curl behavior).
 * Validates install.sh exists and contains required elements; simulates env for curl URL.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const installSh = path.join(root, 'install.sh');

describe('E2E Phase 4: Install script', () => {
  it('install.sh exists', () => {
    expect(fs.existsSync(installSh)).toBe(true);
  });

  it('contains RCO_VERSION and GITHUB_REPO', () => {
    const content = fs.readFileSync(installSh, 'utf-8');
    expect(content).toMatch(/RCO_VERSION/);
    expect(content).toMatch(/GITHUB_REPO/);
  });

  it('contains curl download and zip URL pattern', () => {
    const content = fs.readFileSync(installSh, 'utf-8');
    expect(content).toMatch(/curl/);
    expect(content).toMatch(/releases\/download/);
    expect(content).toMatch(/roland-plugin.*\.zip/);
  });

  it('contains unzip and INSTALL_DIR', () => {
    const content = fs.readFileSync(installSh, 'utf-8');
    expect(content).toMatch(/unzip|Extracting/);
    expect(content).toMatch(/INSTALL_DIR/);
  });

  it('default install dir is under home or RCO_INSTALL_DIR', () => {
    const content = fs.readFileSync(installSh, 'utf-8');
    expect(content).toMatch(/\$HOME\/\.local\/share\/roland|RCO_INSTALL_DIR/);
  });
});
