/**
 * Cursor model routing for RCO agents.
 *
 * Single source of truth used by both agentWorker (child process) and
 * team-orchestrator (main process). Resolves any model string + agent name
 * to a valid Cursor SDK model ID.
 *
 * Defaults (when dashboard selects "auto" or no env override):
 *   Lead PM     → gpt-5.4-nano   (matches /api/models defaults.pm)
 *   Engineers   → composer-2.5   (matches /api/models defaults.engineer)
 *
 * Dashboard / CLI overrides:
 *   ROLAND_PM_MODEL        — any ID in VALID_CURSOR_MODELS
 *   ROLAND_ENGINEER_MODEL  — any ID in VALID_CURSOR_MODELS
 *
 * Resolution order:
 *  1. Agent-name PM heuristic — Lead-PM uses PM default or ROLAND_PM_MODEL.
 *  2. Engineer env override — ROLAND_ENGINEER_MODEL for all non-PM agents.
 *  3. Exact approved Cursor model ID from agent YAML or caller.
 *  4. Legacy / stale model-string keywords → canonical dashboard ID.
 *  5. Hard default → DEFAULT_ENGINEER_MODEL.
 */

import {
  DEFAULT_ENGINEER_MODEL,
  DEFAULT_PM_MODEL,
  VALID_CURSOR_MODELS,
  isValidCursorModel,
} from './cursor-models.js';

export { VALID_CURSOR_MODELS, isValidCursorModel } from './cursor-models.js';
export { DEFAULT_PM_MODEL, DEFAULT_ENGINEER_MODEL } from './cursor-models.js';

function resolvePmModel(): string {
  const pmOverride = process.env.ROLAND_PM_MODEL?.trim();
  if (pmOverride && pmOverride !== 'auto' && isValidCursorModel(pmOverride)) return pmOverride;
  return DEFAULT_PM_MODEL;
}

function resolveEngineerOverride(): string | null {
  const engOverride = process.env.ROLAND_ENGINEER_MODEL?.trim();
  if (engOverride && engOverride !== 'auto' && isValidCursorModel(engOverride)) return engOverride;
  return null;
}

export function toCursorModelId(model: string, agentName: string = ''): string {
  const m = model.toLowerCase().trim();
  const n = agentName.toLowerCase();
  const isPM = n.includes('pm') || n.includes('lead') || n.includes('manager');

  // ── 1. Agent-name PM heuristic (always checked first) ────────────────────
  if (isPM) return resolvePmModel();

  // ── 2. Engineer env var override ─────────────────────────────────────────
  const engOverride = resolveEngineerOverride();
  if (engOverride) return engOverride;

  // ── 3. Exact approved Cursor model ID ────────────────────────────────────
  if (VALID_CURSOR_MODELS.has(m)) return m;

  // ── 4. Legacy / stale model-string keywords → remap ──────────────────────
  if (m.includes('openrouter')) return DEFAULT_ENGINEER_MODEL;
  if (m.includes('deepseek')) return DEFAULT_ENGINEER_MODEL;
  if (m.includes('qwen')) return DEFAULT_ENGINEER_MODEL;
  if (m.includes('minimax')) return DEFAULT_ENGINEER_MODEL;
  if (m.includes('grok')) return DEFAULT_PM_MODEL;
  if (m.includes('opus')) return 'claude-opus-4-7';
  if (m.includes('sonnet')) return 'claude-sonnet-4-6';
  if (m.includes('haiku')) return 'claude-haiku-4-5';
  if (m.includes('gemini') && m.includes('pro')) return 'gemini-2.5-pro';
  if (m.includes('gemini')) return 'gemini-2.5-flash';
  if (m.includes('composer-2.5')) return 'composer-2.5';
  if (m.includes('composer-2')) return 'composer-2';

  // ── 5. Hard default ──────────────────────────────────────────────────────
  return DEFAULT_ENGINEER_MODEL;
}
