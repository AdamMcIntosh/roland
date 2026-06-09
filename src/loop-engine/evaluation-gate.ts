/**
 * ## Assumptions
 * - Automated verifiers (unit/lint/typecheck) run via TestExecutor shell commands.
 * - Custom criteria are synchronous or async functions supplied by callers/tests.
 * - Manual review defaults to pass in unattended mode unless `manualReviewApproved` is set false.
 * - Confidence is a weighted pass ratio across required gates (0–1); optional gates do not reduce confidence below 0.5 when skipped.
 */

import type { Blackboard } from '../rco/blackboard.js';
import {
  TestExecutor,
  resolveStrategies,
  type CommandRunner,
} from './verification/index.js';
import type {
  StrategyResult,
  VerificationResult,
  VerificationStrategyType,
} from './verification/verify-result.js';
import { loadLoopEngineConfig } from './loop-config.js';
import type { VerificationStrategyConfig } from './verification/verification-strategies.js';

export type GateVerifierType =
  | VerificationStrategyType
  | 'custom'
  | 'manual_review';

export interface CustomCriterion {
  name: string;
  /** Relative weight for confidence scoring (default 1). */
  weight?: number;
  evaluate: (ctx: CustomCriterionContext) => Promise<CustomCriterionResult> | CustomCriterionResult;
}

export interface CustomCriterionContext {
  goal: string;
  iteration: number;
  hadWaveBlockers?: boolean;
}

export interface CustomCriterionResult {
  pass: boolean;
  message: string;
}

export interface GateResult {
  type: GateVerifierType;
  name: string;
  pass: boolean;
  required: boolean;
  weight: number;
  durationMs: number;
  confidence: number;
  failures: string[];
  skipped?: boolean;
  skipReason?: string;
}

export interface EvaluationGateResult extends VerificationResult {
  /** Weighted pass confidence across required gates (0–1). */
  confidence: number;
  gates: GateResult[];
  /** True when all required gates passed and confidence >= minConfidence. */
  accepted: boolean;
  /** Exit condition preview when configured (full eval at iteration end). */
  exitPreview?: {
    wouldExit: boolean;
    reason: string;
  };
}

export interface EvaluationGateOptions {
  cwd?: string;
  goal?: string;
  iteration?: number;
  hadWaveBlockers?: boolean;
  templateFilter?: VerificationStrategyType[];
  customCriteria?: CustomCriterion[];
  /** When true, manual_review gate must explicitly approve. */
  requireManualReview?: boolean;
  /** Pre-set manual review outcome (tests / HITL). */
  manualReviewApproved?: boolean;
  minConfidence?: number;
  runner?: CommandRunner;
  blackboard?: Blackboard;
  /** Exit conditions evaluated after gate run (informational in gate summary). */
  exitConditions?: import('./loop-phases.js').ExitConditionConfig[];
}

const DEFAULT_MIN_CONFIDENCE = 0.75;

function logGate(msg: string, detail?: Record<string, unknown>): void {
  const line = `[Loop][eval-gate] ${msg}`;
  if (detail && Object.keys(detail).length > 0) {
    console.error(line, detail);
  } else {
    console.error(line);
  }
}

function gateConfidence(pass: boolean, required: boolean, skipped: boolean): number {
  if (skipped) return 1;
  if (pass) return 1;
  return required ? 0 : 0.5;
}

function computeOverallConfidence(gates: GateResult[]): number {
  const active = gates.filter((g) => !g.skipped);
  if (active.length === 0) return 1;
  const totalWeight = active.reduce((sum, g) => sum + g.weight, 0);
  if (totalWeight <= 0) return 1;
  const weighted = active.reduce((sum, g) => sum + g.confidence * g.weight, 0);
  return Math.round((weighted / totalWeight) * 1000) / 1000;
}

function strategyToGate(strategy: StrategyResult, weight = 1): GateResult {
  const required = !strategy.skipped;
  return {
    type: strategy.type,
    name: strategy.type,
    pass: strategy.pass || Boolean(strategy.skipped),
    required,
    weight,
    durationMs: strategy.durationMs,
    confidence: gateConfidence(strategy.pass, required, Boolean(strategy.skipped)),
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
  private readonly opts: EvaluationGateOptions;

  constructor(opts: EvaluationGateOptions = {}) {
    this.opts = opts;
  }

  async evaluate(): Promise<EvaluationGateResult> {
    const startedAt = Date.now();
    const gates: GateResult[] = [];
    const cfg = loadLoopEngineConfig();
    const strategies = resolveStrategies(cfg.verification?.strategies, this.opts.templateFilter);

    logGate('starting evaluation', {
      strategies: strategies.map((s) => s.type),
      customCriteria: this.opts.customCriteria?.length ?? 0,
      iteration: this.opts.iteration,
    });

    let strategyResults: StrategyResult[] = [];
    try {
      const executor = new TestExecutor({
        cwd: this.opts.cwd ?? process.cwd(),
        strategies,
        hadWaveBlockers: this.opts.hadWaveBlockers,
        runner: this.opts.runner,
      });
      const verification = await executor.runAll();
      strategyResults = verification.strategies;
      for (const s of strategyResults) {
        gates.push(strategyToGate(s));
      }
    } catch (err) {
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
      } catch (err) {
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

    const result: EvaluationGateResult = {
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
  static fromStrategies(
    strategies: VerificationStrategyConfig[],
    runner?: CommandRunner,
  ): EvaluationGate {
    return new EvaluationGate({
      templateFilter: strategies.map((s) => s.type),
      runner,
    });
  }
}

export function evaluationResultToLoopState(result: EvaluationGateResult): {
  pass: boolean;
  summary: string;
  at: number;
  durationMs: number;
  confidence: number;
  accepted: boolean;
  strategies: Array<{
    type: string;
    pass: boolean;
    durationMs: number;
    failures?: string[];
  }>;
} {
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
 * EvaluationGate aggregates automated verifiers, custom criteria (including spec_complete via
 * createSpecCompletionCriterion), and optional manual review into a single pass/fail decision
 * with weighted confidence scoring for closed-loop retry logic.
 */
