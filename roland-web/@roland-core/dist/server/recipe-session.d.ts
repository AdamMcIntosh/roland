/**
 * Recipe Session Manager
 *
 * Manages stateful recipe execution sessions where the IDE (Cursor/VS Code)
 * drives each step. Instead of making server-side LLM calls, the server:
 *   1. Parses the recipe YAML
 *   2. Returns each step's prompt + system prompt to the IDE
 *   3. Accepts the IDE's output for that step
 *   4. Interpolates variables and returns the next step
 *
 * This lets the IDE use its own model while Roland orchestrates the flow,
 * tracks costs, and manages the multi-agent recipe structure.
 */
import type { FileBundle } from '../utils/file-gatherer.js';
export interface SubagentDef {
    name: string;
    prompt: string;
    model?: string;
    provider?: string;
}
export interface RecipeStepDef {
    agent: string;
    input?: string;
    output_to?: string;
    loop_if?: string;
    loop_to?: string;
    final_output?: boolean;
    condition?: string;
}
export interface ParsedRecipe {
    name: string;
    description: string;
    subagents: SubagentDef[];
    steps: RecipeStepDef[];
    options?: Record<string, unknown>;
    settings?: Record<string, unknown>;
}
export interface StepPrompt {
    session_id: string;
    step_number: number;
    total_steps: number;
    agent_name: string;
    system_prompt: string;
    user_prompt: string;
    is_final: boolean;
    recipe_name: string;
    previous_outputs: Record<string, string>;
}
export interface SessionSummary {
    session_id: string;
    recipe_name: string;
    status: 'completed' | 'failed';
    steps_executed: number;
    total_steps: number;
    outputs: Record<string, string>;
    cost: SessionCost;
    duration_ms: number;
}
export interface SessionCost {
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost: number;
    per_step: Array<{
        step: number;
        agent: string;
        input_tokens: number;
        output_tokens: number;
        cost: number;
        model?: string;
    }>;
}
export declare class RecipeSessionManager {
    private sessions;
    private costTracker;
    private readonly SESSION_TTL_MS;
    constructor();
    startSession(recipe: ParsedRecipe, userTask: string, fileBundle?: FileBundle): StepPrompt;
    advanceSession(sessionId: string, stepOutput: string, costData?: {
        input_tokens?: number;
        output_tokens?: number;
        cost?: number;
        model?: string;
    }): StepPrompt | SessionSummary;
    getSessionStatus(sessionId: string): {
        exists: boolean;
        current_step?: number;
        total_steps?: number;
        agent?: string;
        recipe?: string;
    };
    private buildStepPrompt;
    private buildSummary;
    private interpolateVariables;
    private interpolateAgentRefs;
    private normalizeAgentName;
    private generateSessionId;
    private cleanExpiredSessions;
}
//# sourceMappingURL=recipe-session.d.ts.map