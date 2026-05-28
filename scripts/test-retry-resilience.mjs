/**
 * Retry-resilience smoke test.
 *
 * Verifies:
 *  1. NETWORK_RETRY_DELAYS  — 6-entry schedule: 2s → 6s → 12s → 25s → 40s → 60s
 *  2. GENERIC_RETRY_DELAYS  — 6-entry schedule: 5s → 12s → 25s → 40s → 60s → 90s
 *  3. MAX_CONCURRENT_AGENTS — default 4
 *  4. NETWORK_ERROR_PATTERNS — covers all required error strings (15 positive, 5 negative)
 *  5. Retry delay selection — correct table chosen per error type
 *  6. Total attempt count   — AGENT_MAX_RETRIES=5 → 6 total attempts
 *  7. Synthetic BLOCKER message — network vs generic content differences
 *  8. runConcurrent throttle — verifies at most N tasks run at once
 *
 * Runs entirely in-memory — no SDK calls, no file I/O.
 */

import {
  NETWORK_RETRY_DELAYS,
  GENERIC_RETRY_DELAYS,
  NETWORK_ERROR_PATTERNS,
  AGENT_MAX_RETRIES,
  MAX_CONCURRENT_AGENTS,
  CIRCUIT_BREAKER_THRESHOLD,
  AGENT_WARMUP_DELAY_MS,
} from '../dist/rco/constants.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? '  →  ' + detail : ''}`);
    failed++;
  }
}

// ── Helper: mirrors the isNetworkError() implementation in team-orchestrator.ts
function isNetworkError(err) {
  const msg = err.message;
  return NETWORK_ERROR_PATTERNS.some((p) =>
    msg.toLowerCase().includes(p.toLowerCase()),
  );
}

// ── Helper: mirrors the delay selection in callCursorAgent
function retryDelay(attempt, netError) {
  const delayTable = netError ? NETWORK_RETRY_DELAYS : GENERIC_RETRY_DELAYS;
  return delayTable[attempt - 1] ?? delayTable[delayTable.length - 1];
}

// ── Test 1: NETWORK_RETRY_DELAYS schedule ────────────────────────────────────
console.log('\n\x1b[1mTest 1: NETWORK_RETRY_DELAYS schedule (2s → 6s → 12s → 25s → 40s → 60s)\x1b[0m');
assert('Has 6 entries',          NETWORK_RETRY_DELAYS.length === 6,   `got ${NETWORK_RETRY_DELAYS.length}`);
assert('Attempt 1 →  2 s',       NETWORK_RETRY_DELAYS[0] === 2_000,   `got ${NETWORK_RETRY_DELAYS[0]}`);
assert('Attempt 2 →  6 s',       NETWORK_RETRY_DELAYS[1] === 6_000,   `got ${NETWORK_RETRY_DELAYS[1]}`);
assert('Attempt 3 → 12 s',       NETWORK_RETRY_DELAYS[2] === 12_000,  `got ${NETWORK_RETRY_DELAYS[2]}`);
assert('Attempt 4 → 25 s',       NETWORK_RETRY_DELAYS[3] === 25_000,  `got ${NETWORK_RETRY_DELAYS[3]}`);
assert('Attempt 5 → 40 s',       NETWORK_RETRY_DELAYS[4] === 40_000,  `got ${NETWORK_RETRY_DELAYS[4]}`);
assert('Attempt 6 → 60 s',       NETWORK_RETRY_DELAYS[5] === 60_000,  `got ${NETWORK_RETRY_DELAYS[5]}`);

