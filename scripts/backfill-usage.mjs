#!/usr/bin/env node
/**
 * One-time backfill: synthesises a usage-history.json entry from an existing
 * run-state.json.  Useful when upgrading a project that ran before the usage
 * tracker was added.
 *
 * Usage:
 *   node scripts/backfill-usage.mjs --state-dir <path>
 *   node scripts/backfill-usage.mjs --state-dir C:\...\tests\.roland
 */

import fs   from 'fs';
import path from 'path';

// ── CLI arg ────────────────────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const sdIdx = args.indexOf('--state-dir');
const sdArg = args.find(a => a.startsWith('--state-dir='))?.split('=').slice(1).join('=')
           ?? (sdIdx !== -1 ? args[sdIdx + 1] : undefined);
const stateDir = path.resolve(sdArg ?? '.roland');

const runStateFile   = path.join(stateDir, 'run-state.json');
const usageFile      = path.join(stateDir, 'usage-history.json');

if (!fs.existsSync(runStateFile)) {
  console.error('run-state.json not found in', stateDir);
  process.exit(1);
}

// ── Read run-state ─────────────────────────────────────────────────────────────
const rs = JSON.parse(fs.readFileSync(runStateFile, 'utf8'));

// ── Pricing / estimation constants ────────────────────────────────────────────
const CHARS_PER_TOKEN = 4;
const PRICING = {
  'grok-4.3':          { i: 5.00,  o: 15.00 },
  'composer-2.5':      { i: 3.00,  o: 12.00 },
  'claude-opus-4-7':   { i: 15.00, o: 75.00 },
  'claude-sonnet-4-6': { i:  3.00, o: 15.00 },
};
const FALLBACK = { i: 3.00, o: 12.00 };

// Typical char sizes by agent role (rough estimates for backfill only)
const AGENT_SIZES = {
  'architect':          { in: 20000, out: 14000 },
  'executor':           { in: 26000, out: 13000 },
  'test-author':        { in: 27000, out: 17000 },
  'test-executor':      { in: 18000, out: 10000 },
  'code-reviewer':      { in: 22000, out: 12000 },
  'security-reviewer':  { in: 20000, out: 11000 },
  'writer':             { in: 18000, out: 12000 },
  'Lead-PM-planning':   { in: 26000, out:  9000 },
  'Lead-PM-review':     { in: 24000, out:  4500 },
  'Lead-PM-synthesis':  { in: 34000, out: 14000 },
};

function buildTaskUsage(taskId, taskTitle, agent, model, inputChars, outputChars, durationMs) {
  const ei = Math.round(inputChars  / CHARS_PER_TOKEN);
  const eo = Math.round(outputChars / CHARS_PER_TOKEN);
  const p  = PRICING[model] ?? FALLBACK;
  return { taskId, taskTitle, agent, model,
           inputChars, outputChars,
           estimatedInputTokens: ei, estimatedOutputTokens: eo,
           durationMs,
           estimatedCostUsd: (ei / 1e6) * p.i + (eo / 1e6) * p.o };
}

// ── Build synthetic task list ──────────────────────────────────────────────────
const usageTasks = [];

// PM Planning (estimate duration = time from startedAt to first task startedAt)
const firstTask    = rs.tasks.find(t => t.startedAt);
const planDuration = firstTask ? (firstTask.startedAt - rs.startedAt) : 45_000;
const pmSizes      = AGENT_SIZES['Lead-PM-planning'];
usageTasks.push(buildTaskUsage('pm-planning', 'Lead PM: Planning', 'Lead-PM', 'grok-4.3',
  pmSizes.in, pmSizes.out, planDuration));

// Worker tasks (from actual run-state timing)
const wavesSeen = new Set();
for (const t of rs.tasks) {
  const agentKey = t.agent.toLowerCase().replace(/\s+/g, '-');
  const model    = agentKey === 'lead-pm' ? 'grok-4.3' : 'composer-2.5';
  const sizes    = AGENT_SIZES[agentKey] ?? { in: 22000, out: 11000 };
  const dur      = (t.completedAt && t.startedAt) ? (t.completedAt - t.startedAt) : 45_000;

  usageTasks.push(buildTaskUsage(t.id, t.title, t.agent, model, sizes.in, sizes.out, dur));

  // Insert a PM review after each wave (except the last one before synthesis)
  if (t.wave && !wavesSeen.has(t.wave)) {
    wavesSeen.add(t.wave);
  }
}

// PM reviews (one per completed wave except the final)
const waves = [...wavesSeen].sort((a, b) => a - b);
for (const w of waves.slice(0, -1)) {
  const revSizes = AGENT_SIZES['Lead-PM-review'];
  usageTasks.push(buildTaskUsage(
    `pm-review-${w}`, `Lead PM: Wave ${w} Review`, 'Lead-PM', 'grok-4.3',
    revSizes.in, revSizes.out, 18_000));
}

// PM Synthesis
const synthSizes = AGENT_SIZES['Lead-PM-synthesis'];
usageTasks.push(buildTaskUsage('pm-synthesis', 'Lead PM: Synthesis', 'Lead-PM', 'grok-4.3',
  synthSizes.in, synthSizes.out, 52_000));

// ── Aggregate ──────────────────────────────────────────────────────────────────
const totalInputTokens  = usageTasks.reduce((s, t) => s + t.estimatedInputTokens,  0);
const totalOutputTokens = usageTasks.reduce((s, t) => s + t.estimatedOutputTokens, 0);
const totalCostUsd      = usageTasks.reduce((s, t) => s + t.estimatedCostUsd,       0);

const record = {
  runId:               rs.runId,
  timestamp:           rs.startedAt,
  goal:                rs.goal,
  wavesRun:            rs.currentWave,
  blockersEncountered: rs.tasks.filter(t => t.hadBlocker).length,
  durationMs:          rs.updatedAt - rs.startedAt,
  tasks:               usageTasks,
  totalInputTokens,
  totalOutputTokens,
  totalTokens: totalInputTokens + totalOutputTokens,
  totalCostUsd,
};

// ── Merge with existing history (if any) ──────────────────────────────────────
let history = [];
try { history = JSON.parse(fs.readFileSync(usageFile, 'utf8')); } catch {}
if (!Array.isArray(history)) history = [];

// Don't duplicate if same runId already exists
if (history.some(r => r.runId === record.runId)) {
  console.log(`Run ${record.runId} already in usage-history.json — skipping.`);
  process.exit(0);
}

history.push(record);
fs.writeFileSync(usageFile, JSON.stringify(history, null, 2), 'utf8');

const mins = Math.floor(record.durationMs / 60_000);
const secs = Math.round((record.durationMs % 60_000) / 1_000);
console.log(`✓ Backfilled run ${record.runId} → ${usageFile}`);
console.log(`  Goal     : ${record.goal.slice(0, 60)}`);
console.log(`  Waves    : ${record.wavesRun}  |  Tasks: ${rs.tasks.length} worker + ${usageTasks.length - rs.tasks.length} PM`);
console.log(`  Tokens   : ~${(record.totalTokens / 1000).toFixed(1)}K est.`);
console.log(`  Cost     : ~$${record.totalCostUsd.toFixed(4)} est.`);
console.log(`  Duration : ${mins}m ${secs}s`);
console.log(``);
console.log(`View it:`);
console.log(`  node scripts/serve-dashboard.js --state-dir "${stateDir}"`);
console.log(`  Open http://127.0.0.1:8081`);
