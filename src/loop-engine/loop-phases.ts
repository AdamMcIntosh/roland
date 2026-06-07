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

/** Per-phase configuration within a loop template. */
export interface PhaseConfig {
  phase: Phase;
  /** Human-readable label for dashboard/logs */
  label?: string;
  /** Optional agent persona hint for this phase (future wiring) */
  agent?: string;
  /** Skip this phase when optional and no handler result is required */
  optional?: boolean;
}

/** A reusable loop template — loaded from recipes/loops/*.yaml */
export interface LoopTemplate {
  name: string;
  description: string;
  phases: PhaseConfig[];
  /** Outer loop iterations before escalation (default: 5) */
  maxIterations?: number;
  /** Max retry attempts within a single iteration (default: 3) */
  maxRetries?: number;
}

export function isPhase(value: string): value is Phase {
  return (ALL_PHASES as readonly string[]).includes(value);
}

export function phaseLabel(config: PhaseConfig): string {
  return config.label ?? config.phase;
}
