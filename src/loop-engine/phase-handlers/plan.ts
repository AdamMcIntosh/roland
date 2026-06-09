/**
 * ## Assumptions
 * - Plan phase seeds the iteration task graph on the blackboard.
 * - When a spec/checklist is configured, Plan must reference and update it.
 * - Prior iteration reflections are injected to inform planning strategy.
 */

import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import { formatSpecProgressSummary } from '../spec-progress.js';

export class PlanPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Plan;

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const lines: string[] = [
      `Planning loop iteration ${ctx.iteration} for goal: ${ctx.goal.slice(0, 200)}`,
    ];

    if (ctx.latestReflection) {
      lines.push('');
      lines.push('## Prior iteration reflection');
      lines.push(ctx.latestReflection.content);
    } else if (ctx.reflectionContext?.trim()) {
      lines.push('');
      lines.push('## Reflection history');
      lines.push(ctx.reflectionContext.slice(-3000));
    }

    if (ctx.specContent || ctx.specProgress) {
      lines.push('');
      lines.push('## Spec / Checklist (Spec-First)');
      if (ctx.specProgress) {
        lines.push(formatSpecProgressSummary(ctx.specProgress));
        lines.push(
          'Planner must reference this checklist, mark completed items `- [x]`, and leave incomplete items `- [ ]`.',
        );
      }
      if (ctx.specContent?.trim()) {
        lines.push('');
        lines.push('```markdown');
        lines.push(ctx.specContent.slice(0, 6000));
        lines.push('```');
      }
    }

    const content = lines.join('\n');

    ctx.blackboard.post({
      type: 'decision',
      title: 'Loop: Plan phase',
      content,
      status: 'done',
      author: 'loop-engine',
      priority: 'medium',
      tags: ['loop', 'plan', ...(ctx.specProgress ? ['spec-first'] : [])],
      relatedIds: [],
    });

    const planNote = ctx.specProgress
      ? `Spec-First plan (${ctx.specProgress.percentComplete}% complete)`
      : 'task graph seeded by Lead PM';

    ctx.commandBoard?.appendBullet(
      'Key Decisions',
      `Loop plan (iteration ${ctx.iteration}): ${planNote}`,
    );

    return {
      success: true,
      summary: ctx.specProgress
        ? `Planning complete — spec ${ctx.specProgress.completed}/${ctx.specProgress.total} items done`
        : 'Planning complete — task graph ready',
    };
  }
}
