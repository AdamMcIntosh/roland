/**
 * RCO Blackboard — shared persistent state for the PM agent team.
 *
 * The Blackboard is the team's single source of truth: tasks, decisions,
 * artifacts, blockers, and results all live here. Every agent can read it;
 * only the Lead PM and the orchestrator write to it directly (workers post
 * results that are then written by the orchestrator on their behalf).
 *
 * Persistence: `.roland/blackboard.json` in the project directory.
 * All mutations are rev-stamped for lightweight optimistic concurrency.
 */
export type EntryType = 'task' | 'decision' | 'artifact' | 'blocker' | 'result';
export type EntryStatus = 'pending' | 'in_progress' | 'blocked' | 'done' | 'archived';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export interface BlackboardEntry {
    id: string;
    type: EntryType;
    title: string;
    content: string;
    status: EntryStatus;
    author: string;
    assignee?: string;
    priority: Priority;
    tags: string[];
    relatedIds: string[];
    rev: number;
    createdAt: number;
    updatedAt: number;
}
export type BlackboardFilter = Partial<Pick<BlackboardEntry, 'type' | 'status' | 'assignee' | 'author'>>;
export type NewEntry = Omit<BlackboardEntry, 'id' | 'rev' | 'createdAt' | 'updatedAt'>;
export declare class Blackboard {
    private readonly filePath;
    private entries;
    constructor(stateDir?: string);
    private load;
    private save;
    post(entry: NewEntry): BlackboardEntry;
    patch(id: string, updates: Partial<Omit<BlackboardEntry, 'id' | 'rev' | 'createdAt'>>): BlackboardEntry | null;
    archive(id: string): BlackboardEntry | null;
    get(id: string): BlackboardEntry | undefined;
    read(filter?: BlackboardFilter): BlackboardEntry[];
    /**
     * Human-readable snapshot of active entries (non-archived).
     * Injected into every agent prompt so agents share situational awareness.
     */
    snapshot(): string;
}
//# sourceMappingURL=blackboard.d.ts.map