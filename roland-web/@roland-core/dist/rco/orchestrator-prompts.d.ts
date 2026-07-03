/**
 * Roland Orchestrator prompts — Cursor SDK supervisor persona with UNSC military loop.
 *
 * Used by:
 *   - `.cursor/rules/roland.mdc` (interactive Cursor chat)
 *   - `roland_hello` MCP welcome payload
 *   - SDK orchestration scripts (`scripts/roland-orchestrate.mjs`)
 */
import type { AgentYaml } from './types.js';
export interface OrchestratorContext {
    goal?: string;
    commandBlackboard?: string;
    projectMemory?: string;
    roster?: AgentYaml[];
}
/**
 * Full system prompt for Roland as Cursor SDK orchestrator with sub-agent delegation.
 */
export declare function buildRolandOrchestratorPrompt(ctx?: OrchestratorContext): string;
/** Synthesis extract format Roland writes after mission complete. */
export declare function buildCommandBlackboardExtractPrompt(): string;
//# sourceMappingURL=orchestrator-prompts.d.ts.map