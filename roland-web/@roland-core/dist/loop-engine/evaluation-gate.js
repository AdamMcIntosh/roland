/**
 * ## Roland Execution Reliability Fix
 *
 * ## Evaluation Gate & Blocker Fix
 *
 * ## Assumptions
 * - Automated verifiers (unit/lint/typecheck) run via TestExecutor shell commands.
 * - Custom criteria are synchronous or async functions supplied by callers/tests.
 * - Manual review defaults to pass in unattended mode unless `manualReviewApproved` is set false.
 * - Confidence is a weighted pass ratio across required gates (0–1); optional gates do not reduce confidence below 0.5 when skipped.
 */
import { TestExecutor, resolveStrategies, coerceVerificationStrategies, } from './verification/index.js';
import { loadLoopEngineConfig } from './loop-config.js';
import { getStrategyWeight, getStrategySuccessThreshold, } from './verification/verification-strategies.js';
const DEFAULT_MIN_CONFIDENCE = 0.85;
function logGate(msg, detail) {
    const line = `[Loop][eval-gate] ${msg}`;
    if (detail && Object.keys(detail).length > 0) {
        console.error(line, detail);
    }
    else {
        console.error(line);
    }
}
function gateConfidence(pass, required, skipped) {
    if (skipped)
        return 1;
    if (pass)
        return 1;
    return required ? 0 : 0.5;
}
function computeOverallConfidence(gates) {
    if (gates.length === 0)
        return 1;
    // Include soft-skipped gates (e.g. missing npm test) — they contribute weight at conf=1
    // so greenfield projects are not penalized below min_confidence.
    const totalWeight = gates.reduce((sum, g) => sum + g.weight, 0);
    if (totalWeight <= 0)
        return 1;
    const weighted = gates.reduce((sum, g) => sum + g.confidence * g.weight, 0);
    return Math.round((weighted / totalWeight) * 1000) / 1000;
}
function strategyToGate(strategy, config) {
    const optional = Boolean(config?.optional);
    const required = !strategy.skipped && !optional;
    const weight = getStrategyWeight(strategy.type, config?.weight);
    const passThreshold = getStrategySuccessThreshold(strategy.type, optional, config?.successThreshold);
    const minStrategyConf = config?.minConfidence;
    let confidence;
    if (strategy.skipped) {
        confidence = 1;
    }
    else if (strategy.pass) {
        confidence = passThreshold;
        if (minStrategyConf !== undefined && confidence < minStrategyConf) {
            confidence = minStrategyConf;
        }
    }
    else {
        confidence = optional ? Math.min(passThreshold * 0.5, 0.5) : 0;
    }
    const strategyPass = strategy.pass || Boolean(strategy.skipped);
    const gatePass = strategyPass &&
        (minStrategyConf === undefined || !strategy.pass || confidence >= minStrategyConf);
    return {
        type: strategy.type,
        name: strategy.type,
        pass: gatePass,
        required,
        weight,
        durationMs: strategy.durationMs,
        confidence,
        failures: strategy.failures.map((f) => f.message),
        skipped: strategy.skipped,
        skipReason: strategy.skipReason,
    };
}
/**
 * EvaluationGate — unified pass/fail gate with automated checks, custom criteria,
 * optional manual review, and confidence scoring.
 */
