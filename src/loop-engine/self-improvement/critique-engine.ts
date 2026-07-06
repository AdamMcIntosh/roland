/**
 * ## P1 Honesty & Consolidation
 *
 * CritiqueEngine — rule-based structured critique from verification + phase history.
 *
 * Selects critique lane (critic vs coding) for routing metadata only.
 * Does not invoke LLMs — deterministic analysis for loop reliability.
 */

import { RoleModelRouter } from '../../models/role-model-router.js';
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
  modelRouter?: RoleModelRouter;
}

const CODE_SPECIFIC_TYPES = new Set(['unit', 'lint', 'typecheck', 'integration', 'e2e', 'smoke']);

export class CritiqueEngine {
  private readonly opts: CritiqueEngineOptions;
  private readonly router: RoleModelRouter;

  constructor(opts: CritiqueEngineOptions = {}) {
    this.opts = opts;
    this.router = opts.modelRouter ?? RoleModelRouter.fromConfig();
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
    const preferredLane = selectCritiqueLane(enriched, issues);
    const lane = loopDegradationPolicy.selectLane(preferredLane);
    const dispatch = this.router.resolveDispatch(lane, { phase: 'critique', log: false });

    console.error(
      `[Loop][critique] rule-based structured critique (no LLM) lane=${lane} ` +
        `routing=${dispatch.method} decision=${retryResult.decision} retry=${input.retryCount}/${maxRetries} ` +
        `escalationThreshold=${escalationThreshold} reason="${retryResult.reason}"`,
    );

    const summary = buildSummary(enriched, retryResult.decision, retryResult.reason);

    return {
      strengths,
      issues,
      suggestions,
      proposals,
      retryDecision: retryResult.decision,
      model: lane,
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
 * Critic role for high-level / multi-failure critique; coding role for localized code issues.
 */
function selectCritiqueLane(input: CritiqueInput, issues: string[]): CritiqueModel {
  if (input.hadBlockers) return 'critic';
  const failed = (input.verification?.strategies ?? []).filter((s) => !s.pass);
  if (failed.length === 0) return 'critic';
  if (failed.length > 2) return 'critic';
  const allCodeSpecific = failed.every((s) => CODE_SPECIFIC_TYPES.has(s.type));
  if (allCodeSpecific && issues.length <= 3) return 'coding';
  return 'critic';
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
