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
 * Default: 4 → 5 total attempts (1 initial + 4 retries).
 *
 * Override: ROLAND_AGENT_RETRIES=0  (disable retries, 1 attempt only)
 *           ROLAND_AGENT_RETRIES=2  (3 total, original behaviour)
 */
export const AGENT_MAX_RETRIES = Number(process.env.ROLAND_AGENT_RETRIES) || 4;

/**
 * Base delay before the first retry (ms) for non-network errors.
 * Kept for backward compatibility; prefer GENERIC_RETRY_DELAYS for new code.
 */
export const RETRY_BASE_DELAY = 5_000;

/**
 * Retry delays (ms) for transient network / connection errors.
 * Sequence: 2 s → 5 s → 10 s → 20 s → 30 s.
 *
 * Network errors (ECONNRESET, ConnectError, etc.) are usually transient and
 * resolve quickly; starting at 2 s catches most recoveries in the first retry.
 * Entries map 1-to-1 to retry attempts. The final entry is reused if
 * AGENT_MAX_RETRIES exceeds the array length.
 */
export const NETWORK_RETRY_DELAYS: readonly number[] = [2_000, 5_000, 10_000, 20_000, 30_000];

/**
 * Retry delays (ms) for generic (non-network) SDK errors.
 * Sequence: 5 s → 10 s → 20 s → 30 s → 45 s.
 *
 * Slower than NETWORK_RETRY_DELAYS because non-network errors (SDK internal
 * errors, model errors) are less likely to resolve immediately and benefit
 * from giving the service more recovery time.
 */
export const GENERIC_RETRY_DELAYS: readonly number[] = [5_000, 10_000, 20_000, 30_000, 45_000];

/**
 * Maximum number of agent calls allowed to run concurrently across all waves.
 *
 * Conservative default of 4 prevents thundering-herd ECONNRESET spikes.
 * Lowering further helps on unstable connections; raising helps on fast,
 * reliable connections with many tasks in a wave.
 *
 * Override: ROLAND_MAX_CONCURRENT=2   (very conservative, unreliable network)
 *           ROLAND_MAX_CONCURRENT=8   (higher throughput, stable connections)
 */
export const MAX_CONCURRENT_AGENTS = Number(process.env.ROLAND_MAX_CONCURRENT) || 4;

/**
 * Number of terminal network errors in a single wave before the circuit
 * breaker opens, pausing the run and prompting the user to restore connectivity.
 *
 * When the breaker is open, tasks still queued in the wave are fast-failed
 * with a synthetic BLOCKER rather than cycling through all 5 retry attempts —
 * this cuts hang time when the Cursor API is genuinely down.
 *
 * Override: ROLAND_CIRCUIT_BREAKER=1  (pause on first network error)
 *           ROLAND_CIRCUIT_BREAKER=5  (tolerate more before pausing)
 */
export const CIRCUIT_BREAKER_THRESHOLD = Number(process.env.ROLAND_CIRCUIT_BREAKER) || 3;

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
