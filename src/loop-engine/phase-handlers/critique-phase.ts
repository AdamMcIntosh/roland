/**
 * Critique phase — analyzes verification results and phase history, decides retry/escalate.
 *
 * Model routing (future LLM wiring):
 *   - PM default model: high-level / multi-area failures, blockers, architecture
 *   - Composer (composer-2.5): code-specific failures (unit, lint, typecheck)
 */

import { DEFAULT_ENGINEER_MODEL, DEFAULT_PM_MODEL } from '../../rco/cursor-models.js';
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import { formatSpecProgressSummary } from '../spec-progress.js';
import {
  CritiqueEngine,
  type CritiqueEngineOptions,
} from '../self-improvement/critique-engine.js';
import type { CritiqueModel, LoopCritiqueSnapshot } from '../self-improvement/types.js';
import { DEFAULT_ESCALATION_THRESHOLD } from '../self-improvement/escalation.js';

export class CritiquePhaseHandler implements PhaseHandler {
  readonly phase = Phase.Critique;
  private readonly engine: CritiqueEngine;

  constructor(opts: CritiqueEngineOptions = {}) {
    this.engine = new CritiqueEngine(opts);
  }

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const maxRetries = ctx.maxRetries ?? 3;
    const escalationThreshold = ctx.escalationThreshold ?? DEFAULT_ESCALATION_THRESHOLD;

    console.error(
      `[Loop][critique] thresholds maxRetries=${maxRetries} escalationThreshold=${escalationThreshold} ` +
        `retryCount=${ctx.state.retryCount} iteration=${ctx.iteration}`,
    );

    let critique: LoopCritiqueSnapshot;
    try {
      const reflectionNote = ctx.latestReflection
        ? `\n\nPrior reflection (iteration ${ctx.latestReflection.iteration}):\n${ctx.latestReflection.content}`
        : ctx.reflectionContext?.trim()
          ? `\n\nReflection history:\n${ctx.reflectionContext.slice(-2000)}`
          : '';

      const specNote = ctx.specProgress
        ? `\n\nSpec progress: ${formatSpecProgressSummary(ctx.specProgress)}`
        : '';

      const output = this.engine.critique({
        goal: ctx.goal + reflectionNote + specNote,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Loop][critique] Critique engine error — defensive fallback', { error: message });
      critique = {
        strengths: [],
        issues: [`Critique engine error: ${message}`],
        suggestions: ['Review verification output manually and retry or escalate'],
        retryDecision: ctx.state.retryCount >= maxRetries ? 'escalate' : 'retry',
        model: 'grok',
        summary: `Critique fallback — ${message}`,
        at: Date.now(),
        iteration: ctx.iteration,
        proposalCount: 0,
      };
    }

    const decisionLabel = critique.retryDecision.toUpperCase();
    const modelLabel = critiqueModelLabel(critique.model);

    ctx.blackboard.post({
      type: 'result',
      title: `Loop: Critique phase (iteration ${ctx.iteration})`,
      content: [
        critique.summary,
        `Decision: ${decisionLabel} · Model: ${modelLabel}`,
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

    ctx.commandBoard?.appendBullet(
      'Key Decisions',
      `[CRITIQUE] ${decisionLabel} — ${critique.summary.slice(0, 160)}`,
    );
    ctx.commandBoard?.appendBullet(
      'Open Intel',
      `[CRITIQUE] model=${critique.model} decision=${critique.retryDecision} ` +
        `retry=${ctx.state.retryCount}/${maxRetries} escalationThreshold=${escalationThreshold} ` +
        `issues=${critique.issues.length}`,
    );

    const shouldEscalate = critique.retryDecision === 'escalate';
    const shouldRetry =
      critique.retryDecision === 'retry' || critique.retryDecision === 'retry_focused';
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

function critiqueModelLabel(model: CritiqueModel): string {
  const routed = model === 'grok' ? DEFAULT_PM_MODEL : DEFAULT_ENGINEER_MODEL;
  const lane = model === 'grok' ? 'high-level' : 'code-specific';
  return `${routed} (${lane})`;
}
