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

import fs from 'fs';
import path from 'path';

export function projectRoot(): string {
  const override = process.env.ROLAND_PROJECT_ROOT;
  if (override) return path.resolve(override);

  let dir = process.cwd();
  // Walk up looking for a repo root.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Resolve (and lazily create) the project-local .roland/ directory. */
export function coordDir(): string {
  const dir = path.join(projectRoot(), '.roland');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function blackboardFile(): string {
  return path.join(coordDir(), 'blackboard.json');
}

export function busFile(): string {
  return path.join(coordDir(), 'bus.json');
}

/** Append-only JSONL trail of PM lifecycle events (Phase 4 observability). */
export function pmEventsFile(): string {
  return path.join(coordDir(), 'pm-events.log');
}
