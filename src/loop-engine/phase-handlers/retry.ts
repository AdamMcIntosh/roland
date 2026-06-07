import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';

export class RetryPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Retry;

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const retryNum = ctx.state.retryCount + 1;
    const critiqueDecision = ctx.state.lastCritique?.retryDecision;
    const strategy =
      critiqueDecision === 'retry_focused'
        ? 'focused retry on failed checks'
        : 'full iteration retry';
    const summary = `Retry attempt ${retryNum} (${strategy}) scheduled for iteration ${ctx.iteration}`;

    ctx.blackboard.post({
      type: 'decision',
      title: `Loop: Retry phase (attempt ${retryNum})`,
      content: summary,
      status: 'pending',
      author: 'loop-engine',
      priority: 'high',
      tags: ['loop', 'retry'],
      relatedIds: [],
    });
    ctx.commandBoard?.appendBullet('Open Intel', `[RETRY] ${summary}`);

    return {
      success: true,
      summary,
      shouldRetry: false,
    };
  }
}