// ── Test 2: GENERIC_RETRY_DELAYS schedule ────────────────────────────────────
console.log('\n\x1b[1mTest 2: GENERIC_RETRY_DELAYS schedule (5s → 12s → 25s → 40s → 60s → 90s)\x1b[0m');
assert('Has 6 entries',          GENERIC_RETRY_DELAYS.length === 6,   `got ${GENERIC_RETRY_DELAYS.length}`);
assert('Attempt 1 →  5 s',       GENERIC_RETRY_DELAYS[0] === 5_000,   `got ${GENERIC_RETRY_DELAYS[0]}`);
assert('Attempt 2 → 12 s',       GENERIC_RETRY_DELAYS[1] === 12_000,  `got ${GENERIC_RETRY_DELAYS[1]}`);
assert('Attempt 3 → 25 s',       GENERIC_RETRY_DELAYS[2] === 25_000,  `got ${GENERIC_RETRY_DELAYS[2]}`);
assert('Attempt 4 → 40 s',       GENERIC_RETRY_DELAYS[3] === 40_000,  `got ${GENERIC_RETRY_DELAYS[3]}`);
assert('Attempt 5 → 60 s',       GENERIC_RETRY_DELAYS[4] === 60_000,  `got ${GENERIC_RETRY_DELAYS[4]}`);
assert('Attempt 6 → 90 s',       GENERIC_RETRY_DELAYS[5] === 90_000,  `got ${GENERIC_RETRY_DELAYS[5]}`);
assert('Network attempt 1 faster than generic', NETWORK_RETRY_DELAYS[0] < GENERIC_RETRY_DELAYS[0]);

// ── Test 3: Concurrency + circuit breaker + warmup constants ─────────────────
console.log('\n\x1b[1mTest 3: Concurrency, circuit breaker, and warmup defaults\x1b[0m');
assert('Default MAX_CONCURRENT = 4',       MAX_CONCURRENT_AGENTS === 4,          `got ${MAX_CONCURRENT_AGENTS}`);
assert('Concurrent reasonable range',      MAX_CONCURRENT_AGENTS >= 1 && MAX_CONCURRENT_AGENTS <= 32);
assert('CIRCUIT_BREAKER_THRESHOLD = 1',    CIRCUIT_BREAKER_THRESHOLD === 1,      `got ${CIRCUIT_BREAKER_THRESHOLD}`);
assert('Circuit threshold reasonable',     CIRCUIT_BREAKER_THRESHOLD >= 0 && CIRCUIT_BREAKER_THRESHOLD <= 20);
assert('AGENT_WARMUP_DELAY_MS = 1500',     AGENT_WARMUP_DELAY_MS === 1_500,      `got ${AGENT_WARMUP_DELAY_MS}`);
assert('Warmup delay reasonable (0–10 s)', AGENT_WARMUP_DELAY_MS >= 0 && AGENT_WARMUP_DELAY_MS <= 10_000);

// ── Test 4: isNetworkError classification ────────────────────────────────────
console.log('\n\x1b[1mTest 4: isNetworkError() classification\x1b[0m');
const shouldBeNet = [
  'read ECONNRESET',
  'write ECONNRESET',
  'connect ECONNREFUSED 127.0.0.1:3000',
  'connect ETIMEDOUT',
  'getaddrinfo ENOTFOUND api.cursor.sh',
  '[aborted] read ECONNRESET',           // exact string from the bug report
  'ConnectError: connection refused',
  'socket hang up',
  'network error occurred',
  'request aborted',
  'connection reset by peer',
  'UND_ERR_SOCKET: other side closed',
  'UND_ERR_CONNECT_TIMEOUT',
  'write EPIPE',
  'fetch failed',
];

const shouldNotBeNet = [
  'Agent "executor" timed out after 25 min.',
  'CURSOR_API_KEY is not set',
  'Agent "executor" error: no detail',
  'Failed to parse PM JSON block',
  'SyntaxError: Unexpected token',
];

for (const msg of shouldBeNet) {
  assert(`Network: "${msg.slice(0, 55)}"`, isNetworkError(new Error(msg)));
}
for (const msg of shouldNotBeNet) {
  assert(`Not network: "${msg.slice(0, 55)}"`, !isNetworkError(new Error(msg)));
}

