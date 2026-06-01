/**
 * Project-scoped path resolution for the coordination substrate.
 *
 * Roland's binary is installed once (globally, e.g. ~/.roland), but coordination
 * state is per-project so it travels with the repo and never collides across
 * Cursor workspaces. State lives under <projectRoot>/.roland/ — the same
 * directory ProjectContextManager and QualityTracker already use, and which is
 * already gitignored.
 *
 * Resolution order for the project root:
 *   1. ROLAND_PROJECT_ROOT env (set by the host when cwd is unreliable)
 *   2. nearest ancestor of cwd containing a .git directory
 *   3. process.cwd()
 */
export declare function projectRoot(): string;
/** Resolve (and lazily create) the project-local .roland/ directory. */
export declare function coordDir(): string;
export declare function blackboardFile(): string;
export declare function busFile(): string;
/** Append-only JSONL trail of PM lifecycle events (Phase 4 observability). */
export declare function pmEventsFile(): string;
//# sourceMappingURL=paths.d.ts.map