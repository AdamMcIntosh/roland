/**
 * RCO Session Persistence — state management via Claude notepad skill + local JSON fallback.
 * Save/load via prompts: "Store state: [JSON]" and retrieve. Hybrid: fallback to local JSON files.
 */
import { type PersistedState } from './schemas.js';
import type { RcoState } from './rco/types.js';
/** Key prefix for notepad entries (Claude notepad skill). */
export declare const RCO_NOTEPAD_PREFIX = "rco-state:";
/**
 * Build prompt text for Claude to store state in notepad (manual or tool).
 * Production: user prompts Claude "Store state: ..." or we pass this to a tool.
 */
export declare function buildNotepadStorePrompt(state: RcoState, key?: string): string;
/**
 * Build prompt text for Claude to retrieve state from notepad.
 */
export declare function buildNotepadRetrievePrompt(sessionId: string): string;
/**
 * Parse notepad response (Claude returns JSON string). Validate with PersistedStateSchema.
 */
export declare function parseNotepadResponse(raw: string): PersistedState | null;
/** Default directory for local JSON fallback (hybrid mode). */
export declare const DEFAULT_STATE_DIR = ".rco-sessions";
/**
 * Save state to local JSON file (hybrid fallback when not using Claude notepad).
 */
export declare function saveStateToLocal(state: RcoState, stateDir?: string): string;
/**
 * Load state from local JSON file. Returns null if missing or invalid.
 */
export declare function loadStateFromLocal(sessionId: string, stateDir?: string): RcoState | null;
/**
 * List session IDs that have local state files.
 */
export declare function listLocalSessionIds(stateDir?: string): string[];
//# sourceMappingURL=persistence.d.ts.map