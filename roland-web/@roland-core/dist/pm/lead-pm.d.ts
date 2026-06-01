/**
 * LeadPM — the single facade the MCP server holds for the PM control loop.
 *
 * Composes the Phase 1 substrate (Blackboard + MessageBus via CoordinationManager)
 * with the Phase 2 TaskBoard + Roster. It builds the dispatch packets the host
 * uses to launch engineers, sends the bus notifications that keep everyone in
 * sync, and assembles the get_team_context digest whose needsAttention heuristics
 * always surface blockers first — enforcing "unblock before new work".
 */
import type { CoordinationManager } from '../coordination/index.js';
import type { BlackboardEntry } from '../coordination/types.js';
import { Roster } from './roster.js';
import { TeamRecipes } from './team-recipes.js';
import { type Lane, type ModelPolicy } from './model-policy.js';
import { PMEventLog, type PMEvent, type PMEventAction } from './event-log.js';
import { type AdvancedCostTracker } from '../orchestrator/advanced-cost-tracker.js';
import { DispatchPacket, TaskView, TeamContext, TeamUsage } from './types.js';
export interface LeadPMOptions {
    stallMs?: number;
    roster?: Roster;
    recipes?: TeamRecipes;
    tracker?: AdvancedCostTracker;
    eventLog?: PMEventLog;
    /** Cursor model overrides (config pm: section). */
    policy?: ModelPolicy;
    /** Per-engineer lane overrides (config pm.lane_overrides). */
    laneOverrides?: Record<string, Lane>;
}
export declare class LeadPM {
    private readonly board;
    private readonly bus;
    private readonly tasks;
    private readonly roster;
    private readonly router;
    private readonly recipes;
    private readonly tracker;
    private readonly events;
    private readonly stallMs;
    constructor(coordination: CoordinationManager, opts?: LeadPMOptions);
    private logEvent;
    /** Reverse-chronological PM event timeline (Phase 4 observability). */
    getPmEvents(limit?: number, filter?: {
        action?: PMEventAction;
        taskKey?: string;
    }): PMEvent[];
    /** The morning-standup view: rendered Markdown plus the structured context. */
    getStandup(): {
        markdown: string;
        context: TeamContext;
    };
    getPlaybook(): {
        playbook: string;
        version: string;
    };
    listTeam(): Array<{
        name: string;
        specialty: string;
        lane: Lane;
        model: string;
        rationale: string;
        tools: string[];
    }>;
    spawnTask(input: {
        slug: string;
        title: string;
        description: string;
        assignee?: string;
        dependsOn?: string[];
        priority?: TaskView['value']['priority'];
        acceptanceCriteria?: string;
        author?: string;
    }): Promise<{
        task: TaskView;
        dispatch: DispatchPacket;
    }>;
    assignTask(input: {
        taskKey: string;
        assignee: string;
        author?: string;
    }): Promise<{
        task: TaskView;
        dispatch: DispatchPacket;
    }>;
    markBlocked(input: {
        taskKey: string;
        need: string;
        raisedBy: string;
        slug?: string;
    }): {
        task: TaskView;
        blocker: {
            key: string;
            need: string;
        };
    };
    unblockTask(input: {
        taskKey: string;
        blockerKey: string;
        resolution: string;
        author?: string;
    }): {
        task: TaskView;
    };
    completeTask(input: {
        taskKey: string;
        summary: string;
        content?: string;
        author: string;
        slug?: string;
        /** Optional Cursor usage to attribute in the same call (report_usage shortcut). */
        model?: string;
        inputTokens?: number;
        outputTokens?: number;
    }): {
        task: TaskView;
        artifactKey: string;
        usage?: TaskView['value']['usage'];
    };
    /**
     * Attribute Cursor token usage to a task + engineer. Cost is computed via
     * ModelRouter.estimateCost, which returns 0 for Cursor/subscription models —
     * so this records *usage* (tokens/requests), not dollars, and never touches
     * the legacy OpenRouter budget.
     */
    recordUsage(input: {
        taskKey: string;
        engineer: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
    }): {
        taskUsage: TaskView['value']['usage'];
        teamUsage: TeamUsage;
    };
    /** Cursor usage attribution across the team: by engineer, model, and task. */
    getTeamUsage(): TeamUsage;
    reviewTask(input: {
        taskKey: string;
        decision: 'accept' | 'reject';
        notes?: string;
        author?: string;
    }): {
        task: TaskView;
    };
    getTeamContext(): TeamContext;
    synthesizeDeliverable(): {
        summary: string;
        artifacts: BlackboardEntry[];
    };
    private buildDirective;
    private buildDispatch;
    /** The bundled team templates (full-feature-team, bugfix-team, refactor-team…). */
    listTeamRecipes(): Array<{
        name: string;
        description: string;
        taskCount: number;
    }>;
    /**
     * Instantiate a team recipe for a goal: seed the whole task graph on the board
     * (namespaced + dependency-linked) and return dispatch packets for the tasks
     * that are ready to start now (those with no dependencies).
     */
    startTeamRecipe(input: {
        recipe: string;
        goal: string;
        namespace?: string;
        author?: string;
    }): Promise<{
        tasks: TaskView[];
        dispatches: DispatchPacket[];
        teamContext: TeamContext;
    }>;
}
//# sourceMappingURL=lead-pm.d.ts.map