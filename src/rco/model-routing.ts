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
 * ║  Lead PM only  →  grok-4.3                                  ║
 * ║  ALL engineers →  composer-2.5  (no exceptions)             ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Valid Cursor models (as of 2026-05):
 *   grok-4.3      — Lead PM / orchestration only
 *   composer-2.5  — ALL engineer agents (default for every non-PM agent)
 *   composer-2    — lighter composer variant (explicit use only)
 *
 * NOTE: claude-sonnet-* and claude-opus-* are NOT valid Cursor SDK model IDs.
 * They must never appear in VALID_CURSOR_MODELS — if they did, a stale YAML
 * value would bypass all routing and reach the SDK verbatim.
 *
 * Resolution order:
 *  1. Agent-name PM heuristic — checked FIRST so Lead-PM always wins.
 *  2. Exact approved Cursor model ID (composer-2.5, grok-4.3, composer-2).
 *  3. Legacy model-string keywords (opus → grok-4.3, sonnet/deepseek/etc → composer-2.5).
 *  4. Hard default → composer-2.5.
 */

/** Only real Cursor SDK model IDs belong here — no Anthropic model strings. */
const VALID_CURSOR_MODELS = new Set([
  'grok-4.3',
  'composer-2.5',
  'composer-2',
]);

export function toCursorModelId(model: string, agentName: string = ''): string {
  const m = model.toLowerCase().trim();
  const n = agentName.toLowerCase();

  // ── 1. Agent-name PM heuristic (always checked first) ────────────────────
  // Ensures Lead-PM always gets grok-4.3 regardless of YAML model field.
  if (n.includes('pm') || n.includes('lead') || n.includes('manager')) {
    return 'grok-4.3';
  }

  // ── 2. Exact approved Cursor model ID ────────────────────────────────────
  // Only composer-2.5, grok-4.3, composer-2 are whitelisted.
  // claude-sonnet-* / claude-opus-* are intentionally excluded — they are
  // Anthropic API identifiers, not Cursor SDK model IDs.
  if (VALID_CURSOR_MODELS.has(m)) return m;

  // ── 3. Legacy / stale model-string keywords → remap ──────────────────────
  // Any opus string in a legacy YAML → grok-4.3 (PM-class reasoning).
  if (m.includes('opus'))   return 'grok-4.3';
  // Any sonnet, deepseek, qwen, minimax, or other non-Cursor string → composer-2.5.
  if (m.includes('sonnet'))   return 'composer-2.5';
  if (m.includes('haiku'))    return 'composer-2.5';
  if (m.includes('deepseek')) return 'composer-2.5';
  if (m.includes('qwen'))     return 'composer-2.5';
  if (m.includes('minimax'))  return 'composer-2.5';
  if (m.includes('gemini'))   return 'composer-2.5';
  // Legacy "composer-2.5-fast" / "composer-2.5-standard" → composer-2.5
  if (m.includes('composer-2.5')) return 'composer-2.5';
  if (m.includes('composer-2'))   return 'composer-2';

  // ── 4. Hard default → composer-2.5 ───────────────────────────────────────
  return 'composer-2.5';
}
