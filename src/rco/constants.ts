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
 * Default: 5 → 6 total attempts (1 initial + 5 retries).
 *
 * Override: ROLAND_AGENT_RETRIES=0  (disable retries, 1 attempt only)
 *           ROLAND_AGENT_RETRIES=2  (3 total, fast iteration)
 */
export const AGENT_MAX_RETRIES = Number(process.env.ROLAND_AGENT_RETRIES) || 5;

/**
 * Base delay before the first retry (ms) for non-network errors.
 * Kept for backward compatibility; prefer GENERIC_RETRY_DELAYS for new code.
 */
export const RETRY_BASE_DELAY = 5_000;

/**
 * Retry delays (ms) for transient network / connection errors.
 * Sequence: 2 s → 6 s → 12 s → 25 s → 40 s → 60 s  (6 entries, 6 total attempts).
 *
 * Network errors (ECONNRESET, ConnectError, etc.) are usually transient.
 * Starting at 2 s catches fast recoveries; the long tail (40 s, 60 s) absorbs
 * longer outages during heavy runs. Entries map 1-to-1 to retry attempts.
 * The final entry is reused if AGENT_MAX_RETRIES exceeds the array length.
 */
export const NETWORK_RETRY_DELAYS: readonly number[] = [2_000, 6_000, 12_000, 25_000, 40_000, 60_000];

/**
 * Retry delays (ms) for generic (non-network) SDK errors.
 * Sequence: 5 s → 12 s → 25 s → 40 s → 60 s → 90 s  (6 entries, 6 total attempts).
 *
 * Slower than NETWORK_RETRY_DELAYS because non-network errors (SDK internal
 * errors, model errors) are less likely to resolve immediately and benefit
 * from giving the service more recovery time.
 */
export const GENERIC_RETRY_DELAYS: readonly number[] = [5_000, 12_000, 25_000, 40_000, 60_000, 90_000];

/**
 * Maximum number of agent calls allowed to run concurrently across all waves.
 *
 * Default of 4 gives good parallel throughput on stable connections.
 * Drop to 1 (fully sequential) for maximum stability on unstable SSH
 * connections where ECONNRESET under load is a concern.
 *
 * Override: ROLAND_MAX_CONCURRENT=1   (sequential, one socket at a time)
 *           ROLAND_MAX_CONCURRENT=2   (conservative, light parallelism)
 *           ROLAND_MAX_CONCURRENT=8   (high throughput, stable connection)
 */
export const MAX_CONCURRENT_AGENTS = Number(process.env.ROLAND_MAX_CONCURRENT) || 4;

/**
 * Number of terminal network errors in a single wave before the circuit
 * breaker opens, immediately pausing the run.
 *
 * Default of 1 means the run pauses after the very first agent that exhausts
 * all retries with network errors. This is the safest default for unstable
 * SSH connections — better to pause early and resume than to burn through
 * all remaining tasks with connection failures.
 *
 * When the breaker is open, tasks still queued in the wave fast-fail
 * immediately rather than cycling through all 5 retry attempts.
 *
 * Override: ROLAND_CIRCUIT_BREAKER=3  (tolerate more errors before pausing)
 *           ROLAND_CIRCUIT_BREAKER=0  (disable circuit breaker entirely)
 */
export const CIRCUIT_BREAKER_THRESHOLD = Number(process.env.ROLAND_CIRCUIT_BREAKER ?? '1') || 1;

/**
 * Stagger delay (ms) between starting each concurrent worker slot.
 *
 * With MAX_CONCURRENT_AGENTS=2 and AGENT_WARMUP_DELAY_MS=1500, the two
 * worker slots start 1.5 s apart — staggering their TCP connection
 * establishment and reducing simultaneous socket pressure on the API.
 *
 * Set to 0 to disable staggering (all slots start simultaneously, old behaviour).
 *
 * Override: ROLAND_WARMUP_DELAY_MS=0     (disable stagger)
 *           ROLAND_WARMUP_DELAY_MS=3000  (3 s between slot starts)
 */
export const AGENT_WARMUP_DELAY_MS = Number(process.env.ROLAND_WARMUP_DELAY_MS ?? '1500') || 1_500;

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
export const NETWORK_ERROR_PATTERNS: readonly string[] = [
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
