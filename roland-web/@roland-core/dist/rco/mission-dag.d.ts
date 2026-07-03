/**
 * Mission DAG — directed acyclic graph model for Roland team missions.
 *
 * Inspired by Cursor Cookbook DAG Task Runner patterns: explicit nodes,
 * dependency edges, parallel-ready scheduling, critical-path visibility,
 * and JSON export for dashboard graph visualization.
 *
 * Backward-compatible: flat task plans (dependsOn only) are normalized
 * into a DAG automatically; DAG planning prompts are opt-in via env or
 * goal complexity heuristics.
 */
import type { ReviewTask } from './pm-prompts.js';
export declare const MISSION_DAG_FILE = "mission-dag.json";
export type MissionNodeStatus = 'pending' | 'ready' | 'in_progress' | 'blocked' | 'done' | 'skipped';
export type MissionPlanningMode = 'flat' | 'dag';
export interface MissionNode {
    id: string;
    title: string;
    agent: string;
    description: string;
    dependsOn: string[];
    priority: string;
    status: MissionNodeStatus;
    /** Wave number when this node was dispatched (1-based). */
    wave?: number;
    startedAt?: number;
    completedAt?: number;
    hadBlocker?: boolean;
    metadata?: Record<string, unknown>;
}
export interface MissionEdge {
    from: string;
    to: string;
}
export interface MissionDagSnapshot {
    version: 1;
    goal: string;
    runId: string;
    planningMode: MissionPlanningMode;
    nodes: MissionNode[];
    edges: MissionEdge[];
    /** Longest dependency chain — drives minimum mission duration. */
    criticalPath: string[];
    activeNodeIds: string[];
    blockedNodeIds: string[];
    completedNodeIds: string[];
    progress: {
        total: number;
        done: number;
        blocked: number;
        pending: number;
        inProgress: number;
    };
    createdAt: number;
    updatedAt: number;
    dagNotes?: string;
}
/** Heuristic: goals with multiple deliverables benefit from explicit DAG planning. */
export declare function isComplexGoalForDag(goal: string): boolean;
/**
 * Resolve whether the Lead PM should receive DAG planning instructions.
 * ROLAND_MISSION_DAG=1 forces on; =0 forces off; unset auto-detects.
 */
export declare function isDagPlanningEnabled(goal: string, env?: NodeJS.ProcessEnv): boolean;
export declare function buildEdgesFromTasks(tasks: Array<{
    id: string;
    dependsOn: string[];
}>): MissionEdge[];
/** Return node ids participating in a cycle, or [] if acyclic. */
export declare function detectCycle(nodeIds: string[], edges: MissionEdge[]): string[];
/**
 * Longest path in a DAG (by hop count). Used as critical-path approximation
 * when per-node duration estimates are unavailable.
 */
export declare function computeCriticalPath(nodeIds: string[], edges: MissionEdge[]): string[];
export declare function tasksToNodes(tasks: ReviewTask[], planningMode: MissionPlanningMode): MissionNode[];
export declare function getReadyNodeIds(nodes: MissionNode[], completedIds: Set<string>): string[];
export declare function summarizeProgress(nodes: MissionNode[]): MissionDagSnapshot['progress'];
export declare function buildMissionDagSnapshot(params: {
    goal: string;
    runId: string;
    planningMode: MissionPlanningMode;
    nodes: MissionNode[];
    dagNotes?: string;
    createdAt?: number;
}): MissionDagSnapshot;
/** Compact markdown block for Command Blackboard and worker prompts. */
export declare function formatMissionGraphSummary(snapshot: MissionDagSnapshot): string;
/** Per-task DAG context for Sparrow / Vanguard worker prompts. */
export declare function formatNodeDagContext(snapshot: MissionDagSnapshot, taskId: string): string;
export declare class MissionDagStore {
    private readonly filePath;
    private snapshot;
    constructor(stateDir: string, initial?: MissionDagSnapshot);
    static fromPlan(params: {
        stateDir: string;
        goal: string;
        runId: string;
        tasks: ReviewTask[];
        planningMode: MissionPlanningMode;
        dagNotes?: string;
    }): MissionDagStore;
    getSnapshot(): MissionDagSnapshot;
    save(): void;
    exportJson(): string;
    addNodes(tasks: ReviewTask[]): void;
    markInProgress(taskId: string, wave: number): void;
    markDone(taskId: string, hadBlocker?: boolean): void;
    markBlocked(taskId: string): void;
    refreshReadyStates(completedIds: Set<string>): void;
    private updateNode;
    private rebuildGraphMeta;
}
//# sourceMappingURL=mission-dag.d.ts.map