// ── Test 5: Retry delay selection ────────────────────────────────────────────
console.log('\n\x1b[1mTest 5: Retry delay selection\x1b[0m');
assert('Network attempt 1 →  2 s',  retryDelay(1, true)  === 2_000,  `got ${retryDelay(1, true)}`);
assert('Network attempt 2 →  6 s',  retryDelay(2, true)  === 6_000,  `got ${retryDelay(2, true)}`);
assert('Network attempt 3 → 12 s',  retryDelay(3, true)  === 12_000, `got ${retryDelay(3, true)}`);
assert('Network attempt 4 → 25 s',  retryDelay(4, true)  === 25_000, `got ${retryDelay(4, true)}`);
assert('Network attempt 5 → 40 s',  retryDelay(5, true)  === 40_000, `got ${retryDelay(5, true)}`);
assert('Network attempt 6 → 60 s',  retryDelay(6, true)  === 60_000, `got ${retryDelay(6, true)}`);
assert('Network attempt 7 → 60 s (clamp)', retryDelay(7, true) === 60_000, `got ${retryDelay(7, true)}`);
assert('Generic attempt 1 →  5 s',  retryDelay(1, false) === 5_000,  `got ${retryDelay(1, false)}`);
assert('Generic attempt 2 → 12 s',  retryDelay(2, false) === 12_000, `got ${retryDelay(2, false)}`);
assert('Generic attempt 5 → 60 s',  retryDelay(5, false) === 60_000, `got ${retryDelay(5, false)}`);
assert('Generic attempt 6 → 90 s',  retryDelay(6, false) === 90_000, `got ${retryDelay(6, false)}`);
assert('Generic attempt 7 → 90 s (clamp)', retryDelay(7, false) === 90_000, `got ${retryDelay(7, false)}`);

// ── Test 6: Total attempt count ──────────────────────────────────────────────
console.log('\n\x1b[1mTest 6: Total attempt count\x1b[0m');
assert('AGENT_MAX_RETRIES default = 5',          AGENT_MAX_RETRIES === 5,  `got ${AGENT_MAX_RETRIES}`);
assert('maxAttempts = AGENT_MAX_RETRIES + 1 = 6', AGENT_MAX_RETRIES + 1 === 6);

// ── Test 7: Synthetic BLOCKER content ────────────────────────────────────────
console.log('\n\x1b[1mTest 7: Synthetic BLOCKER message content\x1b[0m');

function syntheticBlocker(agentName, lastErr, maxAttempts) {
  const netError = isNetworkError(lastErr);
  const errSummary = lastErr.message.slice(0, 120);
  const lines = [
    '## 🚨 BLOCKER',
    `**Description:** Agent "${agentName}" failed to respond after ${maxAttempts} attempts.`,
    netError
      ? `Connection error: ${errSummary}\nThis appears to be a transient Cursor API issue. Partial progress from completed tasks has been saved to the project blackboard.`
      : `Last error: ${errSummary}`,
    netError
      ? 'Use `roland resume` (CLI) or `/resume` (chat) to continue once connectivity is restored. The PM will re-scope or retry this task.'
      : '',
    '**Needs from:** lead-pm',
    '**Impact:** This task produced no output and must be retried or re-scoped by the PM.',
  ].filter(Boolean);
  return lines.join('\n');
}

const netBlocker = syntheticBlocker('executor', new Error('read ECONNRESET'), 6);
const genericBlocker = syntheticBlocker('executor', new Error('Agent timed out'), 6);

assert('Network BLOCKER: ## 🚨 BLOCKER header',        netBlocker.includes('## 🚨 BLOCKER'));
assert('Network BLOCKER: "Connection error"',           netBlocker.includes('Connection error'));
assert('Network BLOCKER: "transient Cursor API issue"', netBlocker.includes('transient Cursor API issue'));
assert('Network BLOCKER: "project blackboard"',         netBlocker.includes('project blackboard'));
assert('Network BLOCKER: resume hint',                  netBlocker.includes('roland resume'));
assert('Network BLOCKER: /resume hint',                 netBlocker.includes('/resume'));
assert('Network BLOCKER: 6 attempts',                   netBlocker.includes('6 attempts'));
assert('Generic BLOCKER: "Last error"',                 genericBlocker.includes('Last error'));
assert('Generic BLOCKER: no resume hint',               !genericBlocker.includes('roland resume'));
assert('Generic BLOCKER: no "Connection error"',        !genericBlocker.includes('Connection error'));

// ── Test 8: runConcurrent throttle ───────────────────────────────────────────
console.log('\n\x1b[1mTest 8: runConcurrent — max N concurrent tasks\x1b[0m');

