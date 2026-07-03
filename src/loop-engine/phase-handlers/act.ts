/**
 * ## Assumptions
 * - Pure ClosedLoop is the default Act path (lightweight-plan-act.ts).
 * - [DEPRECATED] LoopPmBridge is only injected when legacy PM Team is explicitly opted in (`use_pm_team: true`).
 */

import type { LoopPmBridge } from '../pm-integration.js';
import type { LightweightPlanActContext } from '../lightweight-plan-act.js';
import { runLightweightAct } from '../lightweight-plan-act.js';
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';

export interface ActPhaseHandlerOptions {
  /** [DEPRECATED] Legacy PM Team — only set when use_pm_team opt-in is active. */
  pmBridge?: LoopPmBridge;
  lightweight?: LightweightPlanActContext;
}

export class ActPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Act;
  private readonly pmBridge?: LoopPmBridge;
  private readonly lightweight?: LightweightPlanActContext;

  constructor(opts: ActPhaseHandlerOptions = {}) {
    this.pmBridge = opts.pmBridge;
    this.lightweight = opts.lightweight;
  }

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    if (this.pmBridge) {
      return this.pmBridge.runAct(ctx.iteration, ctx.phaseConfig);
    }
    if (this.lightweight) {
      return runLightweightAct(ctx.iteration, this.lightweight, {
        waveNumber: ctx.waveNumber ?? 0,
        phaseConfig: ctx.phaseConfig,
        loopState: ctx.state,
      });
    }
    const wave = ctx.waveNumber ?? 0;
    ctx.commandBoard?.setAgentStatus({
      callsign: 'Roland',
      state: 'active',
      lastUpdated: Date.now(),
      note: wave > 0 ? `Loop act — wave ${wave}` : 'Loop act — executing',
    });
    ctx.blackboard.post({
      type: 'decision',
      title: wave > 0 ? `Loop: Act phase (wave ${wave})` : 'Loop: Act phase',
      content: `Executing agents for iteration ${ctx.iteration}`,
      status: 'in_progress',
      author: 'loop-engine',
      priority: 'medium',
      tags: ['loop', 'act'],
      relatedIds: [],
    });
    return {
      success: true,
      summary: wave > 0 ? `Act phase active — wave ${wave}` : 'Act phase active',
    };
  }
}
