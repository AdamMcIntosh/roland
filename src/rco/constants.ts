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
 * Override: ROLAND_AGENT_RETRIES=0  (disable retries)
 */
export const AGENT_MAX_RETRIES = Number(process.env.ROLAND_AGENT_RETRIES) || 2;

/**
 * Base delay before the first retry (ms). Doubles on each subsequent attempt.
 * Retry 1 → 5 s, Retry 2 → 10 s.
 *
 * Only used for non-network errors. Transient connection errors use
 * NETWORK_RETRY_DELAYS instead, which starts faster.
 */
export const RETRY_BASE_DELAY = 5_000;

/**
 * Retry delays (ms) specifically for transient network / connection errors.
 * Sequence: 2 s → 8 s → 15 s.
 *
 * Network errors (ECONNRESET, ConnectError, etc.) almost always resolve
 * within seconds; a 5 s initial delay is unnecessarily slow. The three
 * entries map to attempts 1, 2, and 3 respectively. If AGENT_MAX_RETRIES
 * is raised above 2 the final entry is reused for all additional attempts.
 */
export const NETWORK_RETRY_DELAYS: readonly number[] = [2_000, 8_000, 15_000];

/**
 * Substrings that identify a transient network / connection error.
 * Matched case-insensitively against err.message.
 *
 * Covers Node.js socket errors, Buf Connect-protocol errors from the
 * @cursor/sdk, and common HTTP-client abort messages.
 */
export const NETWORK_ERROR_PATTERNS: readonly string[] = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ConnectError',
  'connect error',
  'socket hang up',
  'network error',
  'aborted',
  'read ECONNRESET',
  'write ECONNRESET',
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
