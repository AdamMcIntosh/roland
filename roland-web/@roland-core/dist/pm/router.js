/**
 * TaskRouter — picks the Cursor model an engineer runs on (Phase 3).
 *
 * Routing is deterministic and lane-based (see model-policy.ts). The Lead PM is
 * always Opus; engineers run on Composer 2.5 — fast for interactive/reasoning
 * roles, standard for background execution. The task description is accepted for
 * forward-compatibility (a future heuristic could nuance within a lane) but is
 * not currently used: the engineer's persona alone determines the lane.
 */
import { DEFAULT_MODEL_POLICY, laneForEngineer, modelForLane, PROVIDER, } from './model-policy.js';
export class TaskRouter {
    policy;
    laneOverrides;
    constructor(opts = {}) {
        this.policy = opts.policy ?? DEFAULT_MODEL_POLICY;
        this.laneOverrides = opts.laneOverrides ?? {};
    }
    route(_taskDescription, engineerName) {
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
//# sourceMappingURL=router.js.map