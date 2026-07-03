/**
 * Loop resilience — model degradation and rate-limit handling via ModelRouter roles.
 */
import { ModelRouter } from '../models/model-router.js';
/** Fallback lane when primary critique lane is rate-limited. */
export function degradedCritiqueLane(current) {
    return current === 'critic' ? 'coding' : 'critic';
}
export class ModelDegradationPolicy {
    router;
    degradedLanes = new Set();
    lastDegradedAt;
    reason;
    constructor(router) {
        this.router = router ?? ModelRouter.fromConfig();
    }
    recordFailure(lane, errorMessage) {
        if (!this.router.isRateLimitOrUnavailable(errorMessage))
            return lane;
        this.degradedLanes.add(lane);
        this.lastDegradedAt = Date.now();
        this.reason = errorMessage.slice(0, 200);
        const fallback = degradedCritiqueLane(lane);
        this.router.recordFailure(lane, errorMessage);
        console.error(`[Loop][degrade] lane=${lane} unavailable — falling back to ${fallback}: "${this.reason}"`);
        return fallback;
    }
    selectLane(preferred) {
        if (preferred === 'critic' && this.degradedLanes.has('critic'))
            return 'coding';
        if (preferred === 'coding' && this.degradedLanes.has('coding'))
            return 'critic';
        return preferred;
    }
    getState() {
        return {
            degradedLanes: [...this.degradedLanes],
            lastDegradedAt: this.lastDegradedAt,
            reason: this.reason,
        };
    }
    reset() {
        this.degradedLanes.clear();
        this.lastDegradedAt = undefined;
        this.reason = undefined;
        this.router.resetDegradation();
    }
}
/** Shared policy instance — persists degradation state across phases in one loop run. */
export const loopDegradationPolicy = new ModelDegradationPolicy();
/** @deprecated Use degradedCritiqueLane */
export function degradedCritiqueModel(current) {
    return degradedCritiqueLane(current);
}
/** Detect API rate-limit or model-unavailable errors from agent output or errors. */
export function isRateLimitOrUnavailableError(message) {
    return ModelRouter.fromConfig().isRateLimitOrUnavailable(message);
}
//# sourceMappingURL=loop-resilience.js.map