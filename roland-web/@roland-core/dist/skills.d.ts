/**
 * RCO Skills — eco-optimizer, graph-visualizer, and related helpers.
 * Used by orchestrator and agent worker to switch models and generate DOT for dashboard.
 */
import type { RcoState } from './rco/types.js';
/** Default DeepSeek model id; Haiku for simple steps */
export declare const ECO_MODELS: {
    readonly local: "claude-3-haiku-20240307";
    readonly simple: "claude-3-haiku-20240307";
    readonly medium: "deepseek/deepseek-v3-0324";
    readonly complex: "deepseek/deepseek-v3-0324";
};
/**
 * Eco-optimizer: suggest Claude model from prompt length and complexity.
 * Use Haiku for short/simple steps to reduce token usage.
 */
export declare function ecoOptimizerSuggestModel(promptOrStepInput: string, defaultModel?: string): string;
/**
 * Graph-visualizer: generate DOT string for agent handoffs from state and workflow steps.
 * Export to dashboard for dependency visualization.
 */
export declare function graphVisualizerDOT(state: RcoState, workflowSteps: Array<{
    agent: string;
    output_to?: string;
}>): string;
/** Zod-friendly DOT line validator: basic sanity check for DOT output */
export declare function isValidDOT(dot: string): boolean;
//# sourceMappingURL=skills.d.ts.map