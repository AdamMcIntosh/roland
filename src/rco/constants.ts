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
 */
export const RETRY_BASE_DELAY = 5_000;

// ── Blackboard ────────────────────────────────────────────────────────────────

/**
 * Maximum characters stored per task result on the Blackboard.
 * Large outputs (full test reports, long diffs) are truncated to prevent the
 * snapshot injected into agent prompts from blowing the context window.
 * A "(truncated)" suffix is appended so downstream agents know the result
 * was cut.
 */
export const BLACKBOARD_RESULT_MAX_CHARS = 2_000;
