/**
 * ## Assumptions
 * - [DEPRECATED] Legacy PM Team lane routing bridges to Loop Engineering ModelRouter when no explicit policy is passed.
 * - Hermes is the recommended PM layer; this policy serves LeadPM / use_pm_team backward compatibility only.
 * - DEFAULT_MODEL_POLICY uses Cursor SDK ids derived from config.yaml `models` section.
 */
import { type ModelRouter } from '../models/model-router.js';
export type Lane = 'pm' | 'reasoning' | 'coding' | 'light';
export type ModelVariant = 'opus' | 'fast' | 'standard';
export declare const PROVIDER: "cursor";
/** The three Cursor models the PM team uses. Overridable via config (pm: section). */
export interface ModelPolicy {
    /** Lead PM. */
    pm: string;
    /** Interactive / time-sensitive engineers (reasoning lane). */
    fast: string;
    /** Background / execution engineers (coding + light lanes). */
    standard: string;
}
/** [DEPRECATED] Build a legacy PM Team policy from Loop Engineering ModelRouter. */
export declare function modelPolicyFromRouter(router?: ModelRouter): ModelPolicy;
export declare const DEFAULT_MODEL_POLICY: ModelPolicy;
/** Map a lane to its Cursor model id + variant under a given policy. */
export declare function modelForLane(lane: Lane, policy?: ModelPolicy): {
    model: string;
    variant: ModelVariant;
};
/**
 * Decide which lane an engineer persona belongs to, by name.
 *
 * Reasoning-lane personas are the interactive / time-sensitive roles that
 * benefit from the fast model (architect, reviewer, critic, planner, security,
 * TDD/strategy). Light-lane personas are docs/tests/research. Everything else
 * is coding. `overrides` (from config pm.lane_overrides) wins over the heuristic
 * so a project can, e.g., put `designer` on the reasoning lane.
 */
export declare function laneForEngineer(name: string, overrides?: Record<string, Lane>): Lane;
//# sourceMappingURL=model-policy.d.ts.map