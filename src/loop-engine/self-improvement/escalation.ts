/**
 * Escalation rules — when critique should route to human HITL instead of retrying.
 */

import type { RetryDecision } from './types.js';

export interface EscalationContext {
  retryCount: number;
  maxRetries: number;
  consecutiveVerifyFailures: number;
  hadBlockers: boolean;
}

export const DEFAULT_MAX_RETRIES = 3;

/**
 * Returns true when the loop should escalate to human operator (HITL).
 * Threshold: retryCount >= maxRetries after failed verification/critique cycles.
 */
export function shouldEscalateToHuman(ctx: EscalationContext): boolean {
  if (ctx.maxRetries <= 0) return false;
  // After maxRetries exhausted, stop autonomous retry and escalate.
  if (ctx.retryCount >= ctx.maxRetries) return true;
  // Repeated verify failures across iterations without recovery.
  if (ctx.consecutiveVerifyFailures >= ctx.maxRetries && ctx.retryCount > 0) return true;
  return false;
}

/** Map escalation state to retry decision. */
export function escalationRetryDecision(ctx: EscalationContext): RetryDecision {
  return shouldEscalateToHuman(ctx) ? 'escalate' : 'retry';
}
