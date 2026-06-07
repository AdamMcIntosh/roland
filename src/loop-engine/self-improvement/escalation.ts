/**
 * Escalation rules — when critique should route to human HITL instead of retrying.
 */

import type { RetryDecision } from './types.js';

export interface EscalationContext {
  retryCount: number;
  maxRetries: number;
  /** Consecutive verify failures before escalating (independent of retry budget). */
  escalationThreshold: number;
  consecutiveVerifyFailures: number;
  hadBlockers: boolean;
}

export const DEFAULT_MAX_RETRIES = 3;
/** Default consecutive verify-failure count before HITL (was tied to maxRetries=2–3; now 4). */
export const DEFAULT_ESCALATION_THRESHOLD = 4;

/**
 * Returns true when the loop should escalate to human operator (HITL).
 * Two paths: retry budget exhausted, or consecutive verify failures exceed threshold.
 */
export function shouldEscalateToHuman(ctx: EscalationContext): boolean {
  if (ctx.maxRetries <= 0) return false;

  const threshold = ctx.escalationThreshold > 0
    ? ctx.escalationThreshold
    : DEFAULT_ESCALATION_THRESHOLD;

  if (ctx.retryCount >= ctx.maxRetries) {
    console.error(
      `[Loop][escalation] retry budget exhausted retryCount=${ctx.retryCount} maxRetries=${ctx.maxRetries}`,
    );
    return true;
  }

  // Defer verify-failure escalation until the penultimate retry — let retry budget run first.
  if (
    ctx.consecutiveVerifyFailures >= threshold &&
    ctx.retryCount > 0 &&
    ctx.retryCount < ctx.maxRetries - 1
  ) {
    console.error(
      `[Loop][escalation] consecutive verify failures threshold met ` +
        `failures=${ctx.consecutiveVerifyFailures} threshold=${threshold} retryCount=${ctx.retryCount}`,
    );
    return true;
  }

  return false;
}

/** Map escalation state to retry decision. */
export function escalationRetryDecision(ctx: EscalationContext): RetryDecision {
  return shouldEscalateToHuman(ctx) ? 'escalate' : 'retry';
}
