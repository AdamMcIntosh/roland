/**
 * Project-scoped path resolution for the coordination substrate.
 *
 * Roland's binary is installed once (globally via npm), but coordination state
 * is per-project so it travels with the repo and never collides across Cursor
 * workspaces. State lives under <projectRoot>/.roland/.
 *
 * @see resolveProjectRoot in ../utils/project-root.ts
 */
export declare function projectRoot(): string;
/** Resolve (and lazily create) the project-local .roland/ directory. */
export declare function coordDir(): string;
export declare function blackboardFile(): string;
export declare function busFile(): string;
/** Append-only JSONL trail of PM lifecycle events (Phase 4 observability). */
export declare function pmEventsFile(): string;
//# sourceMappingURL=paths.d.ts.map