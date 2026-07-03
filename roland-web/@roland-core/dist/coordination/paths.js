/**
 * Project-scoped path resolution for the coordination substrate.
 *
 * Roland's binary is installed once (globally via npm), but coordination state
 * is per-project so it travels with the repo and never collides across Cursor
 * workspaces. State lives under <projectRoot>/.roland/.
 *
 * @see resolveProjectRoot in ../utils/project-root.ts
 */
import fs from 'fs';
import path from 'path';
import { resolveProjectRoot } from '../utils/project-root.js';
export function projectRoot() {
    return resolveProjectRoot(process.cwd());
}
/** Resolve (and lazily create) the project-local .roland/ directory. */
export function coordDir() {
    const dir = path.join(projectRoot(), '.roland');
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function blackboardFile() {
    return path.join(coordDir(), 'blackboard.json');
}
export function busFile() {
    return path.join(coordDir(), 'bus.json');
}
/** Append-only JSONL trail of PM lifecycle events (Phase 4 observability). */
export function pmEventsFile() {
    return path.join(coordDir(), 'pm-events.log');
}
//# sourceMappingURL=paths.js.map