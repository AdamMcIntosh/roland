import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';

export class PlanPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Plan;

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    ctx.blackboard.post({
      type: 'decision',
      title: 'Loop: Plan phase',
      content: `Planning loop iteration ${ctx.iteration} for goal: ${ctx.goal.slice(0, 200)}`,
      status: 'done',
      author: 'loop-engine',
      priority: 'medium',
      tags: ['loop', 'plan'],
      relatedIds: [],
    });
    ctx.commandBoard?.appendBullet(
      'Key Decisions',
      `Loop plan (iteration ${ctx.iteration}): task graph seeded by Lead PM`,
    );
    return { success: true, summary: 'Planning complete — task graph ready' };
  }
}
