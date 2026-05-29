/**
 * RCO Usage Tracker — per-run token estimation and cost recording.
 *
 * Token counts are estimated from character counts (4 chars ≈ 1 token), which
 * is a reasonable heuristic for English prose + code.  Costs are estimated from
 * per-model rates; actual charges depend on your contract / tier.
 *
 * Data is appended to  .roland/usage-history.json  (one JSON array).
 */

import fs from 'fs';
import path from 'path';

// ── Pricing table (USD per 1 M tokens) ────────────────────────────────────────
// Cursor API models do not publish per-token prices, so these are reasonable
// estimates.  Update the table if you have better data.

const MODEL_PRICING: Record<string, { inputUsdPerMTok: number; outputUsdPerMTok: number }> = {
  'gpt-5.4-nano':      { inputUsdPerMTok:  0.20, outputUsdPerMTok:  1.25 },
  'composer-2.5':      { inputUsdPerMTok:  3.00, outputUsdPerMTok: 12.00 },
  'claude-opus-4-7':   { inputUsdPerMTok: 15.00, outputUsdPerMTok: 75.00 },
  'claude-sonnet-4-6': { inputUsdPerMTok:  3.00, outputUsdPerMTok: 15.00 },
  'claude-haiku-4-5':  { inputUsdPerMTok:  0.80, outputUsdPerMTok:  4.00 },
};

const FALLBACK_PRICING = { inputUsdPerMTok: 3.00, outputUsdPerMTok: 12.00 };
const CHARS_PER_TOKEN  = 4;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskUsageRecord {
  taskId:                   string;
  taskTitle:                string;
  agent:                    string;
  model:                    string;
  inputChars:               number;
  outputChars:              number;
  estimatedInputTokens:     number;
  estimatedOutputTokens:    number;
  durationMs:               number;
  estimatedCostUsd:         number;
}

export interface RunUsageRecord {
  runId:                string;
  /** Unix ms — start of the run. */
  timestamp:            number;
  goal:                 string;
  wavesRun:             number;
  blockersEncountered:  number;
  durationMs:           number;
  tasks:                TaskUsageRecord[];
  totalInputTokens:     number;
  totalOutputTokens:    number;
  totalTokens:          number;
  totalCostUsd:         number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function estimateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  return (inputTokens  / 1_000_000) * p.inputUsdPerMTok
       + (outputTokens / 1_000_000) * p.outputUsdPerMTok;
}

/**
 * Build a TaskUsageRecord from raw char counts and wall-clock duration.
 * Called immediately after each callCursorAgent() returns.
 */
export function buildTaskUsage(
  taskId:      string,
  taskTitle:   string,
  agent:       string,
  model:       string,
  inputChars:  number,
  outputChars: number,
  durationMs:  number,
): TaskUsageRecord {
  const estimatedInputTokens  = Math.round(inputChars  / CHARS_PER_TOKEN);
  const estimatedOutputTokens = Math.round(outputChars / CHARS_PER_TOKEN);
  return {
    taskId, taskTitle, agent, model,
    inputChars, outputChars,
    estimatedInputTokens, estimatedOutputTokens,
    durationMs,
    estimatedCostUsd: estimateTokenCost(model, estimatedInputTokens, estimatedOutputTokens),
  };
}

/**
 * Aggregate per-task records into a RunUsageRecord for the whole run.
 */
export function buildRunUsage(opts: {
  runId:                string;
  runStart:             number;
  runEnd:               number;
  goal:                 string;
  wavesRun:             number;
  blockersEncountered:  number;
  tasks:                TaskUsageRecord[];
}): RunUsageRecord {
  const { runId, runStart, runEnd, goal, wavesRun, blockersEncountered, tasks } = opts;
  const totalInputTokens  = tasks.reduce((s, t) => s + t.estimatedInputTokens,  0);
  const totalOutputTokens = tasks.reduce((s, t) => s + t.estimatedOutputTokens, 0);
  return {
    runId,
    timestamp: runStart,
    goal,
    wavesRun,
    blockersEncountered,
    durationMs: runEnd - runStart,
    tasks,
    totalInputTokens,
    totalOutputTokens,
    totalTokens:  totalInputTokens + totalOutputTokens,
    totalCostUsd: tasks.reduce((s, t) => s + t.estimatedCostUsd, 0),
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

/** Append a RunUsageRecord to .roland/usage-history.json (creates file if absent). */
export function saveRunUsage(stateDir: string, record: RunUsageRecord): void {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = path.join(stateDir, 'usage-history.json');
  let history: RunUsageRecord[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    history = Array.isArray(raw) ? raw : [];
  } catch {
    // file doesn't exist or invalid JSON — start fresh
  }
  history.push(record);
  fs.writeFileSync(file, JSON.stringify(history, null, 2), 'utf8');
}

/** Read all RunUsageRecords from .roland/usage-history.json (returns [] on any error). */
export function loadUsageHistory(stateDir: string): RunUsageRecord[] {
  const file = path.join(stateDir, 'usage-history.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw as RunUsageRecord[] : [];
  } catch {
    return [];
  }
}
