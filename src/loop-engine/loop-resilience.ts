/**
 * Loop resilience — model degradation and rate-limit handling via ModelRouter roles.
 */

import type { CritiqueModel } from './self-improvement/types.js';
import { ModelRouter } from '../models/model-router.js';

/** Fallback lane when primary critique lane is rate-limited. */
export function degradedCritiqueLane(current: CritiqueModel): CritiqueModel {
  return current === 'critic' ? 'coding' : 'critic';
}

export interface DegradationState {
  degradedLanes: CritiqueModel[];
  lastDegradedAt?: number;
  reason?: string;
}

export class ModelDegradationPolicy {
  private readonly router: ModelRouter;
  private degradedLanes = new Set<CritiqueModel>();
  private lastDegradedAt?: number;
  private reason?: string;

  constructor(router?: ModelRouter) {
    this.router = router ?? ModelRouter.fromConfig();
  }

  recordFailure(lane: CritiqueModel, errorMessage: string): CritiqueModel {
    if (!this.router.isRateLimitOrUnavailable(errorMessage)) return lane;

    this.degradedLanes.add(lane);
    this.lastDegradedAt = Date.now();
    this.reason = errorMessage.slice(0, 200);

    const fallback = degradedCritiqueLane(lane);
    this.router.recordFailure(lane, errorMessage);
    console.error(
      `[Loop][degrade] lane=${lane} unavailable — falling back to ${fallback}: "${this.reason}"`,
    );
    return fallback;
  }

  selectLane(preferred: CritiqueModel): CritiqueModel {
    if (preferred === 'critic' && this.degradedLanes.has('critic')) return 'coding';
    if (preferred === 'coding' && this.degradedLanes.has('coding')) return 'critic';
    return preferred;
  }

  getState(): DegradationState {
    return {
      degradedLanes: [...this.degradedLanes],
      lastDegradedAt: this.lastDegradedAt,
      reason: this.reason,
    };
  }

  reset(): void {
    this.degradedLanes.clear();
    this.lastDegradedAt = undefined;
    this.reason = undefined;
    this.router.resetDegradation();
  }
}

/** Shared policy instance — persists degradation state across phases in one loop run. */
export const loopDegradationPolicy = new ModelDegradationPolicy();

/** @deprecated Use degradedCritiqueLane */
export function degradedCritiqueModel(current: CritiqueModel): CritiqueModel {
  return degradedCritiqueLane(current);
}

/** Detect API rate-limit or model-unavailable errors from agent output or errors. */
export function isRateLimitOrUnavailableError(message: string): boolean {
  return ModelRouter.fromConfig().isRateLimitOrUnavailable(message);
}
