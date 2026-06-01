/**
 * TaskRouter — picks the Cursor model an engineer runs on (Phase 3).
 *
 * Routing is deterministic and lane-based (see model-policy.ts). The Lead PM is
 * always Opus; engineers run on Composer 2.5 — fast for interactive/reasoning
 * roles, standard for background execution. The task description is accepted for
 * forward-compatibility (a future heuristic could nuance within a lane) but is
 * not currently used: the engineer's persona alone determines the lane.
 */
import { PROVIDER, type Lane, type ModelPolicy, type ModelVariant } from './model-policy.js';
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
export declare class TaskRouter {
    private readonly policy;
    private readonly laneOverrides;
    constructor(opts?: TaskRouterOptions);
    route(_taskDescription: string, engineerName: string): RouteDecision;
}
//# sourceMappingURL=router.d.ts.map