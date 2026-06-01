/**
 * RCO agent prompts — builds the instruction sent to each Cursor agent.
 *
 * Format is natural markdown prose. Real Cursor agents respond in structured
 * natural language; the orchestrator passes that text verbatim as context to
 * the next step.
 *
 * Agents are given:
 *   - Their role identity (from agentYaml.role_prompt)
 *   - Team context: overall goal, PM accountability, Blackboard state, team size
 *   - Their specific task and any upstream context
 *   - A dedicated Signaling section (blockers + messages) — placed before
 *     Response Format so it is read, not skimmed
 *
 * Blocker signaling supports two formats:
 *   1. Formal section:  ## 🚨 BLOCKER  (preferred for significant blockers)
 *   2. Inline shorthand: **BLOCKED:** reason  (quick flag mid-response)
 * Both are parsed by worker-signals.ts and surfaced to the PM before the next wave.
 */
import type { AgentYaml } from './types.js';
import type { FileBundle } from '../utils/file-gatherer.js';
export interface ToolCallingPromptInput {
    agentYaml: AgentYaml;
    taskContext: string;
    stepInput?: string;
    stateSummary?: Record<string, unknown>;
    fileBundle?: FileBundle;
    /** Overall team goal — injected as team context so agents know why they're here. */
    teamGoal?: string;
    /** Current Blackboard snapshot — agents can see what colleagues have done. */
    blackboardSnapshot?: string;
    /** Number of agents on the team — gives agents a sense of scale. */
    teamSize?: number;
}
/**
 * Build the instruction prompt sent to a Cursor agent.
 *
 * Section order:
 *   # Your Role          — agent persona (sets identity)
 *   ## Team Context      — goal, PM accountability, blackboard (shared awareness)
 *   ## Your Task         — the specific task for this step
 *   ## Output from Previous Agent — upstream handoff (if any)
 *   ## Project Files     — relevant file excerpts (if gathered)
 *   ## Capabilities      — tools the agent should apply
 *   ## How to Signal     — blocker + message protocol (before Response Format so it's read)
 *   ## Response Format   — how to structure the reply
 */
export declare function buildClaudeToolCallingPrompt(input: ToolCallingPromptInput): string;
//# sourceMappingURL=prompts.d.ts.map