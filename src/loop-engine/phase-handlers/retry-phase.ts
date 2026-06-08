/**
 * Retry phase — schedules the next loop iteration with smart retry strategies.
 *
 * Strategies:
 *   - Full retry — re-run all phases on the next iteration
 *   - Focused retry — target failed verification strategies / test files only
 *   - Exponential backoff — optional delay before next iteration (config-driven)
 *   - Human escalation — surfaces HITL when critique already decided escalate
 */

import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import { loadLoopEngineConfig } from '../loop-config.js';
import { shouldEscalateToHuman } from '../self-improvement/escalation.js';
import type { LoopRetrySnapshot } from '../loop-state.js';

export interface RetryPhaseHandlerOptions {
  /** Override exponential backoff for tests */
  backoffEnabled?: boolean;
  /** Skip actual sleep in unit tests */
  skipDelay?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(retryCount: number, baseMs: number, maxMs: number): number {
  const raw = baseMs * Math.pow(2, Math.max(0, retryCount));
  const capped = Math.min(raw, maxMs);
  // ±20% jitter to avoid thundering herd on concurrent loops
  const jitter = capped * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

function extractFocusTargets(ctx: PhaseHandlerContext): {
  strategy: 'full' | 'focused';
  focusAreas: string[];
  failedFiles: string[];
} {
  const critiqueDecision = ctx.state.lastCritique?.retryDecision;
  const failedStrategies = (ctx.state.lastVerification?.strategies ?? []).filter((s) => !s.pass);

  if (critiqueDecision === 'retry_focused' || failedStrategies.length <= 2) {
    const focusAreas = failedStrategies.map((s) => s.type);
    const failedFiles = failedStrategies.flatMap((s) => s.failures ?? []);
    if (focusAreas.length > 0) {
      return { strategy: 'focused', focusAreas, failedFiles };
    }
  }

  return { strategy: 'full', focusAreas: [], failedFiles: [] };
}

export class RetryPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Retry;
  private readonly opts: RetryPhaseHandlerOptions;

  constructor(opts: RetryPhaseHandlerOptions = {}) {
    this.opts = opts;
  }

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const maxRetries = ctx.maxRetries ?? 3;
    const escalationThreshold = ctx.escalationThreshold ?? 4;
    const retryNum = ctx.state.retryCount + 1;
    const { strategy, focusAreas, failedFiles } = extractFocusTargets(ctx);

    const escalationCtx = {
      retryCount: ctx.state.retryCount,
      maxRetries,
      escalationThreshold,
      consecutiveVerifyFailures: countConsecutiveVerifyFailures(ctx),
      hadBlockers: Boolean(ctx.hadBlockers),
    };

    if (shouldEscalateToHuman(escalationCtx)) {
      const summary = `Retry budget exhausted (${ctx.state.retryCount}/${maxRetries}) — escalating to operator (HITL)`;
      console.error(
        `[Loop][retry] escalation retryCount=${ctx.state.retryCount} maxRetries=${maxRetries} iteration=${ctx.iteration}`,
      );
      ctx.blackboard.post({
        type: 'decision',
        title: 'Loop: Human escalation required',
        content: summary,
        status: 'blocked',
        author: 'loop-engine',
        priority: 'critical',
        tags: ['loop', 'retry', 'escalate', 'hitl'],
        relatedIds: [],
      });
      ctx.commandBoard?.appendBullet('Open Intel', `[RETRY][ESCALATE] ${summary}`);
      return { success: false, summary, shouldEscalate: true };
    }

    const cfg = loadLoopEngineConfig();
    const backoffEnabled =
      this.opts.backoffEnabled ?? cfg.retry?.exponentialBackoff?.enabled ?? false;
    const baseMs = cfg.retry?.exponentialBackoff?.baseMs ?? 2000;
    const maxMs = cfg.retry?.exponentialBackoff?.maxMs ?? 60_000;
    let backoffMs = 0;

    if (backoffEnabled && !this.opts.skipDelay) {
      backoffMs = computeBackoffMs(ctx.state.retryCount, baseMs, maxMs);
      console.error(
        `[Loop][retry] exponential backoff ${backoffMs}ms before iteration ${ctx.iteration + 1} ` +
          `(retryCount=${ctx.state.retryCount})`,
      );
      await sleep(backoffMs);
    }

    const strategyLabel =
      strategy === 'focused'
        ? `focused retry on ${focusAreas.join(', ')}`
        : 'full iteration retry';
    const fileHint =
      failedFiles.length > 0 ? ` · targets: ${failedFiles.slice(0, 3).join(', ')}` : '';
    const summary =
      `Retry attempt ${retryNum} (${strategyLabel}) scheduled for iteration ${ctx.iteration + 1}` +
      (backoffMs > 0 ? ` · backoff ${backoffMs}ms` : '') +
      fileHint;

    console.error(
      `[Loop][retry] strategy=${strategy} retryNum=${retryNum} iteration=${ctx.iteration} ` +
        `focusAreas=${focusAreas.join('|') || 'none'} backoffMs=${backoffMs}`,
    );

    const retrySnapshot: LoopRetrySnapshot = {
      attempt: retryNum,
      strategy,
      focusAreas,
      failedFiles: failedFiles.slice(0, 20),
      backoffMs,
      at: Date.now(),
      iteration: ctx.iteration,
    };

    ctx.blackboard.post({
      type: 'decision',
      title: `Loop: Retry phase (attempt ${retryNum})`,
      content: summary,
      status: 'pending',
      author: 'loop-engine',
      priority: 'high',
      tags: ['loop', 'retry', strategy === 'focused' ? 'retry-focused' : 'retry-full'],
      relatedIds: [],
    });

    ctx.blackboard.post({
      type: 'decision',
      title: 'Loop: Retry structured output',
      content: JSON.stringify(retrySnapshot, null, 2),
      status: 'done',
      author: 'loop-engine',
      priority: 'low',
      tags: ['loop', 'retry', 'retry-detail'],
      relatedIds: [],
    });

    ctx.commandBoard?.appendBullet('Open Intel', `[RETRY] ${summary}`);

    if (strategy === 'focused' && focusAreas.length > 0) {
      ctx.blackboard.post({
        type: 'decision',
        title: 'Loop: Focused retry scope',
        content: `Re-run verification for: ${focusAreas.join(', ')}`,
        status: 'pending',
        author: 'loop-engine',
        priority: 'high',
        tags: ['loop', 'retry', 'focused-scope'],
        relatedIds: [],
      });
    }

    return {
      success: true,
      summary,
      shouldRetry: false,
      retry: retrySnapshot,
    };
  }
}

function countConsecutiveVerifyFailures(ctx: PhaseHandlerContext): number {
  let count = 0;
  for (let i = ctx.state.phaseHistory.length - 1; i >= 0; i--) {
    const entry = ctx.state.phaseHistory[i]!;
    if (entry.phase !== Phase.Verify) continue;
    if (entry.success === false) count++;
    else break;
  }
  if (count === 0 && ctx.state.lastVerification && !ctx.state.lastVerification.pass) count = 1;
  return count;
}
