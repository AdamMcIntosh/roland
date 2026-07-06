/**
 * ## P0 Trust & Safety Fixes
 *
 * Resolves project root + `.roland` state directory for MCP-triggered runs
 * (Hermes HTTP, Cursor stdio) and background team missions.
 *
 * Priority (explicit args always win over stale env):
 *   1. explicit `project_root` / `cwd` arg
 *   2. explicit `state_dir` arg → derive project root (ignores stale env)
 *   3. ROLAND_PROJECT_ROOT / ROLAND_ROOT env
 *   4. ROLAND_STATE_DIR env → derive project root
 *   5. cwd walk (CLI backward compat)
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

function hasExplicitArg(args: Record<string, unknown> | undefined, key: string): boolean {
  const v = args?.[key];
  return typeof v === 'string' && v.trim().length > 0;
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
  const explicitProject = pickString(args?.project_root, args?.cwd);
  const explicitStateArg = hasExplicitArg(args as Record<string, unknown> | undefined, 'state_dir');
  const explicitState = explicitStateArg ? pickString(args?.state_dir) : '';

  let projectRoot: string;
  if (explicitProject) {
    projectRoot = path.resolve(explicitProject);
  } else if (explicitStateArg && explicitState) {
    // Explicit state_dir on tool/CLI args — never trust stale ROLAND_PROJECT_ROOT.
    projectRoot = deriveProjectRootFromStateDir(explicitState);
  } else if (pickString(process.env['ROLAND_PROJECT_ROOT'], process.env['ROLAND_ROOT'])) {
    projectRoot = path.resolve(
      pickString(process.env['ROLAND_PROJECT_ROOT'], process.env['ROLAND_ROOT'])!,
    );
  } else if (pickString(process.env['ROLAND_STATE_DIR'])) {
    projectRoot = deriveProjectRootFromStateDir(process.env['ROLAND_STATE_DIR']!);
  } else {
    projectRoot = resolveProjectRoot(process.cwd());
  }

  let stateDir: string;
  if (explicitState) {
    stateDir = normalizeStateDir(projectRoot, explicitState);
  } else if (explicitProject) {
    // Hermes project_root/cwd — do not inherit stale ROLAND_STATE_DIR from another repo.
    stateDir = path.join(projectRoot, '.roland');
  } else if (pickString(process.env['ROLAND_STATE_DIR'])) {
    stateDir = normalizeStateDir(projectRoot, process.env['ROLAND_STATE_DIR']!);
  } else {
    stateDir = path.join(projectRoot, '.roland');
  }

  return { projectRoot, stateDir };
}

/** Active mission cwd — env pin first, then optional fallback. */
export function resolveMissionProjectRoot(fallbackCwd?: string): string {
  const fromEnv = pickString(process.env['ROLAND_PROJECT_ROOT'], process.env['ROLAND_ROOT']);
  if (fromEnv) return path.resolve(fromEnv);
  if (fallbackCwd?.trim()) return path.resolve(fallbackCwd);
  return process.cwd();
}

/** Resolve project root for status panels when only stateDir is known. */
export function resolveMissionProjectRootFromState(stateDir: string): string {
  const fromEnv = pickString(process.env['ROLAND_PROJECT_ROOT'], process.env['ROLAND_ROOT']);
  if (fromEnv) return path.resolve(fromEnv);
  return deriveProjectRootFromStateDir(stateDir);
}

const ROLAND_ENV_KEYS = ['ROLAND_PROJECT_ROOT', 'ROLAND_ROOT', 'ROLAND_STATE_DIR'] as const;

/** Build env overrides for a project context without mutating process.env. */
export function scopedProjectEnv(
  ctx: McpProjectContext,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    ROLAND_PROJECT_ROOT: ctx.projectRoot,
    ROLAND_ROOT: ctx.projectRoot,
    ROLAND_STATE_DIR: ctx.stateDir,
  };
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

/** Run fn under a project context; restores prior env after fn completes. */
export async function withProjectContext<T>(
  ctx: McpProjectContext,
  fn: (ctx: McpProjectContext) => T | Promise<T>,
): Promise<T> {
  const prior: Record<string, string | undefined> = {};
  for (const key of ROLAND_ENV_KEYS) {
    prior[key] = process.env[key];
  }
  applyMcpProjectEnv(ctx);
  try {
    return await fn(ctx);
  } finally {
    for (const key of ROLAND_ENV_KEYS) {
      const val = prior[key];
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  }
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

/**
 * Pin env + chdir for mission workers (CLI, supervisor, team orchestrator).
 * Returns the resolved project root after chdir.
 */
export function ensureMissionProjectContext(ctx: McpProjectContext): string {
  applyMcpProjectEnv(ctx);
  chdirToProject(ctx);
  return ctx.projectRoot;
}

/*
 * ## Project Context Switching and Agent Dispatch Fixed
 *
 * Resolution order: explicit `project_root` / `cwd` → explicit `state_dir` derivation
 * → ROLAND_PROJECT_ROOT env → derive from ROLAND_STATE_DIR → cwd walk.
 *
 * MCP stdio (Cursor): pass `project_root` per tool call or set ROLAND_PROJECT_ROOT
 * in ~/.cursor/mcp.json env for the workspace.
 *
 * MCP HTTP (Hermes / dashboard): pass `project_root` on tools/call; the dashboard
 * aligns its active project before handling the request when no mission is running.
 *
 * Background workers: supervisor sets ROLAND_* env + chdir; team-cli resolves
 * state dir from --state-dir / env before blackboard cleanup.
 *
 * Isolation: cleanupPreviousRuns + sanitizeStaleMissionState on mission start;
 * roland_run_team passes --clean; team-orchestrator archives stale board entries.
 *
 * Test: npx vitest run tests/unit/mcp-project-context.test.ts tests/integration/mcp-mission-project-context.test.ts tests/integration/project-context-alternating-missions.test.ts
 *
 * ## P0 Items Complete — Roland More Production Ready
 * - scopedProjectEnv / withProjectContext reduce global env mutation
 * - explicit project_root/cwd always wins over stale ROLAND_STATE_DIR
 */