// Inline implementation mirrors team-orchestrator.ts
async function runConcurrent(factories, limit) {
  const results = new Array(factories.length);
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < factories.length) {
      const idx = nextIdx++;
      results[idx] = await factories[idx]();
    }
  }
  const slots = Math.min(limit, factories.length);
  await Promise.all(Array.from({ length: slots }, () => worker()));
  return results;
}

// Verify result order is preserved
{
  const results = await runConcurrent(
    [1, 2, 3, 4, 5].map((n) => () => Promise.resolve(n * 10)),
    3,
  );
  assert('Result order preserved (limit 3, 5 tasks)', JSON.stringify(results) === '[10,20,30,40,50]', JSON.stringify(results));
}

// Verify concurrency is capped
{
  let peakConcurrent = 0;
  let current = 0;
  const LIMIT = 3;
  const TASKS = 10;

  const factories = Array.from({ length: TASKS }, (_, i) => async () => {
    current++;
    peakConcurrent = Math.max(peakConcurrent, current);
    await new Promise((r) => setTimeout(r, 5)); // tiny async yield
    current--;
    return i;
  });

  const results = await runConcurrent(factories, LIMIT);
  assert(`Peak concurrency ≤ ${LIMIT} (was ${peakConcurrent})`, peakConcurrent <= LIMIT, `peakConcurrent=${peakConcurrent}`);
  assert(`All ${TASKS} tasks completed`,  results.length === TASKS, `got ${results.length}`);
  assert('Results are sequential [0..9]', results.every((v, i) => v === i), JSON.stringify(results));
}

// Edge: fewer tasks than limit
{
  const results = await runConcurrent(
    [7, 8].map((n) => () => Promise.resolve(n)),
    10,
  );
  assert('Fewer tasks than limit still works', JSON.stringify(results) === '[7,8]', JSON.stringify(results));
}

// Edge: limit = 1 (sequential) — now the default
{
  const order = [];
  await runConcurrent(
    [1, 2, 3].map((n) => async () => { order.push(n); }),
    1,
  );
  assert('limit=1 runs sequentially (default)', JSON.stringify(order) === '[1,2,3]', JSON.stringify(order));
}

// ── Test 9: withJitter helper ─────────────────────────────────────────────────
console.log('\n\x1b[1mTest 9: withJitter() — ±30% bounds and de-synchronisation\x1b[0m');

// Inline implementation mirrors withJitter() in team-orchestrator.ts
function withJitter(delayMs, factor = 0.3) {
  const delta = Math.round(delayMs * factor * (Math.random() * 2 - 1));
  return Math.max(100, delayMs + delta);
}

{
  const BASE = 10_000;
  const samples = Array.from({ length: 200 }, () => withJitter(BASE));
  const sMin = Math.min(...samples);
  const sMax = Math.max(...samples);
  const lower = BASE * 0.7;   // 7 000
  const upper = BASE * 1.3;   // 13 000

  assert(`All 200 samples ≥ BASE*(1-0.3)=${lower}`,  sMin >= lower - 1, `min=${sMin}`);
  assert(`All 200 samples ≤ BASE*(1+0.3)=${upper}`,  sMax <= upper + 1, `max=${sMax}`);
  assert('Jitter produces variation (≥2 distinct values in 200 samples)',
    new Set(samples).size > 1, `distinct=${new Set(samples).size}`);
  const v2000 = withJitter(2_000);
  assert('withJitter(2000) in [1400, 2600]', v2000 >= 1400 && v2000 <= 2600, `got ${v2000}`);
  assert('withJitter floor: tiny base ≥ 100ms', withJitter(50) >= 100, `got ${withJitter(50)}`);
  assert('withJitter(0) → exactly 100ms (floor)', withJitter(0) === 100, `got ${withJitter(0)}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
const total = passed + failed;
if (failed === 0) {
  console.log(`\x1b[32m✓\x1b[0m \x1b[1m${passed}/${total} passed\x1b[0m`);
  process.exit(0);
} else {
  console.error(`\x1b[31m✗\x1b[0m \x1b[1m${failed}/${total} failed\x1b[0m`);
  process.exit(1);
}
