/**
 * CritiqueEngine — rule-based structured critique from verification + phase history.
 *
 * Selects critique model lane (Grok vs Composer) for future LLM integration.
 * Does not invoke LLMs directly — deterministic analysis for loop reliability.
 */

import { toCursorModelId } from '../../rco/model-routing.js';
import { generateImprovementProposals } from './improvement-proposals.js';
import { resolveRetryStrategy } from './retry-strategies.js';
import type {
  CritiqueInput,
  CritiqueModel,
  CritiqueOutput,
  LoopCritiqueSnapshot,
} from './types.js';
import { critiqueOutputToSnapshot } from './types.js';
import { DEFAULT_ESCALATION_THRESHOLD } from './escalation.js';
import { loopDegradationPolicy } from '../loop-resilience.js';

export interface CritiqueEngineOptions {
  /** Override max retries (template maxRetries takes precedence at handler level). */
  maxRetries?: number;
}

const CODE_SPECIFIC_TYPES = new Set(['unit', 'lint', 'typecheck', 'integration', 'e2e', 'smoke']);

export class CritiqueEngine {
  private readonly opts: CritiqueEngineOptions;

  constructor(opts: CritiqueEngineOptions = {}) {
    this.opts = opts;
  }

  critique(input: CritiqueInput): CritiqueOutput {
    const maxRetries = input.maxRetries ?? this.opts.maxRetries ?? 3;
    const escalationThreshold =
      input.escalationThreshold ?? DEFAULT_ESCALATION_THRESHOLD;
    const enriched: CritiqueInput = { ...input, maxRetries, escalationThreshold };

    const strengths = collectStrengths(enriched);
    const issues = collectIssues(enriched);
    const suggestions = collectSuggestions(enriched);
    const proposals = generateImprovementProposals(enriched);
    const retryResult = resolveRetryStrategy(enriched);
    const model = loopDegradationPolicy.selectModel(selectCritiqueModel(enriched, issues));

    // Log model routing for observability (matches team-orchestrator banner pattern).
    const routedModelId = toCursorModelId(
      model === 'grok' ? 'grok-4.3' : 'composer-2.5',
      model === 'grok' ? 'critic' : 'executor',
    );
    console.error(
      `[Loop][critique] model=${model} routed=${routedModelId} decision=${retryResult.decision} ` +
        `retry=${input.retryCount}/${maxRetries} escalationThreshold=${escalationThreshold} ` +
        `reason="${retryResult.reason}"`,
    );

    const summary = buildSummary(enriched, retryResult.decision, retryResult.reason);

    return {
      strengths,
      issues,
      suggestions,
      proposals,
      retryDecision: retryResult.decision,
      model,
      summary,
      at: Date.now(),
      iteration: input.iteration,
    };
  }

  /** Convenience — returns dashboard/loop-state snapshot. */
  critiqueSnapshot(input: CritiqueInput): LoopCritiqueSnapshot {
    return critiqueOutputToSnapshot(this.critique(input));
  }
}

function collectStrengths(input: CritiqueInput): string[] {
  const strengths: string[] = [];
  if (input.verification?.pass) {
    strengths.push('Verification gate passed');
    const passed = (input.verification.strategies ?? []).filter((s) => s.pass);
    for (const s of passed) {
      strengths.push(`${s.type} check passed (${s.durationMs}ms)`);
    }
  }
  if (!input.hadBlockers && input.verification?.pass) {
    strengths.push('No wave blockers reported');
  }
  const recentSuccess = input.phaseHistory
    .filter((t) => t.success === true)
    .map((t) => t.phase);
  if (recentSuccess.includes('plan') && recentSuccess.includes('act')) {
    strengths.push('Plan and Act phases completed successfully');
  }
  return strengths;
}

function collectIssues(input: CritiqueInput): string[] {
  const issues: string[] = [];
  if (input.hadBlockers) {
    issues.push('Wave blockers require remediation');
  }
  if (input.verification && !input.verification.pass) {
    issues.push(input.verification.summary);
    for (const s of input.verification.strategies ?? []) {
      if (!s.pass) {
        const failMsgs = s.failures?.slice(0, 2).join('; ') ?? 'check failed';
        issues.push(`${s.type}: ${failMsgs}`);
      }
    }
  }
  return issues;
}

function collectSuggestions(input: CritiqueInput): string[] {
  const suggestions: string[] = [];
  const failed = (input.verification?.strategies ?? []).filter((s) => !s.pass);

  for (const s of failed) {
    if (s.type === 'unit') {
      suggestions.push('Review failing tests and fix assertions or implementation');
    } else if (s.type === 'lint') {
      suggestions.push('Run lint locally and resolve style/rule violations');
    } else if (s.type === 'typecheck') {
      suggestions.push('Fix TypeScript errors before next iteration');
    } else {
      suggestions.push(`Address ${s.type} failures before proceeding`);
    }
  }

  if (input.hadBlockers) {
    suggestions.push('Resolve agent blockers via PM unblock or scope adjustment');
  }

  if (suggestions.length === 0 && input.verification?.pass) {
    suggestions.push('Proceed to Observe or complete the loop iteration');
  }

  return suggestions;
}

/**
 * Grok for high-level / multi-failure critique; Composer for localized code issues.
 */
function selectCritiqueModel(input: CritiqueInput, issues: string[]): CritiqueModel {
  if (input.hadBlockers) return 'grok';
  const failed = (input.verification?.strategies ?? []).filter((s) => !s.pass);
  if (failed.length === 0) return 'grok';
  if (failed.length > 2) return 'grok';
  const allCodeSpecific = failed.every((s) => CODE_SPECIFIC_TYPES.has(s.type));
  if (allCodeSpecific && issues.length <= 3) return 'composer';
  return 'grok';
}

function buildSummary(
  input: CritiqueInput,
  decision: CritiqueOutput['retryDecision'],
  reason: string,
): string {
  if (decision === 'proceed') {
    return `Critique: acceptable — ${reason}`;
  }
  if (decision === 'escalate') {
    return `Critique: escalate to operator — ${reason}`;
  }
  if (decision === 'retry_focused') {
    const failed = (input.verification?.strategies ?? []).filter((s) => !s.pass).map((s) => s.type);
    return `Critique: focused retry on ${failed.join(', ')} — ${reason}`;
  }
  return `Critique: retry recommended — ${reason}`;
}
