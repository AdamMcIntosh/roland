import { describe, it, expect } from 'vitest';
import { readPackageVersion } from '../../src/utils/package-version.js';

describe('package-version', () => {
  it('reads semver from package.json', () => {
    const v = readPackageVersion(import.meta.url);
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v).toBe('1.4.0');
  });
});
