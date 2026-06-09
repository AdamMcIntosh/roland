/**
 * ## Assumptions
 * - Exit conditions are declarative rules from loop templates (loops.elorm.xyz pattern).
 * - Multiple conditions combine with AND semantics — all must pass to exit early.
 * - Confidence streak reads from LoopMemory disk state updated after each verify phase.
 * - Command success uses the most recent between-iterations run when configured.
 */

import type { ExitConditionConfig } from './loop-phases.js';
import type { LoopDiskState, BetweenIterationRun } from './loop-memory.js';
import type { EvaluationGateResult } from './evaluation-gate.js';

export interface ExitConditionStatus {
  id: string;
  type: ExitConditionConfig['type'];
  description: string;
  met: boolean;
  reason: string;
  evaluatedAt: number;
}

export interface ExitEvaluationContext {
  iteration: number;
  maxIterations: number;
  evaluation?: EvaluationGateResult;
  memory: LoopDiskState;
  lastBetweenRun?: BetweenIterationRun;
}

export interface ExitEvaluationResult {
  shouldExit: boolean;
  reason: string;
  statuses: ExitConditionStatus[];
  /** Human-readable summary for dashboard / logs. */
  summary: string;
}

function conditionId(c: ExitConditionConfig, index: number): string {
  return c.id ?? `${c.type}-${index}`;
}

function evaluateOne(
  condition: ExitConditionConfig,
  index: number,
  ctx: ExitEvaluationContext,
): ExitConditionStatus {
  const id = conditionId(condition, index);
  const description =
    condition.description ??
    defaultDescription(condition);
  const now = Date.now();

  switch (condition.type) {
    case 'all_gates_pass': {
      const eval_ = ctx.evaluation;
      const met = Boolean(eval_?.accepted && eval_?.pass);
      return {
        id,
        type: condition.type,
        description,
        met,
        reason: met
          ? 'All required gates passed and confidence meets threshold'
          : eval_
            ? `Gates not accepted — ${eval_.summary}`
            : 'No evaluation result available',
        evaluatedAt: now,
      };
    }

    case 'confidence_streak': {
      const min = condition.minConfidence ?? 0.85;
      const needed = condition.consecutiveIterations ?? 2;
      const streak = ctx.memory.confidenceStreak;
      const lastConf = ctx.memory.confidenceHistory.at(-1);
      const met = streak >= needed && (lastConf == null || lastConf >= min);
      return {
        id,
        type: condition.type,
        description,
        met,
        reason: met
          ? `Confidence ≥ ${min} for ${needed} consecutive iteration(s) (streak=${streak})`
          : `Need ${needed} consecutive accepted iterations (streak=${streak}, last=${lastConf ?? 'n/a'})`,
        evaluatedAt: now,
      };
    }

    case 'command_success': {
      const run = ctx.lastBetweenRun;
      if (!run) {
        return {
          id,
          type: condition.type,
          description,
          met: false,
          reason: 'Between-iterations command has not run yet',
          evaluatedAt: now,
        };
      }
      const met = run.exitCode === 0 && !run.timedOut;
      return {
        id,
        type: condition.type,
        description,
        met,
        reason: met
          ? `Command exited 0: ${run.command}`
          : `Command failed (exit=${run.exitCode}${run.timedOut ? ', timed out' : ''}): ${run.command}`,
        evaluatedAt: now,
      };
    }

    case 'spec_complete': {
      const spec = ctx.memory.specProgress;
      if (!spec) {
        return {
          id,
          type: condition.type,
          description,
          met: false,
          reason: 'No spec/checklist progress recorded — configure specFile or checklistPath',
          evaluatedAt: now,
        };
      }
      if (spec.total === 0) {
        return {
          id,
          type: condition.type,
          description,
          met: false,
          reason: `Spec file has no task-list items: ${spec.specPath}`,
          evaluatedAt: now,
        };
      }
      const met = spec.allComplete;
      return {
        id,
        type: condition.type,
        description,
        met,
        reason: met
          ? `All ${spec.total} spec/checklist items marked complete`
          : `${spec.completed}/${spec.total} spec items complete (${spec.percentComplete}%)`,
        evaluatedAt: now,
      };
    }

    case 'custom': {
      const met = Boolean(condition.evaluate?.(ctx));
      return {
        id,
        type: condition.type,
        description,
        met,
        reason: met ? 'Custom criterion satisfied' : 'Custom criterion not met',
        evaluatedAt: now,
      };
    }

    default:
      return {
        id,
        type: condition.type,
        description,
        met: false,
        reason: `Unknown exit condition type: ${String(condition.type)}`,
        evaluatedAt: now,
      };
  }
}

function defaultDescription(c: ExitConditionConfig): string {
  switch (c.type) {
    case 'all_gates_pass':
      return 'All evaluation gates pass with accepted confidence';
    case 'confidence_streak':
      return `Success confidence ≥ ${c.minConfidence ?? 0.85} for ${c.consecutiveIterations ?? 2} consecutive iterations`;
    case 'command_success':
      return c.command ? `Command succeeds: ${c.command}` : 'Between-iterations check command exits 0';
    case 'spec_complete':
      return 'All spec/checklist markdown task items marked complete';
    case 'custom':
      return 'Custom exit criterion';
    default:
      return String(c.type);
  }
}

/**
 * Evaluate configured exit conditions. When none are configured, falls back to
 * verification accepted on the current iteration (loops.elorm.xyz default).
 */
export function evaluateExitConditions(
  conditions: ExitConditionConfig[] | undefined,
  ctx: ExitEvaluationContext,
): ExitEvaluationResult {
  const rules =
    conditions && conditions.length > 0
      ? conditions
      : [{ type: 'all_gates_pass' as const, description: 'All gates pass (default)' }];

  const statuses = rules.map((c, i) => evaluateOne(c, i, ctx));
  const allMet = statuses.every((s) => s.met);
  const metNames = statuses.filter((s) => s.met).map((s) => s.id);
  const unmetNames = statuses.filter((s) => !s.met).map((s) => s.id);

  const reason = allMet
    ? `Exit conditions met: ${metNames.join(', ')}`
    : `Continuing loop — unmet: ${unmetNames.join(', ')}`;

  const summary = statuses
    .map((s) => `${s.met ? '✓' : '✗'} ${s.description} — ${s.reason}`)
    .join('\n');

  return {
    shouldExit: allMet,
    reason,
    statuses,
    summary,
  };
}

/**
 * ## Loop Integration Complete
 * Exit conditions enable explicit loop termination rules (confidence streaks, all-green gates,
 * command checks) with clear visibility into why a loop succeeded or continues.
 */
