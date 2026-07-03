/**
 * Cursor SDK model catalog — shared by routing, dashboard, and web UI.
 *
 * Keep in sync with scripts/serve-dashboard.js CURSOR_MODELS metadata.
 * IDs here are the allowlist for ROLAND_PM_MODEL / ROLAND_ENGINEER_MODEL env vars.
 */
/** Default Lead PM model — matches GET /api/models `defaults.pm`. */
export declare const DEFAULT_PM_MODEL = "gpt-5.4-nano";
/** Default engineer model — matches GET /api/models `defaults.engineer`. */
export declare const DEFAULT_ENGINEER_MODEL = "composer-2.5";
/**
 * Dashboard-selectable Cursor SDK model IDs (excludes "auto").
 * "auto" means use the defaults above — do not pass it to the SDK.
 */
export declare const CURSOR_MODEL_IDS: readonly ["grok-4.3", "composer-2.5", "gpt-5.4-nano", "claude-opus-4-7", "claude-sonnet-4-6", "gpt-5.2", "gpt-5.5-medium", "composer-2", "gpt-5.1-codex-mini", "gpt-5-mini", "gemini-2.5-flash", "claude-haiku-4-5", "gemini-2.5-pro"];
export type CursorModelId = (typeof CURSOR_MODEL_IDS)[number];
export declare const VALID_CURSOR_MODELS: ReadonlySet<string>;
export declare function isValidCursorModel(id: string): boolean;
//# sourceMappingURL=cursor-models.d.ts.map