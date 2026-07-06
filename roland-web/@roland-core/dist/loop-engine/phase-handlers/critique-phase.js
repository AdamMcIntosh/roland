/**

 * ## P1 Honesty & Consolidation

 *

 * Critique phase — analyzes verification results and phase history, decides retry/escalate.

 *

 * Rule-based structured critique (no LLM). Lane metadata (critic vs coding) is retained

 * for routing context only — not presented as an invoked model.

 */
import { Phase } from '../loop-phases.js';
import { CritiqueEngine, } from '../self-improvement/critique-engine.js';
import { DEFAULT_ESCALATION_THRESHOLD } from '../self-improvement/escalation.js';
export class CritiquePhaseHandler {
    phase = Phase.Critique;
    engine;
    constructor(opts = {}) {
        this.engine = new CritiqueEngine(opts);
    }
    async execute(ctx) {
        const maxRetries = ctx.maxRetries ?? 3;
        const escalationThreshold = ctx.escalationThreshold ?? DEFAULT_ESCALATION_THRESHOLD;
        console.error(`[Loop][critique] rule-based structured critique (no LLM) thresholds ` +
            `maxRetries=${maxRetries} escalationThreshold=${escalationThreshold} ` +
            `retryCount=${ctx.state.retryCount} iteration=${ctx.iteration}`);
        let critique;
        try {
            const output = this.engine.critique({
                goal: ctx.goal,
                iteration: ctx.iteration,
                retryCount: ctx.state.retryCount,
                maxRetries,
                escalationThreshold,
                hadBlockers: ctx.hadBlockers,
                verification: ctx.state.lastVerification,
                phaseHistory: ctx.state.phaseHistory.map((t) => ({
                    phase: t.phase,
                    success: t.success,
                    summary: t.summary,
                })),
            });
            critique = {
                strengths: output.strengths,
                issues: output.issues,
                suggestions: output.suggestions,
                retryDecision: output.retryDecision,
                model: output.model,
                summary: output.summary,
                at: output.at,
                iteration: output.iteration,
                proposalCount: output.proposals.length,
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[Loop][critique] rule-based structured critique (no LLM) — defensive fallback', {
                error: message,
            });
            critique = {
                strengths: [],
                issues: [`Critique engine error: ${message}`],
                suggestions: ['Review verification output manually and retry or escalate'],
                retryDecision: ctx.state.retryCount >= maxRetries ? 'escalate' : 'retry',
                model: 'critic',
                summary: `Critique fallback — ${message}`,
                at: Date.now(),
                iteration: ctx.iteration,
                proposalCount: 0,
            };
        }
        const decisionLabel = critique.retryDecision.toUpperCase();
        const modeLabel = critiqueModeLabel(critique.model);
        ctx.blackboard.post({
            type: 'result',
            title: `Loop: Critique phase (iteration ${ctx.iteration})`,
            content: [
                critique.summary,
                `Decision: ${decisionLabel} · ${modeLabel}`,
                critique.strengths.length ? `Strengths: ${critique.strengths.join('; ')}` : '',
                critique.issues.length ? `Issues: ${critique.issues.join('; ')}` : '',
                critique.suggestions.length ? `Suggestions: ${critique.suggestions.join('; ')}` : '',
            ]
                .filter(Boolean)
                .join('\n'),
            status: critique.retryDecision === 'escalate' ? 'blocked' : critique.retryDecision === 'proceed' ? 'done' : 'pending',
            author: 'loop-engine',
            priority: critique.retryDecision === 'escalate' ? 'critical' : 'high',
            tags: ['loop', 'critique', 'retry-decision'],
            relatedIds: [],
        });
        ctx.blackboard.post({
            type: 'decision',
            title: 'Loop: Critique structured output',
            content: JSON.stringify(critique, null, 2),
            status: 'done',
            author: 'loop-engine',
            priority: 'low',
            tags: ['loop', 'critique', 'critique-detail'],
            relatedIds: [],
        });
        ctx.commandBoard?.appendBullet('Key Decisions', `[CRITIQUE] ${decisionLabel} — ${critique.summary.slice(0, 160)}`);
        ctx.commandBoard?.appendBullet('Open Intel', `[CRITIQUE] rule-based structured critique (no LLM) ${modeLabel} ` +
            `decision=${critique.retryDecision} retry=${ctx.state.retryCount}/${maxRetries} ` +
            `escalationThreshold=${escalationThreshold} issues=${critique.issues.length}`);
        const shouldEscalate = critique.retryDecision === 'escalate';
        const shouldRetry = critique.retryDecision === 'retry' || critique.retryDecision === 'retry_focused';
        const success = critique.retryDecision === 'proceed';
        return {
            success,
            summary: critique.summary,
            shouldRetry,
            shouldEscalate,
            critique,
        };
    }
}
/** Honest display label — rule-based critique with lane metadata for routing context. */
export function critiqueModelLabel(lane) {
    const laneDesc = lane === 'critic' ? 'high-level' : 'code-specific';
    return `rule-based structured critique (no LLM) · lane=${lane} (${laneDesc})`;
}
function critiqueModeLabel(lane) {
    return critiqueModelLabel(lane);
}
//# sourceMappingURL=critique-phase.js.map