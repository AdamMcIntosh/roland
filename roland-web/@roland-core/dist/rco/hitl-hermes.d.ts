/**
 * ## CLI-First Simplification
 *
 * Single source of truth for mission status bubbling to Hermes (Master Chief).
 * CLI: `roland status`, `roland live`, `roland hitl-status`, `roland mission-summary`, `roland hitl-events`.
 * MCP: `hitl_status`, `poll_hitl_events`, `mission_summary`, `board_status`.
 *
 * ## Dashboard Demoted — CLI + Hermes Primary Complete
 */
export declare const HERMES_HITL_EVENTS_FILE = "hermes-hitl-events.jsonl";
export declare const HERMES_MISSION_COMPLETION_FILE = "hermes-mission-completion.json";
export type HermesHitlEventKind = 'hitl-pause' | 'hitl-abort-pending' | 'git-commit-approval' | 'verification-failure' | 'loop-escalation' | 'blocker' | 'verification-gate' | 'mission-complete';
export type MissionFinalStatus = 'completed' | 'failed' | 'escalated' | 'blocked' | 'aborted';
export interface MissionCompletionReport {
    id: string;
    timestamp: number;
    runId?: string;
    missionId?: string;
    goal: string;
    finalStatus: MissionFinalStatus;
    /** Phase success rate 0–100 from loop metrics when available. */
    successRate: number;
    deliverables: string[];
    blockers: string[];
    nextRecommendedAction: string;
    suggestedActions: string[];
    /** Master Chief one-liner for operator reporting. */
    summary: string;
    wavesRun: number;
    blockersEncountered: number;
    loop?: {
        status: string;
        iteration: number;
        retryCount: number;
        templateId?: string;
        verificationPass?: boolean | null;
        confidence?: number | null;
    };
    durationMs?: number;
}
/** Minimal team result shape — avoids circular import from team-orchestrator. */
export interface HermesTeamCompletionInput {
    goal: string;
    synthesis: string;
    wavesRun: number;
    blockersEncountered: number;
}
export interface HermesHitlEvent {
    id: string;
    timestamp: number;
    kind: HermesHitlEventKind;
    missionId?: string;
    goal?: string;
    /** Human-readable blocker / escalation description. */
    blockerDescription: string;
    /** Current gate or phase where the mission is stuck. */
    currentGate: string;
    /** Copy-paste operator commands. */
    suggestedActions: string[];
    /** Optional structured detail for Hermes tooling. */
    detail?: Record<string, unknown>;
}
export interface HitlStatusReport {
    stateDir: string;
    missionId?: string;
    goal?: string;
    runActive: boolean;
    /** True when operator action is required before the mission can proceed. */
    waitingOnHitl: boolean;
    hitlReason?: string;
    currentGate?: string;
    blockerDescription?: string;
    suggestedActions: string[];
    hitl: {
        paused: boolean;
        abortPending: boolean;
        queueLength: number;
    };
    loop?: {
        status: string;
        phase: string | null;
        iteration: number;
        retryCount: number;
        lastVerificationPass: boolean | null;
        confidence: number | null;
        lastCritiqueDecision: string | null;
    };
    gitCommitApproval?: {
        id: string;
        message: string;
        status: string;
        expiresAt: number;
    } | null;
    blockers: Array<{
        id: string;
        title: string;
        content: string;
    }>;
    /** Latest terminal mission outcome — same snapshot as mission_summary MCP tool. */
    missionCompletion?: MissionCompletionReport | null;
    updatedAt: number;
}
export type HitlHermesEventListener = (stateDir: string, event: HermesHitlEvent) => void;
/** Subscribe to HITL events for dashboard WebSocket push / MCP live sync. */
export declare function onHitlHermesEvent(listener: HitlHermesEventListener): () => void;
/** Append a structured HITL event and notify Hermes subscribers. */
export declare function emitHermesHitlEvent(stateDir: string, partial: Omit<HermesHitlEvent, 'id' | 'timestamp'>): HermesHitlEvent;
/** Master Chief one-liner for terminal mission outcomes. */
export declare function formatHermesMissionCompleteSummary(report: MissionCompletionReport): string;
/** Build a structured completion report from on-disk mission state. */
export declare function buildMissionCompletionReport(stateDir: string, overrides: Partial<MissionCompletionReport> & {
    goal: string;
}): MissionCompletionReport;
/** Read the latest mission completion snapshot (if any). */
export declare function readMissionCompletionReport(stateDir: string): MissionCompletionReport | null;
/** Persist completion snapshot and push mission-complete event to Hermes subscribers. */
export declare function emitHermesMissionComplete(stateDir: string, report: MissionCompletionReport): MissionCompletionReport;
/** Notify Hermes after a team / closed-loop mission finishes successfully. */
export declare function notifyHermesMissionCompleteFromTeamResult(stateDir: string, result: HermesTeamCompletionInput): MissionCompletionReport;
/** Notify Hermes when a mission throws before returning a TeamResult. */
export declare function notifyHermesMissionFailed(stateDir: string, goal: string, error: unknown): MissionCompletionReport;
/** Markdown report for Hermes / MCP mission_summary tool. */
export declare function formatMissionCompleteMarkdown(report: MissionCompletionReport): string;
/** Read HITL events newer than `since` (epoch ms). Newest last. */
export declare function pollHermesHitlEvents(stateDir: string, since?: number, limit?: number): HermesHitlEvent[];
/** Build aggregated HITL status for Hermes / dashboard / CLI. */
export declare function buildHitlStatusReport(stateDir: string): HitlStatusReport;
/** Master Chief one-liner — e.g. "Mission blocked at verification gate — awaiting operator input on git-commit". */
export declare function formatHermesHitlSummary(report: HitlStatusReport): string;
/** Markdown report for Hermes / MCP hitl_status tool. */
export declare function formatHitlStatusMarkdown(report: HitlStatusReport): string;
//# sourceMappingURL=hitl-hermes.d.ts.map