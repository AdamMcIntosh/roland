/**
 * Retry strategies — simple full retry vs focused retry on specific failures.
 */

import type { CritiqueInput, RetryDecision } from './types.js';
import { escalationRetryDecision, shouldEscalateToHuman, type EscalationContext } from './escalation.js';

export interface RetryStrategyResult {
  decision: RetryDecision;
  reason: string;
  /** Strategy types to prioritize on focused retry (e.g. ['unit', 'lint']) */
  focusAreas?: string[];
}

/** Simple retry — re-run the full loop iteration when any gate fails. */
export function simpleRetryStrategy(input: CritiqueInput): RetryStrategyResult {
  const escalationCtx: EscalationContext = {
    retryCount: input.retryCount,
    maxRetries: input.maxRetries,
    consecutiveVerifyFailures: countConsecutiveVerifyFailures(input),
    hadBlockers: Boolean(input.hadBlockers),
  };

  if (shouldEscalateToHuman(escalationCtx)) {
    return {
      decision: 'escalate',
      reason: `Retry budget exhausted (${input.retryCount}/${input.maxRetries}) — escalating to operator`,
    };
  }

  if (input.verification?.pass && !input.hadBlockers) {
    return { decision: 'proceed', reason: 'Verification passed — no retry needed' };
  }

  return {
    decision: 'retry',
    reason: input.hadBlockers
      ? 'Wave blockers detected — schedule full retry'
      : 'Verification failed — schedule full retry',
  };
}

/**
 * Focused retry — target only failed verification strategies instead of full re-run.
 * Used when failures are localized (single strategy type).
 */
export function focusedRetryStrategy(input: CritiqueInput): RetryStrategyResult {
  const escalationCtx: EscalationContext = {
    retryCount: input.retryCount,
    maxRetries: input.maxRetries,
    consecutiveVerifyFailures: countConsecutiveVerifyFailures(input),
    hadBlockers: Boolean(input.hadBlockers),
  };

  if (shouldEscalateToHuman(escalationCtx)) {
    return {
      decision: 'escalate',
      reason: escalationRetryDecision(escalationCtx) === 'escalate'
        ? `Max retries (${input.maxRetries}) reached — human HITL required`
        : 'Escalation threshold met',
    };
  }

  if (input.verification?.pass && !input.hadBlockers) {
    return { decision: 'proceed', reason: 'All checks passed' };
  }

  const failed = (input.verification?.strategies ?? []).filter((s) => !s.pass);
  if (failed.length === 1 && !input.hadBlockers) {
    return {
      decision: 'retry_focused',
      reason: `Single failure in ${failed[0]!.type} — focused retry recommended`,
      focusAreas: [failed[0]!.type],
    };
  }

  if (failed.length > 0 && failed.length <= 2 && !input.hadBlockers) {
    return {
      decision: 'retry_focused',
      reason: `Localized failures (${failed.map((s) => s.type).join(', ')}) — focused retry`,
      focusAreas: failed.map((s) => s.type),
    };
  }

  return simpleRetryStrategy(input);
}

/** Pick strategy based on failure shape — focused when localized, else simple. */
export function resolveRetryStrategy(input: CritiqueInput): RetryStrategyResult {
  const failed = (input.verification?.strategies ?? []).filter((s) => !s.pass);
  if (!input.hadBlockers && failed.length > 0 && failed.length <= 2) {
    return focusedRetryStrategy(input);
  }
  return simpleRetryStrategy(input);
}

function countConsecutiveVerifyFailures(input: CritiqueInput): number {
  let count = 0;
  for (let i = input.phaseHistory.length - 1; i >= 0; i--) {
    const entry = input.phaseHistory[i]!;
    if (entry.phase !== 'verify') continue;
    if (entry.success === false) count++;
    else break;
  }
  if (count === 0 && input.verification && !input.verification.pass) count = 1;
  return count;
}
