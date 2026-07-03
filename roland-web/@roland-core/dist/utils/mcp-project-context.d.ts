/**
 * ## MCP Project Context Fix
 *
 * Resolves project root + `.roland` state directory for MCP-triggered runs
 * (Hermes HTTP, Cursor stdio) and background team missions.
 *
 * Priority: explicit `project_root` / `cwd` arg → env → derive from `state_dir` → cwd walk.
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
/**
 * Pin Roland env vars to a project context (does not chdir — safe for shared MCP servers).
 */
export declare function applyMcpProjectEnv(ctx: McpProjectContext): McpProjectContext;
/** Isolated worker processes may chdir after env is set. */
export declare function chdirToProject(ctx: McpProjectContext): void;
//# sourceMappingURL=mcp-project-context.d.ts.map