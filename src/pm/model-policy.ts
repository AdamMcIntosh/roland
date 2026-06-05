/**
 * Cursor-native model policy for the PM team (Phase 3).
 *
 * The PM team runs entirely on Cursor's native models — there is no OpenRouter
 * here. Routing is deterministic and lane-based:
 *
 *   pm        → gpt-5.4-nano  (Lead PM only — orchestration + planning)
 *   reasoning → composer-2.5  (architect, reviewer, critic, planner, security…)
 *   coding    → composer-2.5  (executor, builder — cost-efficient default)
 *   light     → composer-2.5  (docs, tests, research — also standard)
 *
 * Cost strategy: GPT-5.4 Nano for the one orchestration agent ($0.20/$1.25 per MTok);
 * composer-2.5 for every engineer regardless of lane.
 *
 * This module is intentionally self-contained: it imports none of the legacy
 * OpenRouter constants and shares nothing with the RCO/triage routing path.
 */

export type Lane = 'pm' | 'reasoning' | 'coding' | 'light';
export type ModelVariant = 'opus' | 'fast' | 'standard';

export const PROVIDER = 'cursor' as const;

/** The three Cursor models the PM team uses. Overridable via config (pm: section). */
export interface ModelPolicy {
  /** Lead PM. */
  pm: string;
  /** Interactive / time-sensitive engineers (reasoning lane). */
  fast: string;
  /** Background / execution engineers (coding + light lanes). */
  standard: string;
}

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  pm: 'gpt-5.4-nano',
  fast: 'composer-2.5',
  standard: 'composer-2.5',
};

/** Map a lane to its Cursor model id + variant under a given policy. */
export function modelForLane(
  lane: Lane,
  policy: ModelPolicy = DEFAULT_MODEL_POLICY
): { model: string; variant: ModelVariant } {
  switch (lane) {
    case 'pm':
      return { model: policy.pm, variant: 'opus' };
    case 'reasoning':
      return { model: policy.fast, variant: 'fast' };
    case 'coding':
    case 'light':
      return { model: policy.standard, variant: 'standard' };
  }
}

/**
 * Decide which lane an engineer persona belongs to, by name.
 *
 * Reasoning-lane personas are the interactive / time-sensitive roles that
 * benefit from the fast model (architect, reviewer, critic, planner, security,
 * TDD/strategy). Light-lane personas are docs/tests/research. Everything else
 * is coding. `overrides` (from config pm.lane_overrides) wins over the heuristic
 * so a project can, e.g., put `designer` on the reasoning lane.
 */
export function laneForEngineer(name: string, overrides: Record<string, Lane> = {}): Lane {
  if (overrides[name]) return overrides[name];
  if (name === 'lead-pm') return 'pm';
  if (/architect|planner|critic|review|security|tdd|strateg/.test(name)) return 'reasoning';
  if (/test-executor|test-author|qa-tester|writer|doc|explore|research|analyst|accessibilit/.test(name)) return 'light';
  return 'coding';
}
