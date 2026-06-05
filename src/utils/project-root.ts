/**
 * Roland install + project root resolution for global CLI (`npm link` / `npm install -g`).
 *
 * Install root — where the `roland` package lives (agents, dist, node_modules):
 *   1. ROLAND_INSTALL_ROOT env
 *   2. Walk up from caller URL for package.json with `"name": "roland"`
 *
 * Project root — the repo Roland operates on (.roland/, git, etc.):
 *   1. ROLAND_PROJECT_ROOT or ROLAND_ROOT env
 *   2. Parent of ROLAND_STATE_DIR when it points at `.roland`
 *   3. Walk up from cwd for `.roland/` or `.git/`
 *   4. process.cwd()
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function readPackageName(dir: string): string | undefined {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
    return pkg.name;
  } catch {
    return undefined;
  }
}

/** Resolve the Roland package install directory (global prefix or linked repo). */
export function resolveRolandInstallRoot(fromUrl?: string): string {
  const envInstall = process.env.ROLAND_INSTALL_ROOT?.trim();
  if (envInstall) return path.resolve(envInstall);

  const startDir = fromUrl
    ? path.dirname(fileURLToPath(fromUrl))
    : path.dirname(fileURLToPath(import.meta.url));

  let dir = startDir;
  while (true) {
    if (readPackageName(dir) === 'roland') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // bin/roland.js → package root; dist/index.js → package root
  const base = path.basename(startDir);
  if (base === 'bin' || base === 'dist') return path.resolve(startDir, '..');
  return startDir;
}

/** Resolve the user's project directory Roland should read/write state for. */
export function resolveProjectRoot(startDir: string = process.cwd()): string {
  for (const key of ['ROLAND_PROJECT_ROOT', 'ROLAND_ROOT'] as const) {
    const val = process.env[key]?.trim();
    if (!val) continue;
    const resolved = path.resolve(val);
    if (fs.existsSync(resolved)) return resolved;
    process.stderr.write(
      `[roland] Warning: ${key}="${val}" does not exist — continuing search\n`,
    );
  }

  const stateDirRaw = process.env.ROLAND_STATE_DIR?.trim();
  if (stateDirRaw) {
    const resolved = path.isAbsolute(stateDirRaw)
      ? stateDirRaw
      : path.resolve(startDir, stateDirRaw);
    const base = path.basename(resolved);
    if (base === '.roland') return path.dirname(resolved);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return path.dirname(resolved);
    }
  }

  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.roland'))) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return path.resolve(startDir);
}

/**
 * Set ROLAND_INSTALL_ROOT / ROLAND_PROJECT_ROOT before loading dist/.
 * Safe to call multiple times; explicit env vars are not overwritten.
 */
export function bootstrapRolandEnv(opts?: {
  binUrl?: string;
  cwd?: string;
}): { installRoot: string; projectRoot: string } {
  const installRoot = resolveRolandInstallRoot(opts?.binUrl);
  if (!process.env.ROLAND_INSTALL_ROOT?.trim()) {
    process.env.ROLAND_INSTALL_ROOT = installRoot;
  }

  const cwd = opts?.cwd ?? process.cwd();
  const hasProjectOverride =
    Boolean(process.env.ROLAND_PROJECT_ROOT?.trim()) ||
    Boolean(process.env.ROLAND_ROOT?.trim());

  const projectRoot = resolveProjectRoot(cwd);

  if (!hasProjectOverride) {
    process.env.ROLAND_PROJECT_ROOT = projectRoot;
  }
  if (!process.env.ROLAND_ROOT?.trim()) {
    process.env.ROLAND_ROOT = process.env.ROLAND_PROJECT_ROOT ?? projectRoot;
  }

  return {
    installRoot,
    projectRoot: process.env.ROLAND_PROJECT_ROOT ?? projectRoot,
  };
}
