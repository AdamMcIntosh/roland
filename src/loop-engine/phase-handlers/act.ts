import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';

export class ActPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Act;

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
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
