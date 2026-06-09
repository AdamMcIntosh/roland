/**
 * ## Assumptions
 * - Escalate phase runs when critique/retry sets shouldEscalate or retry budget is exhausted.
 * - HITL queue is notified via blackboard decision entries (orchestrator drains these).
 * - Escalation is terminal for the current loop iteration unless operator resumes via checkpoint.
 */

import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import { shouldEscalateToHuman } from '../self-improvement/escalation.js';

function logEscalate(msg: string, detail?: Record<string, unknown>): void {
  const line = `[Loop][escalate] ${msg}`;
  if (detail && Object.keys(detail).length > 0) {
    console.error(line, detail);
  } else {
    console.error(line);
  }
}

export class EscalatePhaseHandler implements PhaseHandler {
  readonly phase = Phase.Escalate;

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const critique = ctx.state.lastCritique;
    const verification = ctx.state.lastVerification;
    const escalationThreshold = ctx.escalationThreshold ?? 4;

    const hitl = shouldEscalateToHuman({
      retryCount: ctx.state.retryCount,
      maxRetries: ctx.maxRetries ?? 3,
      escalationThreshold,
      consecutiveVerifyFailures: countConsecutiveVerifyFailures(ctx),
      hadBlockers: Boolean(ctx.hadBlockers),
    });

    const reasons: string[] = [];
    if (critique?.retryDecision === 'escalate') reasons.push('critique requested escalation');
    if (ctx.state.retryCount >= (ctx.maxRetries ?? 3)) reasons.push('retry budget exhausted');
    if (verification && !verification.pass) reasons.push(`verification failed: ${verification.summary}`);
    if (hitl) reasons.push('escalation policy triggered');

    const summary =
      reasons.length > 0
        ? `Escalated to operator — ${reasons.join('; ')}`
        : 'Escalated to operator — manual intervention required';

    logEscalate('human escalation', {
      iteration: ctx.iteration,
      retryCount: ctx.state.retryCount,
      reasons,
    });

    ctx.blackboard.post({
      type: 'decision',
      title: 'Loop: HITL escalation',
      content: [
        summary,
        '',
        `Goal: ${ctx.goal}`,
        `Iteration: ${ctx.iteration}`,
        `Retry count: ${ctx.state.retryCount}`,
        verification ? `Last verify: ${verification.summary}` : '',
        critique ? `Last critique: ${critique.summary}` : '',
        '',
        'Operator actions: `roland resume`, `roland unblock <task-id> "<guidance>"`, or `roland inject "<directive>"`',
      ]
        .filter(Boolean)
        .join('\n'),
      status: 'blocked',
      author: 'loop-engine',
      priority: 'critical',
      tags: ['loop', 'escalate', 'hitl'],
      relatedIds: [],
    });

    ctx.commandBoard?.appendBullet('Open Intel', `[ESCALATE] ${summary}`);

    return {
      success: reasons.length === 0,
      summary,
      shouldEscalate: reasons.length > 0 || hitl,
    };
  }
}

function countConsecutiveVerifyFailures(ctx: PhaseHandlerContext): number {
  let count = 0;
  for (let i = ctx.state.phaseHistory.length - 1; i >= 0; i--) {
    const t = ctx.state.phaseHistory[i];
    if (t.phase === 'verify') {
      if (t.success === false) count++;
      else break;
    }
  }
  return count;
}

/**
 * ## Component Complete
 * EscalatePhaseHandler surfaces structured HITL context when automated retry/critique cannot resolve the loop.
 */
