/**
 * Loop Phase Model — canonical phases for Loop Engineering missions.
 *
 * Standard loop: Plan → Act → Verify → Critique → Retry → Observe
 */

export const Phase = {
  Plan: 'plan',
  Act: 'act',
  Verify: 'verify',
  Critique: 'critique',
  Retry: 'retry',
  Observe: 'observe',
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

export const ALL_PHASES: readonly Phase[] = [
  Phase.Plan,
  Phase.Act,
  Phase.Verify,
  Phase.Critique,
  Phase.Retry,
  Phase.Observe,
];

/** Verification strategy types selectable in loop templates. */
export type TemplateVerificationStep = 'unit' | 'integration' | 'smoke' | 'e2e' | 'lint' | 'typecheck';

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
}

export function isPhase(value: string): value is Phase {
  return (ALL_PHASES as readonly string[]).includes(value);
}

export function phaseLabel(config: PhaseConfig): string {
  return config.label ?? config.phase;
}
