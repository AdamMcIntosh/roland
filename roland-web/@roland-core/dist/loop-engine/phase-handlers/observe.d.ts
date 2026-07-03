import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
export declare class ObservePhaseHandler implements PhaseHandler {
    readonly phase: "observe";
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
//# sourceMappingURL=observe.d.ts.map