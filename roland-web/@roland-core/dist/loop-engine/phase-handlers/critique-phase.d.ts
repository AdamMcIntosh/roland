/**

 * ## P1 Honesty & Consolidation

 *

 * Critique phase — analyzes verification results and phase history, decides retry/escalate.

 *

 * Rule-based structured critique (no LLM). Lane metadata (critic vs coding) is retained

 * for routing context only — not presented as an invoked model.

 */
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { type CritiqueEngineOptions } from '../self-improvement/critique-engine.js';
import type { CritiqueModel } from '../self-improvement/types.js';
export interface CritiquePhaseHandlerOptions extends CritiqueEngineOptions {
}
export declare class CritiquePhaseHandler implements PhaseHandler {
    readonly phase: "critique";
    private readonly engine;
    constructor(opts?: CritiquePhaseHandlerOptions);
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
/** Honest display label — rule-based critique with lane metadata for routing context. */
export declare function critiqueModelLabel(lane: CritiqueModel): string;
//# sourceMappingURL=critique-phase.d.ts.map