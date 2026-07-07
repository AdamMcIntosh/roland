import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { readPackageVersion } from '../../src/utils/package-version.js';

describe('package-version', () => {
  it('reads semver from package.json', () => {
    const v = readPackageVersion(import.meta.url);
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);

    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'package.json'), 'utf-8'),
    ) as { version: string };
    expect(v).toBe(pkg.version);
  });
});
