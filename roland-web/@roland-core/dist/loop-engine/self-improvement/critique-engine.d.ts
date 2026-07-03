/**
 * CritiqueEngine — rule-based structured critique from verification + phase history.
 *
 * Selects critique lane (critic vs coding) and resolves model via ModelRouter.
 * Does not invoke LLMs directly — deterministic analysis for loop reliability.
 */
import { ModelRouter } from '../../models/model-router.js';
import type { CritiqueInput, CritiqueOutput, LoopCritiqueSnapshot } from './types.js';
export interface CritiqueEngineOptions {
    /** Override max retries (template maxRetries takes precedence at handler level). */
    maxRetries?: number;
    modelRouter?: ModelRouter;
}
export declare class CritiqueEngine {
    private readonly opts;
    private readonly router;
    constructor(opts?: CritiqueEngineOptions);
    critique(input: CritiqueInput): CritiqueOutput;
    /** Convenience — returns dashboard/loop-state snapshot. */
    critiqueSnapshot(input: CritiqueInput): LoopCritiqueSnapshot;
}
//# sourceMappingURL=critique-engine.d.ts.map