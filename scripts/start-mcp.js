#!/usr/bin/env node
/**
 * Local dev entry for the Roland MCP stdio server.
 *
 * Usage (from repo root):
 *   node scripts/start-mcp.js
 *   npm run start:mcp
 *
 * Equivalent to `npm run mcp` / `roland-mcp`, but works before a global install.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const scriptUrl = import.meta.url;
const repoRoot = path.resolve(path.dirname(fileURLToPath(scriptUrl)), '..');
const entryPath = path.join(repoRoot, 'dist', 'server', 'mcp-server.js');
const bootstrapPath = path.join(repoRoot, 'dist', 'utils', 'project-root.js');

if (!fs.existsSync(entryPath)) {
  console.error(
    'Roland MCP server is not built. From the repo root run:\n\n  npm run build\n',
  );
  process.exit(1);
}

if (fs.existsSync(bootstrapPath)) {
  const { bootstrapRolandEnv } = await import(pathToFileURL(bootstrapPath).href);
  bootstrapRolandEnv({ binUrl: scriptUrl, cwd: process.cwd() });
} else if (!process.env.ROLAND_INSTALL_ROOT) {
  process.env.ROLAND_INSTALL_ROOT = repoRoot;
  if (!process.env.ROLAND_PROJECT_ROOT) {
    process.env.ROLAND_PROJECT_ROOT = process.cwd();
  }
}

await import(pathToFileURL(entryPath).href);
