/**
 * Retry-resilience smoke test.
 *
 * Verifies that:
 *  1. isNetworkError() correctly classifies ECONNRESET / ConnectError / aborted
 *     as network errors, and generic errors as non-network.
 *  2. NETWORK_RETRY_DELAYS has 3 entries with the expected 2s → 8s → 15s schedule.
 *  3. NETWORK_ERROR_PATTERNS covers all required substrings.
 *  4. The callCursorAgent retry logic (simulated) uses the faster schedule for
 *     network errors and the doubling schedule for generic errors.
 *
 * Runs entirely in-memory — no SDK calls, no file I/O.
 */

import {
  NETWORK_RETRY_DELAYS,
  NETWORK_ERROR_PATTERNS,
  RETRY_BASE_DELAY,
  AGENT_MAX_RETRIES,
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

// ── Test 1: NETWORK_RETRY_DELAYS schedule ────────────────────────────────────
console.log('\n\x1b[1mTest 1: NETWORK_RETRY_DELAYS schedule\x1b[0m');
assert('Has 3 entries',               NETWORK_RETRY_DELAYS.length === 3,           `got ${NETWORK_RETRY_DELAYS.length}`);
assert('Attempt 1 delay = 2 s',       NETWORK_RETRY_DELAYS[0] === 2_000,           `got ${NETWORK_RETRY_DELAYS[0]}`);
assert('Attempt 2 delay = 8 s',       NETWORK_RETRY_DELAYS[1] === 8_000,           `got ${NETWORK_RETRY_DELAYS[1]}`);
assert('Attempt 3 delay = 15 s',      NETWORK_RETRY_DELAYS[2] === 15_000,          `got ${NETWORK_RETRY_DELAYS[2]}`);
assert('Faster than RETRY_BASE_DELAY (5 s)', NETWORK_RETRY_DELAYS[0] < RETRY_BASE_DELAY, `${NETWORK_RETRY_DELAYS[0]} vs ${RETRY_BASE_DELAY}`);

// ── Test 2: isNetworkError classification ────────────────────────────────────
console.log('\n\x1b[1mTest 2: isNetworkError() classification\x1b[0m');
const shouldBeNet = [
  'read ECONNRESET',
  'write ECONNRESET',
  'connect ECONNREFUSED 127.0.0.1:3000',
  'connect ETIMEDOUT',
  'getaddrinfo ENOTFOUND api.cursor.sh',
  '[aborted] read ECONNRESET',         // exact string from the bug report
  'ConnectError: connection refused',
  'socket hang up',
  'network error occurred',
  'request aborted',
];

const shouldNotBeNet = [
  'Agent "executor" timed out after 25 min.',
  'CURSOR_API_KEY is not set',
  'Agent "executor" error: no detail',
  'Failed to parse PM JSON block',
  'SyntaxError: Unexpected token',
];

for (const msg of shouldBeNet) {
  assert(`Classifies as network: "${msg.slice(0, 60)}"`, isNetworkError(new Error(msg)), `returned false`);
}

for (const msg of shouldNotBeNet) {
  assert(`Not network error: "${msg.slice(0, 60)}"`, !isNetworkError(new Error(msg)), `returned true`);
}

// ── Test 3: Retry delay selection ────────────────────────────────────────────
console.log('\n\x1b[1mTest 3: Retry delay selection (network vs generic)\x1b[0m');

function retryDelay(attempt, netError) {
  return netError
    ? (NETWORK_RETRY_DELAYS[attempt - 1] ?? NETWORK_RETRY_DELAYS[NETWORK_RETRY_DELAYS.length - 1])
    : RETRY_BASE_DELAY * attempt;
}

assert('Network attempt 1 → 2 s',    retryDelay(1, true)  === 2_000,  `got ${retryDelay(1, true)}`);
assert('Network attempt 2 → 8 s',    retryDelay(2, true)  === 8_000,  `got ${retryDelay(2, true)}`);
assert('Network attempt 3 → 15 s',   retryDelay(3, true)  === 15_000, `got ${retryDelay(3, true)}`);
assert('Network attempt 4 → 15 s (clamp)', retryDelay(4, true) === 15_000, `got ${retryDelay(4, true)}`);
assert('Generic attempt 1 → 5 s',    retryDelay(1, false) === 5_000,  `got ${retryDelay(1, false)}`);
assert('Generic attempt 2 → 10 s',   retryDelay(2, false) === 10_000, `got ${retryDelay(2, false)}`);

// ── Test 4: AGENT_MAX_RETRIES = 2 → 3 total attempts ────────────────────────
console.log('\n\x1b[1mTest 4: Total attempt count\x1b[0m');
assert('AGENT_MAX_RETRIES default = 2',          AGENT_MAX_RETRIES === 2,  `got ${AGENT_MAX_RETRIES}`);
assert('maxAttempts = AGENT_MAX_RETRIES + 1 = 3', AGENT_MAX_RETRIES + 1 === 3);

// ── Test 5: Synthetic BLOCKER content for network errors ─────────────────────
console.log('\n\x1b[1mTest 5: Synthetic BLOCKER message format\x1b[0m');

// Mirror the BLOCKER construction from team-orchestrator.ts
function syntheticBlocker(agentName, lastErr, maxAttempts) {
  const netError = isNetworkError(lastErr);
  const errSummary = lastErr.message.slice(0, 120);
  const lines = [
    '## 🚨 BLOCKER',
    `**Description:** Agent "${agentName}" failed to respond after ${maxAttempts} attempts.`,
    netError
      ? `Connection error: ${errSummary}\nThis appears to be a transient Cursor API issue. Partial progress has been saved to the project state.`
      : `Last error: ${errSummary}`,
    netError
      ? 'Use `roland resume` (CLI) or `/resume` (chat) to continue once connectivity is restored.'
      : '',
    '**Needs from:** lead-pm',
    '**Impact:** This task produced no output and must be retried or re-scoped by the PM.',
  ].filter(Boolean);
  return lines.join('\n');
}

const netBlocker = syntheticBlocker('executor', new Error('read ECONNRESET'), 3);
const genericBlocker = syntheticBlocker('executor', new Error('Agent timed out'), 3);

assert('Network BLOCKER contains "Connection error"',        netBlocker.includes('Connection error'));
assert('Network BLOCKER contains "transient Cursor API"',    netBlocker.includes('transient Cursor API issue'));
assert('Network BLOCKER contains resume hint',               netBlocker.includes('roland resume'));
assert('Network BLOCKER contains ## 🚨 BLOCKER header',     netBlocker.includes('## 🚨 BLOCKER'));
assert('Generic BLOCKER contains "Last error"',              genericBlocker.includes('Last error'));
assert('Generic BLOCKER does NOT contain resume hint',       !genericBlocker.includes('roland resume'));
assert('Generic BLOCKER does NOT contain "Connection error"',!genericBlocker.includes('Connection error'));

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
