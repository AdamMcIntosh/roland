import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';

export class VerifyPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Verify;

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    // Stub gate — future waves wire test-executor / linter as structured steps.
    const pass = !ctx.hadBlockers;
    const summary = pass
      ? 'Verification passed — no blockers in wave'
      : 'Verification failed — blockers detected in wave';

    ctx.blackboard.post({
      type: 'result',
      title: `Loop: Verify phase (iteration ${ctx.iteration})`,
      content: summary,
      status: pass ? 'done' : 'blocked',
      author: 'loop-engine',
      priority: pass ? 'medium' : 'high',
      tags: ['loop', 'verify'],
      relatedIds: [],
    });
    ctx.commandBoard?.appendBullet('Open Intel', `[VERIFY] ${summary}`);

    return {
      success: pass,
      summary,
      shouldRetry: !pass,
    };
  }
}
