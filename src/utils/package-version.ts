/**
 * ## P3 Release & Stabilization
 *
 * Single source of truth for Roland package version (read from package.json).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let cached: string | null = null;

/** Read semver from nearest package.json (walks up from caller module). */
export function readPackageVersion(fromUrl?: string): string {
  if (cached) return cached;
  try {
    let dir = fromUrl
      ? path.dirname(fileURLToPath(fromUrl))
      : path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
        cached = pkg.version;
        return cached;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // fall through
  }
  return '1.6.0';
}
