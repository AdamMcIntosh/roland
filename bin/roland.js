#!/usr/bin/env node
/**
 * Global Roland CLI launcher (npm link / npm install -g).
 * Resolves install + project roots, then delegates to dist/index.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const binUrl = import.meta.url;
const installRoot = path.resolve(path.dirname(fileURLToPath(binUrl)), '..');
const entryPath = path.join(installRoot, 'dist', 'index.js');
const bootstrapPath = path.join(installRoot, 'dist', 'utils', 'project-root.js');

if (!fs.existsSync(entryPath)) {
  console.error(
    'Roland is not built. From the Roland install directory run:\n\n  npm run build\n',
  );
  process.exit(1);
}

if (fs.existsSync(bootstrapPath)) {
  const { bootstrapRolandEnv } = await import(pathToFileURL(bootstrapPath).href);
  bootstrapRolandEnv({ binUrl, cwd: process.cwd() });
} else if (!process.env.ROLAND_INSTALL_ROOT) {
  process.env.ROLAND_INSTALL_ROOT = installRoot;
  if (!process.env.ROLAND_PROJECT_ROOT) {
    process.env.ROLAND_PROJECT_ROOT = process.cwd();
  }
}

await import(pathToFileURL(entryPath).href);
