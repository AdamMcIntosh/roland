/**
 * Cursor model routing for RCO agents.
 *
 * Single source of truth used by both agentWorker (child process) and
 * team-orchestrator (main process). Resolves any model string + agent name
 * to a valid Cursor SDK model ID.
 *
 * Valid Cursor models (as of 2026-05):
 *   claude-opus-4-7     — most capable, used for Lead PM / orchestration
 *   claude-sonnet-4-6   — strong reasoning, good for architect/review roles
 *   composer-2.5        — Cursor's native composer model (default for workers)
 *   composer-2          — lighter composer model
 *   claude-haiku-4-5    — fast, cheap, for doc/summary tasks
 *
 * Resolution order:
 *  1. Exact Cursor model ID in the YAML — honoured as-is.
 *  2. Legacy model-string keywords (opus, sonnet, haiku …).
 *  3. Agent-name heuristics for agents with legacy/missing model fields.
 *
 * Lanes:
 *   claude-opus-4-7    — Lead PM, orchestration
 *   claude-sonnet-4-6  — reasoning-heavy: architect, reviewer, critic, …
 *   composer-2.5       — execution: builder, qa, tester, doc-writer, … (default)
 */

const VALID_CURSOR_MODELS = new Set([
  'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5',
  'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4',
  'claude-haiku-4-5',
  'composer-2.5', 'composer-2',
  'default',
]);

const REASONING_ROLES = [
  'architect', 'review', 'critic', 'plan', 'analyst',
  'scientist', 'research', 'design', 'explore', 'security',
  'author',  // test-author writes tests — reasoning-heavy, routes to Sonnet
];

export function toCursorModelId(model: string, agentName: string = ''): string {
  const m = model.toLowerCase().trim();
  const n = agentName.toLowerCase();

  // ── 1. Exact valid Cursor model ID ────────────────────────────────────────
  if (VALID_CURSOR_MODELS.has(m)) return m;

  // ── 2. Legacy model-string keywords ──────────────────────────────────────
  if (m.includes('opus'))   return 'claude-opus-4-7';
  if (m.includes('sonnet')) return 'claude-sonnet-4-6';
  if (m.includes('haiku'))  return 'claude-haiku-4-5';
  // Legacy "composer-2.5-fast" / "composer-2.5-standard" → composer-2.5
  if (m.includes('composer-2.5')) return 'composer-2.5';
  if (m.includes('composer-2'))   return 'composer-2';

  // ── 3. Agent-name heuristics ──────────────────────────────────────────────
  // PM / orchestration → Opus
  if (n.includes('pm') || n.includes('lead') || n.includes('manager')) {
    return 'claude-opus-4-7';
  }
  // Reasoning-heavy roles → Sonnet
  if (REASONING_ROLES.some((r) => n.includes(r))) {
    return 'claude-sonnet-4-6';
  }
  // Execution / output roles → composer-2.5 (default)
  return 'composer-2.5';
}
