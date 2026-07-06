/**
 * ## Project Context & Agent Dispatch Fix
 *
 * Mission state isolation — per-project cleanup, archival, and stale-file hygiene.
 *
 * Used by the dashboard server and CLI to prevent mission context bleeding
 * across project switches and to retire dead supervisor / run-state artifacts.
 */
export declare const MISSION_META_FILE = "mission-meta.json";
export declare const SUPERVISOR_PID_FILE = "supervisor.pid";
export declare const RUN_STATE_FILE = "run-state.json";
export declare const MISSION_ARCHIVE_FILE = "mission-archive.jsonl";
export type StateLogger = (msg: string, detail?: Record<string, unknown>) => void;
/** How the mission was launched — surfaced on dashboard live panels. */
export type MissionTriggeredVia = 'mcp' | 'cli' | 'dashboard' | 'cursor';
export interface MissionMetaRecord {
    id?: string;
    goal?: string;
    effectiveGoal?: string;
    runName?: string | null;
    status?: 'active' | 'archived' | 'completed';
    startedAt?: number;
    archivedAt?: number;
    archiveReason?: string;
    pid?: number | null;
    projectRoot?: string;
    stateDir?: string;
    updatedAt?: number;
    /** Launch channel — MCP/Hermes, CLI, dashboard fallback, or Cursor @roland. */
    triggeredVia?: MissionTriggeredVia;
    [key: string]: unknown;
}
export type MissionStateChangeListener = (stateDir: string, reason: string) => void;
/** Dashboard / HTTP MCP hooks — notified when mission-meta is written. */
export declare function onMissionStateChange(listener: MissionStateChangeListener): () => void;
export interface SupervisorRecord {
    pid: number;
    goal?: string;
    startedAt?: number;
    logFile?: string;
    restarts?: number;
}
export interface RunStateRecord {
    runId?: string;
    goal?: string;
    status?: string;
    startedAt?: number;
    updatedAt?: number;
    [key: string]: unknown;
}
export interface SanitizeResult {
    changed: boolean;
    actions: string[];
}
export interface IsolateResult extends SanitizeResult {
    archived: boolean;
}
export interface CleanupPreviousRunsResult {
    sanitized: SanitizeResult;
    metaArchived: boolean;
    boardCleanup?: unknown;
    loopArtifactsReset?: boolean;
    hitlReset?: boolean;
}
/** Remove loop checkpoint + loop-state so a new mission does not inherit prior gate failures. */
export declare function resetLoopArtifactsForNewMission(stateDir: string, log?: StateLogger): boolean;
/** Clear HITL queue/state from a prior mission so new runs start unpaused. */
export declare function resetHitlStateForNewMission(stateDir: string, log?: StateLogger): boolean;
/**
 * Full mission-start hygiene — sanitize stale PIDs, archive prior meta,
 * reset loop artifacts, clear HITL, and clean command boards.
 */
export declare function prepareMissionStart(stateDir: string, goal: string, options?: {
    dryRun?: boolean;
    skipBoardCleanup?: boolean;
    projectRoot?: string;
}, log?: StateLogger): CleanupPreviousRunsResult;
export declare function isProcessAlive(pid: number): boolean;
export declare function readMissionMetaFile(stateDir: string): MissionMetaRecord | null;
export declare function writeMissionMetaFile(stateDir: string, meta: MissionMetaRecord): void;
export declare function readSupervisorRecord(stateDir: string): SupervisorRecord | null;
export declare function readRunStateRecord(stateDir: string): RunStateRecord | null;
export declare function isSupervisorAlive(stateDir: string): boolean;
export declare function isRunStateActive(stateDir: string, now?: number): boolean;
/** Mission meta is active only when not archived and supervisor or run-state is live. */
export declare function isMissionMetaActive(meta: MissionMetaRecord | null, stateDir: string): boolean;
/** Return mission-meta only when it represents a live mission in this state dir. */
export declare function readActiveMissionMeta(stateDir: string): MissionMetaRecord | null;
export declare function archiveMissionMeta(stateDir: string, reason: string, log?: StateLogger): boolean;
/**
 * Remove dead supervisor PID files and retire stale active run-state / mission-meta.
 */
export declare function sanitizeStaleMissionState(stateDir: string, log?: StateLogger, now?: number): SanitizeResult;
/**
 * On project switch / create (no migration): archive non-active mission context
 * in the target project so prior missions do not bleed into the UI.
 */
export declare function isolateProjectMissionState(stateDir: string, log?: StateLogger): IsolateResult;
/**
 * Before starting a fresh mission: sanitize stale artifacts and archive prior mission-meta.
 */
export declare function cleanupPreviousRuns(stateDir: string, goal: string, options?: {
    dryRun?: boolean;
    resetLoopArtifacts?: boolean;
    resetHitlState?: boolean;
    runBoardCleanup?: (stateDir: string, missionGoal: string) => unknown;
}, log?: StateLogger): CleanupPreviousRunsResult;
/**
 * Run-state payload for dashboard clients — null when inactive or stale.
 * Supervisor liveness keeps run-state visible during slow planning / restarts.
 */
export declare function readActiveRunStateForClient(stateDir: string, now?: number): RunStateRecord | null;
export interface WaitForSupervisorOptions {
    timeoutMs?: number;
    pollIntervalMs?: number;
}
export interface WaitForSupervisorResult {
    ready: boolean;
    record: SupervisorRecord | null;
    waitedMs: number;
    error?: string;
}
/**
 * Poll until supervisor.pid exists with a live PID, or timeout.
 * Call after spawning `roland team --background` before writing mission-meta.
 */
export declare function waitForSupervisorReady(stateDir: string, options?: WaitForSupervisorOptions): Promise<WaitForSupervisorResult>;
export interface SupervisorStartDiagnostics {
    message: string;
    logFile: string | null;
    logTail: string;
    hints: string[];
}
/** Operator-actionable context when background supervisor fails to start. */
export declare function buildSupervisorStartDiagnostics(stateDir: string, context?: string): SupervisorStartDiagnostics;
/**
 * ## Project Context Switching and Agent Dispatch Fixed
 *
 * prepareMissionStart pins ROLAND_PROJECT_ROOT, ROLAND_STATE_DIR, and chdirs workers.
 * Test: npx vitest run tests/unit/mission-state.test.ts tests/integration/mcp-mission-project-context.test.ts
 */
//# sourceMappingURL=mission-state.d.ts.map