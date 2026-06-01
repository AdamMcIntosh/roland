/**
 * RCO tool stubs and dependency-mapper / graph-visualizer skills
 */
import type { RcoState } from './types.js';
/** Stub: logs search query and returns mock result */
export declare function stubSearch(query: string): string;
/** Stub: logs code action */
export declare function stubCode(action: string, path?: string): string;
/** Stub: logs terminal command */
export declare function stubTerminal(cmd: string): string;
/**
 * Original RCO skill: generates a DOT graph string for agent handoffs.
 * Used for visualizing workflow and dependencies between agents.
 */
export declare function dependencyMapper(state: RcoState, recipeSteps: Array<{
    agent: string;
    output_to?: string;
}>): string;
export declare function runTool(name: string, arg: string, state?: RcoState, steps?: Array<{
    agent: string;
    output_to?: string;
}>): string;
//# sourceMappingURL=tools.d.ts.map