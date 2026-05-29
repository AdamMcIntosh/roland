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

/** Only real Cursor SDK model IDs belong here — no Anthropic model strings. */
const VALID_CURSOR_MODELS = new Set([
  'gpt-5.4-nano',
  'gpt-5-mini',
  'gpt-5.1-codex-mini',
  'gemini-2.5-flash',
  'composer-2.5',
  'composer-2',
]);

export function toCursorModelId(model: string, agentName: string = ''): string {
  const m = model.toLowerCase().trim();
  const n = agentName.toLowerCase();

  // ── 1. Agent-name PM heuristic (always checked first) ────────────────────
  // Ensures Lead-PM always gets gpt-5.4-nano regardless of YAML model field.
  if (n.includes('pm') || n.includes('lead') || n.includes('manager')) {
    return 'gpt-5.4-nano';
  }

  // ── 2. Exact approved Cursor model ID ────────────────────────────────────
  // claude-sonnet-* / claude-opus-* are intentionally excluded — they are
  // Anthropic API identifiers, not Cursor SDK model IDs.
  if (VALID_CURSOR_MODELS.has(m)) return m;

  // ── 3. Legacy / stale model-string keywords → remap ──────────────────────
  // Any grok or opus string in a legacy YAML → gpt-5.4-nano (PM-class reasoning).
  if (m.includes('grok'))      return 'gpt-5.4-nano';
  if (m.includes('opus'))      return 'gpt-5.4-nano';
  // Any OpenRouter provider prefix or stale non-Cursor model string → composer-2.5.
  // This is a safety net — agent YAMLs should all use composer-2.5 directly now.
  if (m.includes('openrouter')) return 'composer-2.5';
  if (m.includes('sonnet'))    return 'composer-2.5';
  if (m.includes('haiku'))     return 'composer-2.5';
  if (m.includes('deepseek'))  return 'composer-2.5';
  if (m.includes('qwen'))      return 'composer-2.5';
  if (m.includes('minimax'))   return 'composer-2.5';
  // Legacy "composer-2.5-fast" / "composer-2.5-standard" → composer-2.5
  if (m.includes('composer-2.5')) return 'composer-2.5';
  if (m.includes('composer-2'))   return 'composer-2';

  // ── 4. Hard default → composer-2.5 ───────────────────────────────────────
  return 'composer-2.5';
}
