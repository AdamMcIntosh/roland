/**
 * ## P1 Honesty & Consolidation
 *
 * ## Evaluation Gate & Blocker Fix
 *
 * Verify phase — runs EvaluationGate and surfaces structured results to loop state.
 */

import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import { resolveFlakyEscapeThreshold } from '../loop-config.js';
import {
  EvaluationGate,
  evaluationResultToLoopState,
} from '../evaluation-gate.js';
import { resolveVerificationStrategies } from '../loop-template-resolution.js';
import type { CommandRunner } from '../verification/index.js';
import {
  FLAKY_DIAGNOSIS,
  updateFlakyVerification,
} from '../flaky-verification.js';

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

    if (ctx.stateDir && !evaluation.accepted) {
      const { emitHermesHitlEvent } = await import('../../rco/hitl-hermes.js');
      const { isGreenfieldGoal } = await import('../../rco/goal-scope.js');
      const failedGates = evaluation.gates?.filter((g) => g.required && !g.skipped && !g.pass) ?? [];
      const softSkippedGates = evaluation.gates?.filter((g) => g.skipped) ?? [];
      const noTestSoftSkip = softSkippedGates.some(
        (g) => g.skipReason?.includes('no test') || g.skipReason?.includes('no npm test'),
      );
      const greenfieldToolingSkip =
        isGreenfieldGoal(ctx.goal) &&
        failedGates.length === 0 &&
        softSkippedGates.length > 0 &&
        softSkippedGates.every(
          (g) =>
            g.skipReason?.includes('minimal project') ||
            g.skipReason?.includes('greenfield') ||
            g.skipReason?.includes('no test'),
        );
      const skipHitl = noTestSoftSkip || greenfieldToolingSkip;
      const suggestedActions = noTestSoftSkip
        ? [
            'roland board-status --concise',
            'Add npm test script when ready: npm pkg set scripts.test="vitest run"',
          ]
        : failedGates.some((g) => g.type === 'unit')
          ? [
              'roland hitl-status',
              'roland board-status --concise',
              'Fix failing tests or run: npm test',
              'roland inject "<fix guidance>"',
            ]
          : [
              'roland hitl-status',
              'roland board-status --concise',
              'roland inject "<fix guidance>"',
            ];

      if (!skipHitl) {
        emitHermesHitlEvent(ctx.stateDir, {
          kind: evaluation.confidence === 0 ? 'verification-gate' : 'verification-failure',
          blockerDescription: evaluation.summary,
          currentGate: 'verification',
          suggestedActions,
          detail: {
            confidence: evaluation.confidence,
            accepted: evaluation.accepted,
            iteration: ctx.iteration,
            gates: evaluation.gates?.map((g) => ({
              name: g.name,
              pass: g.pass,
              confidence: g.confidence,
              skipped: g.skipped,
              skipReason: g.skipReason,
            })),
          },
        });
      }
    }

    const hasCritiquePhase =
      this.opts.template?.phases.some((p) => p.phase === Phase.Critique) ?? true;
    const maxRetries = ctx.maxRetries ?? 3;
    const flakyThreshold = ctx.isTestMode ? Number.MAX_SAFE_INTEGER : resolveFlakyEscapeThreshold();
    const flakyUpdate = updateFlakyVerification(
      ctx.state.flakyVerification,
      evaluation.gates ?? [],
      evaluation.accepted,
      flakyThreshold,
    );

    // When a Critique phase exists and retry budget remains, let critique decide retry vs escalate.
    const deferFlakyToCritique =
      hasCritiquePhase && (ctx.state.retryCount ?? 0) <= maxRetries;

    let shouldEscalate = false;
    let summary = evaluation.summary;

    if (flakyUpdate.hitThreshold && !deferFlakyToCritique && !ctx.isTestMode) {
      shouldEscalate = true;
      summary =
        `Flaky verification escape hatch: ${FLAKY_DIAGNOSIS} — ` +
        `identical failures ${flakyUpdate.state.consecutiveIdenticalFailures} times ` +
        `(threshold=${flakyThreshold})`;

      console.error(`[Loop][verify] ${summary}`, {
        fingerprint: flakyUpdate.fingerprint,
        diagnosis: flakyUpdate.diagnosis,
      });

      ctx.commandBoard?.appendBullet(
        'Open Intel',
        `[EVAL-GATE] flaky escape hatch — ${FLAKY_DIAGNOSIS} ` +
          `(consecutive=${flakyUpdate.state.consecutiveIdenticalFailures}, threshold=${flakyThreshold})`,
      );

      if (ctx.stateDir) {
        const { emitHermesHitlEvent } = await import('../../rco/hitl-hermes.js');
        emitHermesHitlEvent(ctx.stateDir, {
          kind: 'verification-failure',
          blockerDescription: summary,
          currentGate: 'verification',
          suggestedActions: [
            'roland hitl-status',
            'roland board-status --concise',
            'Investigate test environment / flaky suite — rerun tests locally',
            'roland inject "stabilize test environment or skip flaky gate"',
          ],
          detail: {
            diagnosis: FLAKY_DIAGNOSIS,
            fingerprint: flakyUpdate.fingerprint,
            consecutiveIdenticalFailures: flakyUpdate.state.consecutiveIdenticalFailures,
            threshold: flakyThreshold,
            iteration: ctx.iteration,
          },
        });
      }
    }

    return {
      success: evaluation.accepted,
      summary,
      verification: loopSnapshot,
      evaluation,
      flakyVerification: flakyUpdate.state,
      shouldEscalate,
    };
  }
}
