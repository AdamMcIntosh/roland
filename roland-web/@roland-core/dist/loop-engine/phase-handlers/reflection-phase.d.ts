/**
 * Reflection phase — captures iteration learnings before the next pass.
 *
 * Writes structured reflections to LoopMemory (reflection.md + state.json).
 */
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import type { LoopMemory } from '../loop-memory.js';
export interface ReflectionPhaseHandlerOptions {
    memory?: LoopMemory;
}
export declare class ReflectionPhaseHandler implements PhaseHandler {
    private readonly opts;
    readonly phase: "reflect";
    constructor(opts?: ReflectionPhaseHandlerOptions);
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
declare function buildReflectionContent(ctx: PhaseHandlerContext): string;
export { buildReflectionContent };
//# sourceMappingURL=reflection-phase.d.ts.map