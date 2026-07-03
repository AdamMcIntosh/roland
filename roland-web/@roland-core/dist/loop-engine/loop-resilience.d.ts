/**
 * Loop resilience — model degradation and rate-limit handling via ModelRouter roles.
 */
import type { CritiqueModel } from './self-improvement/types.js';
import { ModelRouter } from '../models/model-router.js';
/** Fallback lane when primary critique lane is rate-limited. */
export declare function degradedCritiqueLane(current: CritiqueModel): CritiqueModel;
export interface DegradationState {
    degradedLanes: CritiqueModel[];
    lastDegradedAt?: number;
    reason?: string;
}
export declare class ModelDegradationPolicy {
    private readonly router;
    private degradedLanes;
    private lastDegradedAt?;
    private reason?;
    constructor(router?: ModelRouter);
    recordFailure(lane: CritiqueModel, errorMessage: string): CritiqueModel;
    selectLane(preferred: CritiqueModel): CritiqueModel;
    getState(): DegradationState;
    reset(): void;
}
/** Shared policy instance — persists degradation state across phases in one loop run. */
export declare const loopDegradationPolicy: ModelDegradationPolicy;
/** @deprecated Use degradedCritiqueLane */
export declare function degradedCritiqueModel(current: CritiqueModel): CritiqueModel;
/** Detect API rate-limit or model-unavailable errors from agent output or errors. */
export declare function isRateLimitOrUnavailableError(message: string): boolean;
//# sourceMappingURL=loop-resilience.d.ts.map