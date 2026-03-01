/**
 * RCO Session Persistence — state management via Claude notepad skill + local JSON fallback.
 * Save/load via prompts: "Store state: [JSON]" and retrieve. Hybrid: fallback to local JSON files.
 */

import fs from 'fs';
import path from 'path';
import { PersistedStateSchema, type PersistedState } from './schemas.js';
import type { RcoState } from './rco/types.js';

const RCO_VERBOSE = process.env.RCO_VERBOSE !== '0' && process.env.RCO_VERBOSE !== 'false';

function log(msg: string): void {
  if (RCO_VERBOSE) console.error(`[RCO persistence] ${msg}`);
}

/** Key prefix for notepad entries (Claude notepad skill). */
export const RCO_NOTEPAD_PREFIX = 'rco-state:';

/**
 * Build prompt text for Claude to store state in notepad (manual or tool).
 * Production: user prompts Claude "Store state: ..." or we pass this to a tool.
 */
export function buildNotepadStorePrompt(state: RcoState, key?: string): string {
  const k = key ?? `${RCO_NOTEPAD_PREFIX}${state.sessionId}`;
  const payload = PersistedStateSchema.safeParse(state);
  const json = JSON.stringify(payload.success ? payload.data : state);
  return `Store in notepad under key "${k}": ${json}`;
}

/**
 * Build prompt text for Claude to retrieve state from notepad.
 */
export function buildNotepadRetrievePrompt(sessionId: string): string {
  const key = `${RCO_NOTEPAD_PREFIX}${sessionId}`;
  return `Retrieve from notepad the value for key "${key}". Respond with only the JSON object.`;
}

/**
 * Parse notepad response (Claude returns JSON string). Validate with PersistedStateSchema.
 */
export function parseNotepadResponse(raw: string): PersistedState | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    const result = PersistedStateSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Default directory for local JSON fallback (hybrid mode). */
export const DEFAULT_STATE_DIR = '.rco-sessions';

/**
 * Save state to local JSON file (hybrid fallback when not using Claude notepad).
 */
export function saveStateToLocal(state: RcoState, stateDir: string = DEFAULT_STATE_DIR): string {
  const dir = path.isAbsolute(stateDir) ? stateDir : path.join(process.cwd(), stateDir);
  fs.mkdirSync(dir, { recursive: true });
  const validated = PersistedStateSchema.safeParse(state);
  const data = validated.success ? validated.data : state;
  const filePath = path.join(dir, `${state.sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  log(`Saved state to ${filePath}`);
  return filePath;
}

/**
 * Load state from local JSON file. Returns null if missing or invalid.
 */
export function loadStateFromLocal(sessionId: string, stateDir: string = DEFAULT_STATE_DIR): RcoState | null {
  const dir = path.isAbsolute(stateDir) ? stateDir : path.join(process.cwd(), stateDir);
  const filePath = path.join(dir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const result = PersistedStateSchema.safeParse(parsed);
    if (!result.success) {
      log(`Invalid state in ${filePath}: ${result.error.message}`);
      return null;
    }
    return result.data as unknown as RcoState;
  } catch (e) {
    log(`Load failed ${filePath}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * List session IDs that have local state files.
 */
export function listLocalSessionIds(stateDir: string = DEFAULT_STATE_DIR): string[] {
  const dir = path.isAbsolute(stateDir) ? stateDir : path.join(process.cwd(), stateDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'));
}
