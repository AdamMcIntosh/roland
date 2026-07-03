/**
 * ## Assumptions
 * - Pure ClosedLoop is the default Plan path (lightweight-plan-act.ts).
 * - [DEPRECATED] LoopPmBridge is only injected when legacy PM Team is explicitly opted in (`use_pm_team: true`).
 */
import type { LoopPmBridge } from '../pm-integration.js';
import type { LightweightPlanActContext } from '../lightweight-plan-act.js';
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
export interface PlanPhaseHandlerOptions {
    /** [DEPRECATED] Legacy PM Team — only set when use_pm_team opt-in is active. */
    pmBridge?: LoopPmBridge;
    lightweight?: LightweightPlanActContext;
}
export declare class PlanPhaseHandler implements PhaseHandler {
    readonly phase: "plan";
    private readonly pmBridge?;
    private readonly lightweight?;
    constructor(opts?: PlanPhaseHandlerOptions);
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
//# sourceMappingURL=plan.d.ts.map