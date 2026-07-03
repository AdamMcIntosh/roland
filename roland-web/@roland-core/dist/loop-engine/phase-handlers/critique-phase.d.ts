/**
 * Critique phase — analyzes verification results and phase history, decides retry/escalate.
 *
 * Model routing via ModelRouter:
 *   - critic role: high-level / multi-area failures, blockers, architecture
 *   - coding role: code-specific failures (unit, lint, typecheck)
 */
import { ModelRouter } from '../../models/model-router.js';
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { type CritiqueEngineOptions } from '../self-improvement/critique-engine.js';
export interface CritiquePhaseHandlerOptions extends CritiqueEngineOptions {
    modelRouter?: ModelRouter;
}
export declare class CritiquePhaseHandler implements PhaseHandler {
    readonly phase: "critique";
    private readonly engine;
    private readonly router;
    constructor(opts?: CritiquePhaseHandlerOptions);
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
//# sourceMappingURL=critique-phase.d.ts.map