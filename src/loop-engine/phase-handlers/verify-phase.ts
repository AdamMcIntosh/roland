import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import { loadLoopEngineConfig } from '../loop-config.js';
import {
  TestExecutor,
  resolveStrategies,
  verificationResultToLoopState,
  type CommandRunner,
} from '../verification/index.js';

export interface VerifyPhaseHandlerOptions {
  cwd?: string;
  /** Inject for unit tests — bypasses real npm test */
  runner?: CommandRunner;
}

export class VerifyPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Verify;
  private readonly opts: VerifyPhaseHandlerOptions;

  constructor(opts: VerifyPhaseHandlerOptions = {}) {
    this.opts = opts;
  }

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const cfg = loadLoopEngineConfig();
    const templateFilter = ctx.phaseConfig?.verification;

    const strategies = resolveStrategies(cfg.verification?.strategies, templateFilter);

    let verification;
    try {
      const executor = new TestExecutor({
        cwd: this.opts.cwd ?? process.cwd(),
        strategies,
        hadWaveBlockers: ctx.hadBlockers,
        runner: this.opts.runner,
      });
      verification = await executor.runAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Loop][verify] Verification runner error — non-fatal gate failure', { error: message });
      verification = {
        pass: false,
        summary: `Verification error — ${message}`,
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        strategies: [],
        hadWaveBlockers: ctx.hadBlockers,
      };
    }

    const loopSnapshot = verificationResultToLoopState(verification);
    const detailLines = verification.strategies
      .map((s) => {
        const status = s.skipped ? 'skipped' : s.pass ? 'pass' : 'fail';
        return `${s.type}: ${status} (${s.durationMs}ms)`;
      })
      .join('; ');

    ctx.blackboard.post({
      type: 'result',
      title: `Loop: Verify phase (iteration ${ctx.iteration})`,
      content: `${verification.summary}\n${detailLines}`,
      status: verification.pass ? 'done' : 'blocked',
      author: 'loop-engine',
      priority: verification.pass ? 'medium' : 'high',
      tags: ['loop', 'verify', 'verification'],
      relatedIds: [],
    });

    ctx.blackboard.post({
      type: 'decision',
      title: 'Loop: Verification results',
      content: JSON.stringify(loopSnapshot, null, 2),
      status: 'done',
      author: 'loop-engine',
      priority: 'low',
      tags: ['loop', 'verify', 'verification-detail'],
      relatedIds: [],
    });

    ctx.commandBoard?.appendBullet('Open Intel', `[VERIFY] ${verification.summary}`);

    // Retry decisions are owned by Critique phase; Verify only records gate results.
    return {
      success: verification.pass,
      summary: verification.summary,
      verification: loopSnapshot,
    };
  }
}
