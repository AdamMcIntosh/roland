/**
 * ## MCP Project Context Fix
 *
 * Resolves project root + `.roland` state directory for MCP-triggered runs
 * (Hermes HTTP, Cursor stdio) and background team missions.
 *
 * Priority: explicit `project_root` / `cwd` arg → env → derive from `state_dir` → cwd walk.
 */

import fs from 'fs';
import path from 'path';
import { resolveProjectRoot } from './project-root.js';

export interface McpProjectContext {
  projectRoot: string;
  stateDir: string;
}

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Derive project root when only a `.roland` path is known. */
export function deriveProjectRootFromStateDir(stateDir: string): string {
  const resolved = path.resolve(stateDir);
  if (path.basename(resolved) === '.roland') return path.dirname(resolved);
  if (fs.existsSync(path.join(resolved, '.roland'))) return resolved;
  return path.dirname(resolved);
}

function normalizeStateDir(projectRoot: string, rawState: string): string {
  const resolved = path.isAbsolute(rawState)
    ? path.resolve(rawState)
    : path.resolve(projectRoot, rawState);
  if (path.basename(resolved) === '.roland') return resolved;
  const nested = path.join(resolved, '.roland');
  if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) return nested;
  return resolved;
}

/**
 * Resolve `{ projectRoot, stateDir }` from MCP tool args and/or process env.
 * Accepts `project_root` or `cwd` for the target repo Hermes is operating in.
 */
export function resolveMcpProjectContext(args?: {
  project_root?: unknown;
  cwd?: unknown;
  state_dir?: unknown;
}): McpProjectContext {
  const rawProject = pickString(
    args?.project_root,
    args?.cwd,
    process.env['ROLAND_PROJECT_ROOT'],
    process.env['ROLAND_ROOT'],
  );
  const rawState = pickString(args?.state_dir, process.env['ROLAND_STATE_DIR']);

  let projectRoot: string;
  if (rawProject) {
    projectRoot = path.resolve(rawProject);
  } else if (rawState) {
    projectRoot = deriveProjectRootFromStateDir(rawState);
  } else {
    projectRoot = resolveProjectRoot(process.cwd());
  }

  const stateDir = rawState
    ? normalizeStateDir(projectRoot, rawState)
    : path.join(projectRoot, '.roland');

  return { projectRoot, stateDir };
}

/**
 * Pin Roland env vars to a project context (does not chdir — safe for shared MCP servers).
 */
export function applyMcpProjectEnv(ctx: McpProjectContext): McpProjectContext {
  process.env['ROLAND_PROJECT_ROOT'] = ctx.projectRoot;
  process.env['ROLAND_ROOT'] = ctx.projectRoot;
  process.env['ROLAND_STATE_DIR'] = ctx.stateDir;
  return ctx;
}

/** Isolated worker processes may chdir after env is set. */
export function chdirToProject(ctx: McpProjectContext): void {
  try {
    if (fs.existsSync(ctx.projectRoot)) {
      process.chdir(ctx.projectRoot);
    }
  } catch {
    /* spawn cwd is the fallback */
  }
}
