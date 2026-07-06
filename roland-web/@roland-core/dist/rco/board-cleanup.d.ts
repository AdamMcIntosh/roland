/**
 * ## Evaluation Gate & Blocker Fix
 *
 * Board cleanup — archive stale mission state before a new run.
 *
 * Cleans both machine-readable `.roland/blackboard.json` and human-readable
 * `.roland/command-blackboard.md` so prior [pending]/[done] tasks do not pollute
 * planning prompts or worker context.
 */
import { Blackboard } from '../coordination/legacy-blackboard.js';
import { CommandBlackboard } from './command-blackboard.js';
export interface BoardCleanupOptions {
    /** When true, report actions without writing files. */
    dryRun?: boolean;
    /** New mission goal — used to preserve goal-relevant open intel / decisions. */
    goal?: string;
}
export interface BoardCleanupResult {
    dryRun: boolean;
    blackboardArchived: number;
    blackboardArchivedTitles: string[];
    commandBoard: {
        activeTasksRemoved: string[];
        objectivesArchived: string[];
        intelRemoved: string[];
        agentsReset: boolean;
    };
}
/** Archive stale blackboard.json entries from prior missions. */
export declare function cleanupMachineBlackboard(blackboard: Blackboard, options?: BoardCleanupOptions): {
    archived: number;
    titles: string[];
};
/** Clean command-blackboard.md — remove stale tasks, archive old objectives, reset agents. */
export declare function cleanupCommandBlackboard(board: CommandBlackboard, options?: BoardCleanupOptions): BoardCleanupResult['commandBoard'];
/** Full cleanup for mission start or `roland board-cleanup`. */
export declare function cleanupBoardsForNewMission(stateDir: string, goal: string, options?: BoardCleanupOptions): BoardCleanupResult;
/** Human-readable cleanup report for CLI. */
export declare function formatCleanupReport(result: BoardCleanupResult): string;
//# sourceMappingURL=board-cleanup.d.ts.map