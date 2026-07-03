/**
 * ## Assumptions
 * - Pure ClosedLoop is the default Plan path (lightweight-plan-act.ts).
 * - [DEPRECATED] LoopPmBridge is only injected when legacy PM Team is explicitly opted in (`use_pm_team: true`).
 */

import type { LoopPmBridge } from '../pm-integration.js';
import type { LightweightPlanActContext } from '../lightweight-plan-act.js';
import { runLightweightPlan } from '../lightweight-plan-act.js';
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';

export interface PlanPhaseHandlerOptions {
  /** [DEPRECATED] Legacy PM Team — only set when use_pm_team opt-in is active. */
  pmBridge?: LoopPmBridge;
  lightweight?: LightweightPlanActContext;
}

export class PlanPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Plan;
  private readonly pmBridge?: LoopPmBridge;
  private readonly lightweight?: LightweightPlanActContext;

  constructor(opts: PlanPhaseHandlerOptions = {}) {
    this.pmBridge = opts.pmBridge;
    this.lightweight = opts.lightweight;
  }

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    if (this.pmBridge) {
      return this.pmBridge.runPlanning(ctx.iteration, ctx.phaseConfig);
    }
    if (this.lightweight) {
      return runLightweightPlan(ctx.iteration, this.lightweight, {
        phaseConfig: ctx.phaseConfig,
        loopState: ctx.state,
      });
    }
    // LoopEngine direct usage (tests) — inline stub without PM session
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
      `Loop plan (iteration ${ctx.iteration}): lightweight scope`,
    );
    return { success: true, summary: 'Planning complete — task graph ready' };
  }
}
