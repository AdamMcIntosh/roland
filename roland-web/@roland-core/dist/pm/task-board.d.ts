/**
 * TaskBoard — the PM-semantic layer over the Phase 1 Blackboard.
 *
 * Every mutation goes through the lifecycle state machine (see types.ts), so the
 * board can never reach an illegal state. Each method reads the task's current
 * rev and writes with an expectedRev guard; on a concurrent change it re-reads
 * and retries once before surfacing the conflict. The Blackboard stays the
 * single source of truth — tasks, blockers and artifacts are all entries on it.
 */
import { Blackboard } from '../coordination/blackboard.js';
import { type BlackboardEntry } from '../coordination/types.js';
import { BlockerView, TaskValue, TaskView } from './types.js';
export declare class TaskBoard {
    private readonly board;
    constructor(board: Blackboard);
    getTask(key: string): TaskView | null;
    /** All non-archived tasks, newest first. */
    allTasks(): TaskView[];
    activeTasks(): TaskView[];
    blocked(): TaskView[];
    awaitingReview(): TaskView[];
    /** Open tasks whose every dependency is done/archived. */
    readyToStart(): TaskView[];
    openBlockersFor(taskKey: string): BlockerView[];
    createTask(input: {
        slug: string;
        title: string;
        description: string;
        assignee?: string;
        dependsOn?: string[];
        priority?: TaskValue['priority'];
        acceptanceCriteria?: string;
        author: string;
    }): TaskView;
    assign(taskKey: string, assignee: string, author: string): TaskView;
    /** Raise a blocker on an in-progress task. Returns the task and the new blocker. */
    block(taskKey: string, input: {
        need: string;
        raisedBy: string;
        slug?: string;
    }): {
        task: TaskView;
        blocker: BlockerView;
    };
    /** Resolve a blocker. Task returns to in_progress only when no open blockers remain. */
    unblock(taskKey: string, input: {
        blockerKey: string;
        resolution: string;
        author: string;
    }): TaskView;
    /** Engineer submits work: attach an artifact and move the task to review. */
    complete(taskKey: string, input: {
        summary: string;
        content?: string;
        author: string;
        slug?: string;
    }): {
        task: TaskView;
        artifact: BlackboardEntry;
    };
    /** PM review: accept (→done) or reject (→in_progress with notes). */
    review(taskKey: string, input: {
        decision: 'accept' | 'reject';
        notes?: string;
        author: string;
    }): TaskView;
    archiveTask(taskKey: string, author: string): TaskView;
    /**
     * Roll Cursor token usage onto a task (Phase 3). Does not change status — it
     * only accumulates the usage counters, so it is legal from any state.
     */
    patchUsage(taskKey: string, delta: {
        inputTokens?: number;
        outputTokens?: number;
        model?: string;
    }, author?: string): TaskView;
    private toView;
    private assertTransition;
    private isDoneOrMissing;
    /** Apply a state-machine transition with rev-guarded retry. */
    private transition;
    private mutateWithRetry;
}
//# sourceMappingURL=task-board.d.ts.map