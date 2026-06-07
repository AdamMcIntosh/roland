import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';

export class CritiquePhaseHandler implements PhaseHandler {
  readonly phase = Phase.Critique;

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const findings = ctx.hadBlockers
      ? 'Critique: blockers require remediation before next iteration'
      : 'Critique: wave output acceptable — no critical findings';

    ctx.blackboard.post({
      type: 'decision',
      title: `Loop: Critique phase (iteration ${ctx.iteration})`,
      content: findings,
      status: 'done',
      author: 'loop-engine',
      priority: 'medium',
      tags: ['loop', 'critique'],
      relatedIds: [],
    });
    ctx.commandBoard?.appendBullet('Key Decisions', `[CRITIQUE] ${findings.slice(0, 200)}`);

    return {
      success: !ctx.hadBlockers,
      summary: findings,
      shouldRetry: Boolean(ctx.hadBlockers),
    };
  }
}
