/**
 * Lightweight .env loader for Roland onboarding.
 *
 * Loads KEY=VALUE pairs without overwriting existing process.env entries.
 * Search order (first file wins per key, later files only fill gaps):
 *   1. ~/.roland/.env
 *   2. {projectRoot}/.env
 *   3. {projectRoot}/.roland/.env
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const QUOTED = /^(['"])(.*)\1$/;

/** Parse a .env file into key/value pairs (no expansion, no comments on values). */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key.startsWith('#')) continue;
    let value = line.slice(eq + 1).trim();
    const quoted = value.match(QUOTED);
    if (quoted) value = quoted[2];
    else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/** Apply parsed entries to process.env (skip keys already set). */
export function applyEnvRecord(record: Record<string, string>): number {
  let applied = 0;
  for (const [key, value] of Object.entries(record)) {
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
    applied++;
  }
  return applied;
}

export interface LoadEnvFilesResult {
  loadedPaths: string[];
  keysApplied: number;
}

/**
 * Load Roland env files. Safe to call multiple times.
 * Returns paths that were read and count of keys applied.
 */
export function loadEnvFiles(opts?: {
  projectRoot?: string;
  homeDir?: string;
}): LoadEnvFilesResult {
  const projectRoot = path.resolve(opts?.projectRoot ?? process.cwd());
  const homeDir = opts?.homeDir ?? os.homedir();
  const candidates = [
    path.join(homeDir, '.roland', '.env'),
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.roland', '.env'),
  ];

  const loadedPaths: string[] = [];
  let keysApplied = 0;

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const record = parseEnvFile(content);
      keysApplied += applyEnvRecord(record);
      loadedPaths.push(filePath);
    } catch {
      // Non-fatal — caller may surface via doctor.
    }
  }

  return { loadedPaths, keysApplied };
}

/** Standard .env template for new users. */
export const ENV_TEMPLATE = `# Roland environment — loaded automatically by the CLI and MCP server.
# Get your Cursor API key: https://cursor.com/settings → API Keys

CURSOR_API_KEY=

# Optional — GitHub PR automation
# GITHUB_TOKEN=

# Optional — telemetry (set RCO_TELEMETRY_CONSENT=1 or run roland init)
# RCO_TELEMETRY_CONSENT=0
`;

/** Write a .env template if the file does not exist. Returns true when created. */
export function writeEnvTemplateIfMissing(filePath: string): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, ENV_TEMPLATE, 'utf-8');
  return true;
}
