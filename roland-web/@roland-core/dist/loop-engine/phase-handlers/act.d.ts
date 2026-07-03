/**
 * ## Assumptions
 * - Pure ClosedLoop is the default Act path (lightweight-plan-act.ts).
 * - [DEPRECATED] LoopPmBridge is only injected when legacy PM Team is explicitly opted in (`use_pm_team: true`).
 */
import type { LoopPmBridge } from '../pm-integration.js';
import type { LightweightPlanActContext } from '../lightweight-plan-act.js';
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
export interface ActPhaseHandlerOptions {
    /** [DEPRECATED] Legacy PM Team — only set when use_pm_team opt-in is active. */
    pmBridge?: LoopPmBridge;
    lightweight?: LightweightPlanActContext;
}
export declare class ActPhaseHandler implements PhaseHandler {
    readonly phase: "act";
    private readonly pmBridge?;
    private readonly lightweight?;
    constructor(opts?: ActPhaseHandlerOptions);
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
//# sourceMappingURL=act.d.ts.map