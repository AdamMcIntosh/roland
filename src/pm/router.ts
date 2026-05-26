/**
 * TaskRouter — picks the Cursor model an engineer runs on (Phase 3).
 *
 * Routing is deterministic and lane-based (see model-policy.ts). The Lead PM is
 * always Opus; engineers run on Composer 2.5 — fast for interactive/reasoning
 * roles, standard for background execution. The task description is accepted for
 * forward-compatibility (a future heuristic could nuance within a lane) but is
 * not currently used: the engineer's persona alone determines the lane.
 */

import {
  DEFAULT_MODEL_POLICY,
  laneForEngineer,
  modelForLane,
  PROVIDER,
  type Lane,
  type ModelPolicy,
  type ModelVariant,
} from './model-policy.js';

export interface RouteDecision {
  /** Cursor model id, e.g. "composer-2.5-standard". */
  model: string;
  provider: typeof PROVIDER;
  lane: Lane;
  variant: ModelVariant;
  /** true for fast/opus — pick these in Cursor for time-sensitive work. */
  interactive: boolean;
  /** Human-readable explanation so the PM knows *why* this model was chosen. */
  rationale: string;
}

export interface TaskRouterOptions {
  policy?: ModelPolicy;
  /** Per-engineer lane overrides (config pm.lane_overrides). */
  laneOverrides?: Record<string, Lane>;
}

export class TaskRouter {
  private readonly policy: ModelPolicy;
  private readonly laneOverrides: Record<string, Lane>;

  constructor(opts: TaskRouterOptions = {}) {
    this.policy = opts.policy ?? DEFAULT_MODEL_POLICY;
    this.laneOverrides = opts.laneOverrides ?? {};
  }

  route(_taskDescription: string, engineerName: string): RouteDecision {
    const lane = laneForEngineer(engineerName, this.laneOverrides);
    const { model, variant } = modelForLane(lane, this.policy);
    const interactive = variant !== 'standard';
    const usage = interactive ? 'interactive / time-sensitive' : 'background / execution';
    return {
      model,
      provider: PROVIDER,
      lane,
      variant,
      interactive,
      rationale: `${engineerName} → ${lane} lane → ${model} (${usage})`,
    };
  }
}
