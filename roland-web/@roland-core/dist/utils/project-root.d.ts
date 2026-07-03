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
/** Resolve the Roland package install directory (global prefix or linked repo). */
export declare function resolveRolandInstallRoot(fromUrl?: string): string;
/** Resolve the user's project directory Roland should read/write state for. */
export declare function resolveProjectRoot(startDir?: string): string;
/**
 * Set ROLAND_INSTALL_ROOT / ROLAND_PROJECT_ROOT before loading dist/.
 * Safe to call multiple times; explicit env vars are not overwritten.
 */
export declare function bootstrapRolandEnv(opts?: {
    binUrl?: string;
    cwd?: string;
}): {
    installRoot: string;
    projectRoot: string;
};
//# sourceMappingURL=project-root.d.ts.map