/**
 * ## Assumptions
 * - [DEPRECATED] Legacy PM Team lane routing bridges to Loop Engineering RoleModelRouter when no explicit policy is passed.
 * - Pure ClosedLoop is the recommended path; this policy serves LeadPM / use_pm_team backward compatibility only.
 * - DEFAULT_MODEL_POLICY uses Cursor SDK ids derived from config.yaml `models` section.
 */

import { getRoleModelRouter, type RoleModelRouter } from '../models/role-model-router.js';
import { DEFAULT_ENGINEER_MODEL, DEFAULT_PM_MODEL } from '../rco/cursor-models.js';

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

/** [DEPRECATED] Build a legacy PM Team policy from Loop Engineering RoleModelRouter. */
export function modelPolicyFromRouter(router?: RoleModelRouter): ModelPolicy {
  const r = router ?? getRoleModelRouter();
  return {
    pm: r.resolveSdkModelId('lead-pm'),
    fast: r.resolveSdkModelId('architect'),
    standard: r.resolveSdkModelId('executor'),
  };
}

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  pm: DEFAULT_PM_MODEL,
  fast: DEFAULT_ENGINEER_MODEL,
  standard: DEFAULT_ENGINEER_MODEL,
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
