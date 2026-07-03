/**
 * ## Evaluation Gate & Blocker Fix
 *
 * Verify phase — runs EvaluationGate and surfaces structured results to loop state.
 */
import { Phase } from '../loop-phases.js';
import { EvaluationGate, evaluationResultToLoopState, } from '../evaluation-gate.js';
import { resolveVerificationStrategies } from '../loop-template-resolution.js';
export class VerifyPhaseHandler {
    phase = Phase.Verify;
    opts;
    constructor(opts = {}) {
        this.opts = opts;
    }
    async execute(ctx) {
        const template = this.opts.template ??
            { name: 'inline', description: '', phases: ctx.phaseConfig ? [ctx.phaseConfig] : [] };
        const strategies = resolveVerificationStrategies(template, ctx.phaseConfig);
        const strategyStatuses = strategies.map((s) => ({
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
                        ...strategyStatuses[idx],
                        status,
                        confidence: meta?.confidence,
                        weight: meta?.weight ?? strategyStatuses[idx].weight,
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
        }
        catch (err) {
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
        ctx.commandBoard?.appendBullet('Open Intel', `[EVAL-GATE] ${evaluation.summary} (confidence=${evaluation.confidence}) — ${detailLines}`);
        if (ctx.stateDir && !evaluation.accepted) {
            const { emitHermesHitlEvent } = await import('../../rco/hitl-hermes.js');
            const { isGreenfieldGoal } = await import('../../rco/goal-scope.js');
            const failedGates = evaluation.gates?.filter((g) => g.required && !g.skipped && !g.pass) ?? [];
            const softSkippedGates = evaluation.gates?.filter((g) => g.skipped) ?? [];
            const noTestSoftSkip = softSkippedGates.some((g) => g.skipReason?.includes('no test') || g.skipReason?.includes('no npm test'));
            const greenfieldToolingSkip = isGreenfieldGoal(ctx.goal) &&
                failedGates.length === 0 &&
                softSkippedGates.length > 0 &&
                softSkippedGates.every((g) => g.skipReason?.includes('minimal project') ||
                    g.skipReason?.includes('greenfield') ||
                    g.skipReason?.includes('no test'));
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
        return {
            success: evaluation.accepted,
            summary: evaluation.summary,
            verification: loopSnapshot,
            evaluation,
        };
    }
}
//# sourceMappingURL=verify-phase.js.map