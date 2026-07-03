/**
 * CommandBlackboard — UNSC-style structured mission state for Roland orchestration.
 *
 * Evolves `.roland/memory.md` into a human-readable battlespace picture while
 * preserving machine-readable `blackboard.json` for the PM team orchestrator.
 *
 * File: `.roland/command-blackboard.md`
 *
 * Sections:
 *   Mission Objectives   — current goal, success criteria, priority
 *   Key Decisions        — dated decisions with rationale (shared across agents)
 *   Active Tasks         — task id, callsign, status, depends-on
 *   Agent Status         — per-callsign state (idle | active | blocked | complete)
 *   Open Intel           — unknowns, research questions, blockers awaiting intel
 *   Artifacts            — branches, PRs, files, run IDs
 *   Agent Logs           — per-callsign mission logs (append-only subsections)
 *
 * Lifecycle mirrors ProjectMemory:
 *   1. Roland reads snapshot at mission start (smart recall by keyword overlap)
 *   2. Sub-agents append to their Agent Log on completion
 *   3. Roland merges Key Decisions + Active Tasks after each wave
 *   4. Synthesis archives completed missions to memory.md Proven Patterns
 */
export declare const COMMAND_BLACKBOARD_FILE = "command-blackboard.md";
export declare const BLACKBOARD_SECTIONS: readonly ["Mission Objectives", "Key Decisions", "Active Tasks", "Mission Graph", "Agent Status", "Open Intel", "Artifacts", "Agent Logs"];
export type BlackboardSection = (typeof BLACKBOARD_SECTIONS)[number];
/** Callsign roster for Agent Status and Agent Logs subsections. */
export declare const UNSC_CALLSIGNS: readonly ["Roland", "Sparrow", "Vanguard", "Oracle", "Sentinel", "Forge", "Specter"];
export type Callsign = (typeof UNSC_CALLSIGNS)[number];
export type AgentState = 'idle' | 'active' | 'blocked' | 'complete';
export interface MissionObjective {
    id: string;
    title: string;
    priority: 'P1' | 'P2' | 'P3' | 'P4';
    successCriteria: string[];
    status: 'active' | 'complete' | 'cancelled';
}
export interface ActiveTaskEntry {
    id: string;
    callsign: Callsign;
    title: string;
    status: 'pending' | 'in_progress' | 'blocked' | 'done';
    dependsOn: string[];
    priority: 'P1' | 'P2' | 'P3' | 'P4';
}
export interface AgentStatusEntry {
    callsign: Callsign;
    state: AgentState;
    currentTaskId?: string;
    lastUpdated: number;
    note?: string;
}
/** Per-callsign log subsection headers inside Agent Logs. */
declare const AGENT_LOG_HEADER_RE: RegExp;
export declare class CommandBlackboard {
    private readonly filePath;
    constructor(stateDir?: string);
    /** Full markdown snapshot for prompt injection. */
    snapshot(maxChars?: number): string;
    /** Keyword-scored excerpt for planning prompts (mirrors ProjectMemory.smartSnapshot). */
    smartSnapshot(goal: string, maxChars?: number): string;
    /** Replace section bullets in one write (used by board cleanup). */
    replaceSections(sections: Partial<Record<BlackboardSection, string[]>>): void;
    /** Read parsed sections for programmatic cleanup. */
    readSections(): Partial<Record<BlackboardSection, string[]>>;
    /** Append a bullet to any section. */
    appendBullet(section: BlackboardSection, bullet: string): void;
    /** Append timestamped entry to a callsign's Agent Log subsection. */
    appendAgentLog(callsign: Callsign, entry: string): void;
    /** Replace Mission Graph section with current DAG summary (single bullet). */
    setMissionGraph(summary: string): void;
    /** Update Agent Status table row for a callsign. */
    setAgentStatus(entry: AgentStatusEntry): void;
    /** Parse ## Memory Extract block from synthesis output (Roland PM phase). */
    extractAndMerge(extractBlock: string): number;
}
export declare function buildEmptyTemplate(): string;
declare function tokenize(text: string): Set<string>;
declare function tokenOverlap(a: Set<string>, b: Set<string>): number;
declare function isGoalRelevant(text: string, goalTokens: Set<string>): boolean;
export { AGENT_LOG_HEADER_RE, isGoalRelevant, tokenize, tokenOverlap };
//# sourceMappingURL=command-blackboard.d.ts.map