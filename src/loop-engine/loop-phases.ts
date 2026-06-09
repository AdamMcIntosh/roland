/**
 * Loop Phase Model — canonical phases for Loop Engineering missions.
 *
 * Standard loop: Plan → Act → Verify → Critique → Retry → Escalate → Observe
 */

export const Phase = {
  Plan: 'plan',
  Act: 'act',
  Verify: 'verify',
  Critique: 'critique',
  Retry: 'retry',
  Escalate: 'escalate',
  Observe: 'observe',
  Reflect: 'reflect',
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

export const ALL_PHASES: readonly Phase[] = [
  Phase.Plan,
  Phase.Act,
  Phase.Verify,
  Phase.Critique,
  Phase.Retry,
  Phase.Escalate,
  Phase.Observe,
  Phase.Reflect,
];

/** Verification strategy types selectable in loop templates. */
export type TemplateVerificationStep = 'unit' | 'integration' | 'smoke' | 'e2e' | 'lint' | 'typecheck';

/** Exit condition types — inspired by loops.elorm.xyz explicit exit rules. */
export type ExitConditionType =
  | 'all_gates_pass'
  | 'confidence_streak'
  | 'command_success'
  | 'spec_complete'
  | 'custom';

/** Declarative exit rule loaded from YAML or supplied programmatically. */
export interface ExitConditionConfig {
  id?: string;
  type: ExitConditionType;
  /** Human-readable label for dashboard and logs. */
  description?: string;
  /** For confidence_streak — minimum weighted confidence (default 0.85). */
  minConfidence?: number;
  /** For confidence_streak — consecutive accepted iterations required (default 2). */
  consecutiveIterations?: number;
  /** For command_success — command that must exit 0 (defaults to betweenIterations). */
  command?: string;
  /** For custom — programmatic evaluator (not serializable from YAML). */
  evaluate?: (ctx: import('./exit-conditions.js').ExitEvaluationContext) => boolean;
}

/** Per-phase configuration within a loop template. */
export interface PhaseConfig {
  phase: Phase;
  /** Human-readable label for dashboard/logs */
  label?: string;
  /** Optional agent persona hint for this phase (future wiring) */
  agent?: string;
  /** Skip this phase when optional and no handler result is required */
  optional?: boolean;
  /** Verify-phase only — subset of verification strategies to run */
  verification?: TemplateVerificationStep[];
}

/** A reusable loop template — loaded from recipes/loops/*.yaml */
export interface LoopTemplate {
  name: string;
  description: string;
  phases: PhaseConfig[];
  /** Outer loop iterations before escalation (default: 5) */
  maxIterations?: number;
  /** Max retry attempts before HITL escalation (default: 3) */
  maxRetries?: number;
  /** Consecutive verify failures before HITL (default: 4, independent of maxRetries) */
  escalationThreshold?: number;
  /** Test-mode overrides — used when isTestMode or ROLAND_LOOP_TEST_MODE=1 */
  testModeMaxRetries?: number;
  testModeEscalationThreshold?: number;
  /** Wall-clock timeout for the entire loop (ms). Default from config or 30 min. */
  timeoutMs?: number;
  /** Enable exponential backoff before retry iterations */
  exponentialBackoff?: boolean;
  /** Structured kickoff prompt shown at loop start (loops.elorm.xyz pattern). */
  kickoff?: string;
  /** Shell command run between iterations for self-pacing checks. */
  betweenIterations?: string;
  /** Write reflection learnings to LoopMemory before next iteration. */
  reflection?: boolean;
  /** Explicit exit rules — all must pass to complete early. */
  exitConditions?: ExitConditionConfig[];
  /** Minimum confidence for EvaluationGate acceptance override. */
  minConfidence?: number;
  /** Spec-First: path to markdown checklist/spec (task lists with `- [ ]` / `- [x]`). */
  specFile?: string;
  /** Alias for specFile — either may be set in YAML templates. */
  checklistPath?: string;
}

export function isPhase(value: string): value is Phase {
  return (ALL_PHASES as readonly string[]).includes(value);
}

export function phaseLabel(config: PhaseConfig): string {
  return config.label ?? config.phase;
}
