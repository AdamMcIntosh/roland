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
export interface McpProjectContext {
    projectRoot: string;
    stateDir: string;
}
/** Derive project root when only a `.roland` path is known. */
export declare function deriveProjectRootFromStateDir(stateDir: string): string;
/**
 * Resolve `{ projectRoot, stateDir }` from MCP tool args and/or process env.
 * Accepts `project_root` or `cwd` for the target repo Hermes is operating in.
 */
export declare function resolveMcpProjectContext(args?: {
    project_root?: unknown;
    cwd?: unknown;
    state_dir?: unknown;
}): McpProjectContext;
/** Active mission cwd — env pin first, then optional fallback. */
export declare function resolveMissionProjectRoot(fallbackCwd?: string): string;
/** Resolve project root for status panels when only stateDir is known. */
export declare function resolveMissionProjectRootFromState(stateDir: string): string;
/** Build env overrides for a project context without mutating process.env. */
export declare function scopedProjectEnv(ctx: McpProjectContext, base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/**
 * Pin Roland env vars to a project context (does not chdir — safe for shared MCP servers).
 */
export declare function applyMcpProjectEnv(ctx: McpProjectContext): McpProjectContext;
/** Run fn under a project context; restores prior env after fn completes. */
export declare function withProjectContext<T>(ctx: McpProjectContext, fn: (ctx: McpProjectContext) => T | Promise<T>): Promise<T>;
/** Isolated worker processes may chdir after env is set. */
export declare function chdirToProject(ctx: McpProjectContext): void;
/**
 * Pin env + chdir for mission workers (CLI, supervisor, team orchestrator).
 * Returns the resolved project root after chdir.
 */
export declare function ensureMissionProjectContext(ctx: McpProjectContext): string;
//# sourceMappingURL=mcp-project-context.d.ts.map