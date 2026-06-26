import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import { loadLoopEngineConfig } from '../loop-config.js';
import {
  EvaluationGate,
  evaluationResultToLoopState,
} from '../evaluation-gate.js';
import { resolveVerificationStrategies } from '../loop-template-resolution.js';
import type { CommandRunner } from '../verification/index.js';

export interface VerifyPhaseHandlerOptions {
  cwd?: string;
  /** Loop template for verification strategy resolution. */
  template?: import('../loop-phases.js').LoopTemplate;
  /** Inject for unit tests — bypasses real npm test */
  runner?: CommandRunner;
  customCriteria?: import('../evaluation-gate.js').CustomCriterion[];
  requireManualReview?: boolean;
  manualReviewApproved?: boolean;
  minConfidence?: number;
  exitConditions?: import('../loop-phases.js').ExitConditionConfig[];
}

export class VerifyPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Verify;
  protected readonly opts: VerifyPhaseHandlerOptions;

  constructor(opts: VerifyPhaseHandlerOptions = {}) {
    this.opts = opts;
  }

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const template =
      this.opts.template ??
      ({ name: 'inline', description: '', phases: ctx.phaseConfig ? [ctx.phaseConfig] : [] } as import('../loop-phases.js').LoopTemplate);
    const strategies = resolveVerificationStrategies(template, ctx.phaseConfig);

    const strategyStatuses: Array<{
      type: string;
      status: 'pending' | 'running' | 'pass' | 'fail' | 'skipped';
      weight?: number;
      confidence?: number;
    }> = strategies.map((s) => ({
      type: s.type,
      status: 'pending',
      weight: s.weight,
    }));

    ctx.reportLiveActivity?.({
      kind: 'verification',
      label: 'EvaluationGate',
      detail: `Running ${strategies.length} verification strateg${strategies.length === 1 ? 'y' : 'ies'}`,
      startedAt: Date.now(),
      verificationStrategies: strategyStatuses,
      progressSummary: strategies.map((s) => s.type).join(' → '),
    });

    const gate = new EvaluationGate({
      cwd: this.opts.cwd ?? process.cwd(),
      goal: ctx.goal,
      iteration: ctx.iteration,
      hadWaveBlockers: ctx.hadBlockers,
      strategies,
      runner: this.opts.runner,
      blackboard: ctx.blackboard,
      customCriteria: this.opts.customCriteria,
      requireManualReview: this.opts.requireManualReview,
      manualReviewApproved: this.opts.manualReviewApproved,
      minConfidence: this.opts.minConfidence,
      exitConditions: this.opts.exitConditions,
      onStrategyProgress: (type, status, meta) => {
        const idx = strategyStatuses.findIndex((s) => s.type === type);
        if (idx >= 0) {
          strategyStatuses[idx] = {
            ...strategyStatuses[idx]!,
            status,
            confidence: meta?.confidence,
            weight: meta?.weight ?? strategyStatuses[idx]!.weight,
          };
        }
        ctx.reportLiveActivity?.({
          kind: 'verification',
          label: 'EvaluationGate',
          detail: `${type}: ${status}`,
          startedAt: Date.now(),
          verificationStrategies: [...strategyStatuses],
          progressSummary: strategyStatuses
            .map((s) => `${s.type}(${s.status})`)
            .join(' · '),
        });
      },
    });

    let evaluation;
    try {
      evaluation = await gate.evaluate();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Loop][verify] Evaluation gate error — non-fatal gate failure', { error: message });
      evaluation = {
        pass: false,
        accepted: false,
        summary: `Verification error — ${message}`,
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        strategies: [],
        gates: [],
        confidence: 0,
        hadWaveBlockers: ctx.hadBlockers,
      };
    }

    const loopSnapshot = evaluationResultToLoopState(evaluation);
    const detailLines = evaluation.gates
      .map((g) => {
        const status = g.skipped ? 'skipped' : g.pass ? 'pass' : 'fail';
        return `${g.name}: ${status} (conf=${g.confidence})`;
      })
      .join('; ');

    ctx.blackboard.post({
      type: 'decision',
      title: 'Loop: Evaluation gate results',
      content: JSON.stringify(loopSnapshot, null, 2),
      status: 'done',
      author: 'loop-engine',
      priority: 'low',
      tags: ['loop', 'eval-gate', 'verification-detail'],
      relatedIds: [],
    });

    ctx.commandBoard?.appendBullet(
      'Open Intel',
      `[EVAL-GATE] ${evaluation.summary} (confidence=${evaluation.confidence}) — ${detailLines}`,
    );

    return {
      success: evaluation.accepted,
      summary: evaluation.summary,
      verification: loopSnapshot,
      evaluation,
    };
  }
}
