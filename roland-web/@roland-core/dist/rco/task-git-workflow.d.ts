/**
 * Task Git Workflow — per-executor-task branch, commit, push, and draft PR.
 *
 * Runs automatically from team-orchestrator on executor (coding-lane) tasks.
 * Respects `.roland/config.json` and env vars; fails gracefully with [GIT] logs.
 */
import type { Blackboard } from './blackboard.js';
import type { CommandBlackboard } from './command-blackboard.js';
import type { TeamTask } from './team-orchestrator.js';
export type TaskGitPhase = 'branch_created' | 'committed' | 'pushed' | 'pr_opened' | 'skipped' | 'failed';
export interface TaskGitInfo {
    branch?: string;
    phase?: TaskGitPhase;
    statusLabel?: string;
    prUrl?: string;
    prNumber?: number;
    error?: string;
}
export interface GitWorkflowConfig {
    enabled: boolean;
    createDraftPr: boolean;
    githubToken?: string;
    githubOwner?: string;
    githubRepo?: string;
}
export interface TaskGitWorkflowOptions {
    stateDir: string;
    projectRoot: string;
    goal: string;
    runId: string;
    blackboard: Blackboard;
    commandBoard: CommandBlackboard;
    missionUrl?: string;
}
export declare function loadGitWorkflowConfig(stateDir: string): GitWorkflowConfig;
/** True for coding-lane agents that implement changes (not test-only roles). */
export declare function isExecutorAgent(agent: string): boolean;
export declare function shortTaskId(taskId: string): string;
export declare function slugifyTitle(title: string): string;
export declare function buildTaskBranchName(taskId: string, title: string): string;
interface TaskGitStore {
    updatedAt: number;
    runId: string;
    tasks: Record<string, TaskGitInfo>;
}
export declare function readTaskGitPayload(stateDir: string): TaskGitStore;
export declare class TaskGitWorkflow {
    private readonly opts;
    private readonly cfg;
    constructor(opts: TaskGitWorkflowOptions);
    getConfig(): GitWorkflowConfig;
    private persist;
    private postBlackboard;
    /** Create and checkout task branch before the executor agent runs. */
    onTaskStart(task: TeamTask): TaskGitInfo;
    /** Commit, push, and optionally open a draft PR after a successful executor task. */
    onTaskComplete(task: TeamTask, startInfo?: TaskGitInfo): Promise<TaskGitInfo>;
    private createDraftPr;
}
export {};
//# sourceMappingURL=task-git-workflow.d.ts.map