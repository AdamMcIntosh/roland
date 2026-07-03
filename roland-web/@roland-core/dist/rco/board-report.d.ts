/**
 * ## CLI-First Simplification
 *
 * UNSC board status — human-readable summary of blackboard + command blackboard.
 * Primary CLI: `roland board-status [--concise|--json]`. MCP: `board_status`.
 *
 * ## Dashboard Demoted — CLI + Hermes Primary Complete
 */
import { type BlackboardEntry, type EntryStatus, type EntryType } from './blackboard.js';
import { type AgentState, type Callsign } from './command-blackboard.js';
import { type MissionDagSnapshot } from './mission-dag.js';
export interface BoardStatusCounts {
    total: number;
    blockers: number;
    tasks: number;
    inProgress: number;
    done: number;
    byType: Partial<Record<EntryType, number>>;
    byStatus: Partial<Record<EntryStatus, number>>;
}
export interface CallsignRosterEntry {
    callsign: Callsign;
    state: AgentState;
    currentTaskId?: string;
    note?: string;
}
export interface BoardStatusReport {
    stateDir: string;
    runActive: boolean;
    goal?: string;
    counts: BoardStatusCounts;
    blockers: BlackboardEntry[];
    activeTasks: BlackboardEntry[];
    roster: CallsignRosterEntry[];
    missionObjective?: string;
    /** One-line Mission Graph summary from command-blackboard.md */
    missionGraph?: string;
    /** Parsed mission DAG export when present on disk */
    missionDag?: MissionDagSnapshot | null;
    openIntel: string[];
    blackboardSnapshot: string;
    commandBlackboardSnapshot: string;
}
/** Parse Agent Status bullets from command-blackboard.md content. */
export declare function parseCallsignRoster(content: string): CallsignRosterEntry[];
export declare function buildBoardStatusReport(stateDir?: string, goalHint?: string): BoardStatusReport;
/**
 * Compact UNSC-style summary for chat responses, run endings, and dashboard cards.
 * Target: ~12–18 lines, blockers-first.
 */
export declare function formatConciseUnscSummary(report: BoardStatusReport): string;
export declare function formatBoardStatusReport(report: BoardStatusReport, opts?: {
    mode?: 'verbose' | 'concise';
}): string;
export declare function printBoardStatus(stateDir?: string, opts?: {
    json?: boolean;
    goal?: string;
    concise?: boolean;
}): void;
//# sourceMappingURL=board-report.d.ts.map