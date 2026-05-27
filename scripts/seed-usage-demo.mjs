#!/usr/bin/env node
/**
 * Seed .roland/usage-history.json with realistic demo data so you can
 * verify the Usage Dashboard display without running a real team session.
 *
 * Usage:
 *   node scripts/seed-usage-demo.mjs
 *   node scripts/seed-usage-demo.mjs --state-dir /path/to/.roland
 *   node scripts/seed-usage-demo.mjs --clear   (wipe existing + reseed)
 */

import fs   from 'fs';
import path from 'path';

const args     = process.argv.slice(2);
const clear    = args.includes('--clear');
const sdIdx    = args.indexOf('--state-dir');
const sdArg    = args.find(a => a.startsWith('--state-dir='))?.split('=').slice(1).join('=')
              ?? (sdIdx !== -1 ? args[sdIdx + 1] : undefined);
const stateDir = path.resolve(sdArg ?? '.roland');
const outFile  = path.join(stateDir, 'usage-history.json');

fs.mkdirSync(stateDir, { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fakeTasks(agents, baseTs) {
  return agents.map((agent, i) => {
    const model = agent === 'Lead-PM' ? 'grok-4.3' : 'composer-2.5';
    const inputChars  = randInt(4000, 40000);
    const outputChars = randInt(2000, 20000);
    const inputTok    = Math.round(inputChars  / 4);
    const outputTok   = Math.round(outputChars / 4);
    const pricing     = model === 'grok-4.3'
      ? { i: 5.00, o: 15.00 }
      : { i: 3.00, o: 12.00 };
    const cost = (inputTok / 1e6) * pricing.i + (outputTok / 1e6) * pricing.o;
    return {
      taskId:                  agent.startsWith('pm-') ? agent : `task-${i + 1}`,
      taskTitle:               agentTitle(agent),
      agent,
      model,
      inputChars,
      outputChars,
      estimatedInputTokens:    inputTok,
      estimatedOutputTokens:   outputTok,
      durationMs:              randInt(15_000, 180_000),
      estimatedCostUsd:        cost,
    };
  });
}

function agentTitle(agent) {
  const map = {
    'Lead-PM':       'Lead PM: Planning',
    'pm-planning':   'Lead PM: Planning',
    'pm-synthesis':  'Lead PM: Synthesis',
    'pm-review-1':   'Lead PM: Wave 1 Review',
    'executor':      'Implement feature',
    'architect':     'Design review',
    'test-author':   'Write tests',
    'test-executor': 'Run test suite',
    'code-reviewer': 'Code review',
    'security-reviewer': 'Security audit',
    'writer':        'Update documentation',
  };
  return map[agent] ?? agent;
}

function makeRun(goal, agentSet, hoursAgo, waves = 1, blockers = 0) {
  const ts    = Date.now() - hoursAgo * 3_600_000;
  const tasks = [
    ...fakeTasks(['pm-planning'], ts),
    ...fakeTasks(agentSet, ts),
    ...(waves > 1 ? fakeTasks(['pm-review-1'], ts) : []),
    ...fakeTasks(['pm-synthesis'], ts),
  ];
  const totalInputTokens  = tasks.reduce((s, t) => s + t.estimatedInputTokens,  0);
  const totalOutputTokens = tasks.reduce((s, t) => s + t.estimatedOutputTokens, 0);
  const totalCostUsd      = tasks.reduce((s, t) => s + t.estimatedCostUsd,       0);
  return {
    runId:               ts.toString(36),
    timestamp:           ts,
    goal,
    wavesRun:            waves,
    blockersEncountered: blockers,
    durationMs:          tasks.reduce((s, t) => s + t.durationMs, 0) + randInt(5000, 30000),
    tasks,
    totalInputTokens,
    totalOutputTokens,
    totalTokens:  totalInputTokens + totalOutputTokens,
    totalCostUsd,
  };
}

// ── Demo dataset ──────────────────────────────────────────────────────────────

const runs = [
  // Today
  makeRun('Add JWT refresh token rotation with 15 min expiry and Redis storage',
    ['executor', 'architect', 'test-author', 'test-executor', 'code-reviewer'],
    1.2, 2, 0),
  makeRun('Fix intermittent 500 on /login — root cause analysis',
    ['executor', 'test-author', 'test-executor'],
    3.5, 1, 1),
  makeRun('Add rate limiting to the Express API (sliding window, Redis)',
    ['architect', 'executor', 'test-author', 'test-executor', 'security-reviewer'],
    5.0, 2, 0),

  // Yesterday / last 48 h
  makeRun('Refactor user service to use clean architecture and dependency injection',
    ['architect', 'executor', 'executor', 'test-author', 'test-executor', 'code-reviewer', 'writer'],
    28, 3, 0),
  makeRun('Add input validation and error handling to user registration endpoint',
    ['executor', 'test-author', 'test-executor'],
    36, 1, 0),
  makeRun('Write integration tests for the payment webhook handler',
    ['test-author', 'test-executor'],
    44, 1, 0),

  // Earlier this week
  makeRun('Security audit: OWASP Top 10 check on the API surface',
    ['security-reviewer', 'code-reviewer', 'writer'],
    72, 1, 2),
  makeRun('Add Prometheus /metrics endpoint with request counters and latency histograms',
    ['architect', 'executor', 'test-author', 'test-executor'],
    96, 2, 0),
  makeRun('Migrate database layer to repository pattern',
    ['architect', 'executor', 'executor', 'test-author', 'test-executor', 'writer'],
    120, 3, 1),

  // Last week
  makeRun('Set up CI pipeline with GitHub Actions — lint, test, build',
    ['executor', 'writer'],
    200, 1, 0),
  makeRun('Add WebSocket support for real-time order status updates',
    ['architect', 'executor', 'test-author', 'test-executor'],
    220, 2, 0),
  makeRun('Implement caching layer with Redis and TTL management',
    ['executor', 'architect', 'test-author'],
    240, 1, 0),
];

// ── Write ─────────────────────────────────────────────────────────────────────

let existing = [];
if (!clear) {
  try { existing = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
  if (!Array.isArray(existing)) existing = [];
}

const combined = [...existing, ...runs];
fs.writeFileSync(outFile, JSON.stringify(combined, null, 2), 'utf8');

const totalToks = runs.reduce((s, r) => s + r.totalTokens,  0);
const totalCost = runs.reduce((s, r) => s + r.totalCostUsd, 0);

console.log(`✓ Wrote ${runs.length} demo runs to ${outFile}`);
console.log(`  Total est. tokens : ${(totalToks / 1000).toFixed(1)}K`);
console.log(`  Total est. cost   : $${totalCost.toFixed(4)}`);
console.log(`\nView the dashboard:`);
console.log(`  1. node scripts/serve-dashboard.js`);
console.log(`  2. Open http://127.0.0.1:8081 → click "Usage & Cost"`);
