/**
 * Cursor model routing for RCO agents.
 *
 * Single source of truth used by both agentWorker (child process) and
 * team-orchestrator (main process). Resolves any model string + agent name
 * to a valid Cursor SDK model ID.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  HARD MODEL STRATEGY — DO NOT ADD CLAUDE SONNET FALLBACKS   ║
 * ║                                                              ║
 * ║  Lead PM only  →  gpt-5.4-nano                              ║
 * ║  ALL engineers →  composer-2.5  (no exceptions)             ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Valid Cursor models (as of 2026-05):
 *   gpt-5.4-nano  — Lead PM / orchestration only ($0.20/$1.25 per MTok)
 *   composer-2.5  — ALL engineer agents (default for every non-PM agent)
 *   composer-2    — lighter composer variant (explicit use only)
 *   gpt-5-mini    — available but not used by default
 *   gpt-5.1-codex-mini — available but not used by default
 *   gemini-2.5-flash   — available but not used by default
 *
 * NOTE: claude-sonnet-*, claude-opus-*, openrouter/*, deepseek/*, qwen/*, and
 * minimax/* are NOT valid Cursor SDK model IDs. They must never appear in
 * VALID_CURSOR_MODELS. The legacy remap table below catches any stale YAML
 * values that slip through and normalises them to composer-2.5 or gpt-5.4-nano.
 *
 * Resolution order:
 *  1. Agent-name PM heuristic — checked FIRST so Lead-PM always wins.
 *  2. Exact approved Cursor model ID.
 *  3. Legacy / stale model-string keywords → remap to gpt-5.4-nano or composer-2.5.
 *  4. Hard default → composer-2.5.
 */
export declare function toCursorModelId(model: string, agentName?: string): string;
//# sourceMappingURL=model-routing.d.ts.map