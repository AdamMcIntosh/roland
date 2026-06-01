/**
 * Shared constants for the RCO team orchestration system.
 *
 * Centralised here so timeout values, retry settings, and size caps are
 * visible in one place and consistent across all orchestrator paths.
 *
 * All env-var overrides are resolved at import time (module singleton).
 */
// ── Agent execution ───────────────────────────────────────────────────────────
/**
 * Per-agent wall-clock timeout (default 25 min).
 *
 * 25 min accommodates real test-executor runs (npm test against a live DB).
 * The legacy RCO orchestrator uses a separate 60 s worker timeout because it
 * forks child processes for lightweight recipe steps — a fundamentally different
 * workload. Do not conflate the two.
 *
 * Override: ROLAND_AGENT_TIMEOUT_MS=180000  (e.g. 3 min for fast iteration)
 */
export const AGENT_TIMEOUT_MS = Number(process.env.ROLAND_AGENT_TIMEOUT_MS) || 25 * 60 * 1000;
/**
 * Maximum retries on transient SDK errors before returning a synthetic BLOCKER.
 * Default: 6 → 7 total attempts (1 initial + 6 retries).
 *
 * Override: ROLAND_AGENT_RETRIES=0  (disable retries, 1 attempt only)
 *           ROLAND_AGENT_RETRIES=2  (3 total, fast iteration)
 */
export const AGENT_MAX_RETRIES = Number(process.env.ROLAND_AGENT_RETRIES) || 6;
/**
 * Base delay before the first retry (ms) for non-network errors.
 * Kept for backward compatibility; prefer GENERIC_RETRY_DELAYS for new code.
 */
export const RETRY_BASE_DELAY = 5_000;
/**
 * Retry delays (ms) for transient network / connection errors.
 * Sequence: 2 s → 6 s → 12 s → 25 s → 40 s → 60 s → 90 s  (7 entries, 7 total attempts).
 *
 * Network errors (ECONNRESET, ConnectError, etc.) are usually transient.
 * Starting at 2 s catches fast recoveries; the long tail (60 s, 90 s) absorbs
 * longer outages during heavy runs. Entries map 1-to-1 to retry attempts.
 * The final entry is reused if AGENT_MAX_RETRIES exceeds the array length.
 */
export const NETWORK_RETRY_DELAYS = [2_000, 6_000, 12_000, 25_000, 40_000, 60_000, 90_000];
/**
 * Retry delays (ms) for generic (non-network) SDK errors.
 * Sequence: 5 s → 12 s → 25 s → 40 s → 60 s → 90 s → 120 s  (7 entries, 7 total attempts).
 *
 * Slower than NETWORK_RETRY_DELAYS because non-network errors (SDK internal
 * errors, model errors) are less likely to resolve immediately and benefit
 * from giving the service more recovery time.
 */
export const GENERIC_RETRY_DELAYS = [5_000, 12_000, 25_000, 40_000, 60_000, 90_000, 120_000];
/**
 * Maximum number of agent calls allowed to run concurrently across all waves.
 *
 * Default of 4 gives good parallel throughput on stable connections.
 * Drop to 2 for lighter API pressure, or 1 for fully sequential safe mode.
 *
 * Override: ROLAND_MAX_CONCURRENT=1   (sequential, one socket at a time)
 *           ROLAND_MAX_CONCURRENT=2   (conservative, reduced ECONNRESET risk)
 *           ROLAND_MAX_CONCURRENT=8   (high throughput, very stable connection)
 */
export const MAX_CONCURRENT_AGENTS = Number(process.env.ROLAND_MAX_CONCURRENT) || 2;
/**
 * Number of network-error retry attempts (across all concurrent agents in a
 * wave) before the circuit breaker opens and pauses the run.
 *
 * Unlike the old "terminal errors only" model, each individual network-error
 * retry attempt counts toward this threshold — so widespread outages are
 * detected quickly even before any single agent exhausts all its retries.
 *
 * Default of 3: with 4 concurrent agents all hitting ECONNRESET on attempt 1
 * the circuit opens after just ~3 retry failures (within the first few seconds).
 * A single agent with isolated transient errors needs 3 consecutive network
 * failures before tripping — avoiding false positives from brief hiccups.
 *
 * When the breaker is open, tasks still queued in the wave fast-fail
 * immediately rather than cycling through all 7 retry attempts.
 *
 * Override: ROLAND_CIRCUIT_BREAKER=1  (trip on first network retry — maximum sensitivity)
 *           ROLAND_CIRCUIT_BREAKER=6  (tolerate more errors before pausing)
 *           ROLAND_CIRCUIT_BREAKER=0  (disable circuit breaker entirely)
 */
export const CIRCUIT_BREAKER_THRESHOLD = Number(process.env.ROLAND_CIRCUIT_BREAKER ?? '3') || 3;
/**
 * Stagger delay (ms) between starting each concurrent worker slot.
 *
 * With MAX_CONCURRENT_AGENTS=2 and AGENT_WARMUP_DELAY_MS=3000, the two
 * worker slots start 3 s apart — giving each connection time to fully
 * establish before the next one opens, reducing simultaneous socket
 * pressure on the Cursor API.
 *
 * Set to 0 to disable staggering (all slots start simultaneously, old behaviour).
 *
 * Override: ROLAND_WARMUP_DELAY_MS=0     (disable stagger)
 *           ROLAND_WARMUP_DELAY_MS=1500  (faster starts, less protection)
 */
export const AGENT_WARMUP_DELAY_MS = Number(process.env.ROLAND_WARMUP_DELAY_MS ?? '3000') || 3_000;
/**
 * Substrings that identify a transient network / connection error.
 * Matched case-insensitively against err.message.
 *
 * Covers:
 *  - Node.js socket errors (ECONNRESET, ECONNREFUSED, ETIMEDOUT, ENOTFOUND)
 *  - Buf Connect-protocol errors from the @cursor/sdk (ConnectError)
 *  - Undici / fetch abort and timeout messages
 *  - Proxy and load-balancer disconnect signals
 */
export const NETWORK_ERROR_PATTERNS = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EPIPE',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ConnectError',
    'connect error',
    'connection reset',
    'connection refused',
    'connection closed',
    'socket hang up',
    'network error',
    'fetch failed',
    'aborted',
    'read ECONNRESET',
    'write ECONNRESET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
];
// ── Blackboard ────────────────────────────────────────────────────────────────
/**
 * Maximum characters stored per task result on the Blackboard.
 * Large outputs (full test reports, long diffs) are truncated to prevent the
 * snapshot injected into agent prompts from blowing the context window.
 * A "(truncated)" suffix is appended so downstream agents know the result
 * was cut.
 */
export const BLACKBOARD_RESULT_MAX_CHARS = 2_000;
//# sourceMappingURL=constants.js.map