export class EvaluationGate {
    opts;
    constructor(opts = {}) {
        this.opts = opts;
    }
    async evaluate() {
        const startedAt = Date.now();
        const gates = [];
        const cfg = loadLoopEngineConfig();
        const strategies = this.opts.strategies ??
            resolveStrategies(coerceVerificationStrategies(cfg.verification?.strategies), this.opts.templateFilter);
        logGate('starting evaluation', {
            strategies: strategies.map((s) => ({
                type: s.type,
                weight: s.weight ?? getStrategyWeight(s.type),
                successThreshold: s.successThreshold,
                optional: s.optional,
            })),
            minConfidence: this.opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
            customCriteria: this.opts.customCriteria?.length ?? 0,
            iteration: this.opts.iteration,
        });
        const strategyConfigByType = new Map(strategies.map((s) => [s.type, s]));
        let strategyResults = [];
        try {
            const executor = new TestExecutor({
                cwd: this.opts.cwd ?? process.cwd(),
                strategies,
                hadWaveBlockers: this.opts.hadWaveBlockers,
                runner: this.opts.runner,
                onStrategyProgress: (type, status) => {
                    const cfg = strategyConfigByType.get(type);
                    this.opts.onStrategyProgress?.(type, status, {
                        weight: cfg?.weight ?? getStrategyWeight(type),
                    });
                },
            });
            const verification = await executor.runAll();
            strategyResults = verification.strategies;
            for (const s of strategyResults) {
                gates.push(strategyToGate(s, strategyConfigByType.get(s.type)));
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logGate('automated verification crashed — recording gate failure', { error: message });
            gates.push({
                type: 'unit',
                name: 'automated-verification',
                pass: false,
                required: true,
                weight: 2,
                durationMs: Date.now() - startedAt,
                confidence: 0,
                failures: [message],
            });
        }
        for (const criterion of this.opts.customCriteria ?? []) {
            const gateStarted = Date.now();
            try {
                const result = await criterion.evaluate({
                    goal: this.opts.goal ?? '',
                    iteration: this.opts.iteration ?? 1,
                    hadWaveBlockers: this.opts.hadWaveBlockers,
                });
                const weight = criterion.weight ?? 1;
                gates.push({
                    type: 'custom',
                    name: criterion.name,
                    pass: result.pass,
                    required: true,
                    weight,
                    durationMs: Date.now() - gateStarted,
                    confidence: gateConfidence(result.pass, true, false),
                    failures: result.pass ? [] : [result.message],
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                gates.push({
                    type: 'custom',
                    name: criterion.name,
                    pass: false,
                    required: true,
                    weight: criterion.weight ?? 1,
                    durationMs: Date.now() - gateStarted,
                    confidence: 0,
                    failures: [message],
                });
            }
        }
        if (this.opts.requireManualReview) {
            const approved = this.opts.manualReviewApproved !== false;
            gates.push({
                type: 'manual_review',
                name: 'manual_review',
                pass: approved,
                required: true,
                weight: 1.5,
                durationMs: 0,
                confidence: approved ? 1 : 0,
                failures: approved ? [] : ['Manual review not approved'],
            });
        }
        const confidence = computeOverallConfidence(gates);
        const minConfidence = this.opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
        const requiredGates = gates.filter((g) => g.required && !g.skipped);
        const requiredPass = requiredGates.every((g) => g.pass);
        const waveOk = !this.opts.hadWaveBlockers;
        const pass = waveOk && requiredPass;
        const accepted = pass && confidence >= minConfidence;
        const completedAt = Date.now();
        const failed = gates.filter((g) => g.required && !g.skipped && !g.pass);
        const summary = accepted
            ? `Evaluation accepted — confidence ${confidence} (${gates.length} gate(s))`
            : !pass
                ? failed.length > 0
                    ? `Evaluation rejected — failed: ${failed.map((g) => g.name).join(', ')}`
                    : 'Evaluation rejected — wave blockers detected'
                : `Evaluation rejected — confidence ${confidence} below threshold ${minConfidence}`;
        const result = {
            pass,
            summary,
            startedAt,
            completedAt,
            durationMs: completedAt - startedAt,
            strategies: strategyResults,
            hadWaveBlockers: this.opts.hadWaveBlockers,
            confidence,
            gates,
            accepted,
        };
        if (this.opts.exitConditions?.length && accepted) {
            result.exitPreview = {
                wouldExit: true,
                reason: 'All gates accepted — exit conditions eligible at iteration end',
            };
        }
        this.opts.blackboard?.post({
            type: 'result',
            title: `Evaluation gate (confidence ${confidence})`,
            content: `${summary}\n${gates.map((g) => `${g.name}: ${g.pass ? 'pass' : 'fail'} (conf=${g.confidence})`).join('\n')}`,
            status: accepted ? 'done' : 'blocked',
            author: 'loop-engine',
            priority: accepted ? 'medium' : 'high',
            tags: ['loop', 'eval-gate', 'verification'],
            relatedIds: [],
        });
        logGate('evaluation complete', {
            pass,
            accepted,
            confidence,
            gateCount: gates.length,
            failedGates: failed.map((g) => g.name),
        });
        return result;
    }
    /** Build gate from pre-computed strategy configs (testing helpers). */
    static fromStrategies(strategies, runner) {
        return new EvaluationGate({
            templateFilter: strategies.map((s) => s.type),
            runner,
        });
    }
}
export function evaluationResultToLoopState(result) {
    return {
        pass: result.pass,
        summary: result.summary,
        at: result.completedAt,
        durationMs: result.durationMs,
        confidence: result.confidence,
        accepted: result.accepted,
        strategies: result.strategies.map((s) => ({
            type: s.type,
            pass: s.pass,
            durationMs: s.durationMs,
            failures: s.failures.length > 0 ? s.failures.map((f) => f.message) : undefined,
        })),
    };
}
/**
 * ## Component Complete
 * EvaluationGate aggregates automated verifiers, custom criteria, and optional manual review
 * into a single pass/fail decision with weighted confidence scoring for closed-loop retry logic.
 */
//# sourceMappingURL=evaluation-gate.js.map