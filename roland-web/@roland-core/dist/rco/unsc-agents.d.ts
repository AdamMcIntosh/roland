/**
 * UNSC sub-agent loader — maps agents/unsc/*.yaml to Cursor SDK AgentDefinition records.
 *
 * Used by team-orchestrator and standalone SDK orchestration scripts to register
 * inline sub-agents on Agent.create({ agents: { ... } }).
 */
import type { AgentYaml } from './types.js';
/** Cursor SDK AgentDefinition shape (subset we populate). */
export interface SdkAgentDefinition {
    description: string;
    prompt: string;
    model?: 'inherit' | {
        id: string;
    };
}
export interface UnscAgentYaml extends AgentYaml {
    callsign?: string;
    designation?: string;
    spawn_when?: string;
    legacy_aliases?: string[];
}
/**
 * Resolve agents/unsc/ relative to install dir or project root.
 */
export declare function resolveUnscAgentsDir(referenceUrl?: string): string;
/** Load all UNSC agent YAML files. */
export declare function loadUnscAgents(agentsDir?: string): Map<string, UnscAgentYaml>;
/** Build SDK `agents` map keyed by callsign slug (lowercase). */
export declare function toSdkAgentDefinitions(unscAgents: Map<string, UnscAgentYaml>): Record<string, SdkAgentDefinition>;
/** Map legacy roster agent names → UNSC callsign for PM team compatibility. */
export declare function legacyAgentToCallsign(agentName: string): string;
//# sourceMappingURL=unsc-agents.d.ts.map