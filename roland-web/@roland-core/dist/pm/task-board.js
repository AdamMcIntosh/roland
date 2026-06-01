/**
 * TaskBoard — the PM-semantic layer over the Phase 1 Blackboard.
 *
 * Every mutation goes through the lifecycle state machine (see types.ts), so the
 * board can never reach an illegal state. Each method reads the task's current
 * rev and writes with an expectedRev guard; on a concurrent change it re-reads
 * and retries once before surfacing the conflict. The Blackboard stays the
 * single source of truth — tasks, blockers and artifacts are all entries on it.
 */
import { ConcurrencyError } from '../coordination/types.js';
import { ArtifactValueSchema, BlockerValueSchema, IllegalTransitionError, TaskValueSchema, TRANSITIONS, } from './types.js';
function shortId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
function slugOf(taskKey) {
    return taskKey.replace(/^task:/, '');
}
const TERMINAL = new Set(['done', 'archived']);
export class TaskBoard {
    board;
    constructor(board) {
        this.board = board;
    }
    // -- reads ----------------------------------------------------------------
    getTask(key) {
        const [entry] = this.board.read({ key, includeArchived: true, limit: 1 });
        if (!entry || entry.type !== 'task')
            return null;
        return this.toView(entry);
    }
    /** All non-archived tasks, newest first. */
    allTasks() {
        return this.board
            .read({ type: 'task', limit: 200 })
            .map((e) => this.toView(e));
    }
    activeTasks() {
        return this.allTasks().filter((t) => ['open', 'in_progress', 'blocked', 'in_review'].includes(t.status));
    }
    blocked() {
        return this.allTasks().filter((t) => t.status === 'blocked');
    }
    awaitingReview() {
        return this.allTasks().filter((t) => t.status === 'in_review');
    }
    /** Open tasks whose every dependency is done/archived. */
    readyToStart() {
        const status = new Map(this.allTasks().map((t) => [t.key, t.status]));
        // Tasks already archived count as satisfied even if pruned from allTasks().
        return this.allTasks().filter((t) => t.status === 'open' &&
            t.value.dependsOn.every((dep) => {
                const s = status.get(dep);
                return s === undefined ? this.isDoneOrMissing(dep) : TERMINAL.has(s);
            }));
    }
    openBlockersFor(taskKey) {
        return this.board
            .read({ type: 'blocker', limit: 200 })
            .filter((e) => e.value?.taskKey === taskKey)
            .map((e) => ({
            key: e.key,
            status: e.status ?? 'open',
            value: BlockerValueSchema.parse(e.value),
            createdAt: e.createdAt,
        }));
    }
    // -- lifecycle mutations --------------------------------------------------
    createTask(input) {
        const key = `task:${input.slug}`;
        const value = TaskValueSchema.parse({
            title: input.title,
            description: input.description,
            assignee: input.assignee,
            dependsOn: input.dependsOn ?? [],
            priority: input.priority ?? 'normal',
            acceptanceCriteria: input.acceptanceCriteria,
            artifactKeys: [],
            blockerKeys: [],
        });
        const entry = this.board.post({
            key,
            type: 'task',
            value,
            author: input.author,
            status: 'open',
            tags: input.assignee ? [`assignee:${input.assignee}`] : [],
        });
        return this.toView(entry);
    }
    assign(taskKey, assignee, author) {
        return this.transition(taskKey, 'assign', author, (v) => ({ ...v, assignee }));
    }
    /** Raise a blocker on an in-progress task. Returns the task and the new blocker. */
    block(taskKey, input) {
        const blockerKey = `blocker:${input.slug ?? `${slugOf(taskKey)}-${shortId()}`}`;
        const blockerValue = { taskKey, need: input.need, raisedBy: input.raisedBy };
        const blockerEntry = this.board.post({
            key: blockerKey,
            type: 'blocker',
            value: blockerValue,
            author: input.raisedBy,
            status: 'open',
            tags: [`task:${slugOf(taskKey)}`],
        });
        const task = this.transition(taskKey, 'block', input.raisedBy, (v) => ({
            ...v,
            blockerKeys: [...v.blockerKeys, blockerKey],
        }));
        return { task, blocker: { key: blockerEntry.key, status: 'open', value: blockerValue } };
    }
    /** Resolve a blocker. Task returns to in_progress only when no open blockers remain. */
    unblock(taskKey, input) {
        // Record + archive the blocker, and persist a shared decision.
        const [blockerEntry] = this.board.read({ key: input.blockerKey, includeArchived: true, limit: 1 });
        if (blockerEntry) {
            const bv = BlockerValueSchema.parse(blockerEntry.value);
            this.board.patch({
                key: input.blockerKey,
                author: input.author,
                changes: { value: { ...bv, resolution: input.resolution }, status: 'archived' },
            });
        }
        this.board.post({
            key: `decision:${slugOf(taskKey)}-${shortId()}`,
            type: 'decision',
            value: { taskKey, resolution: input.resolution },
            author: input.author,
            tags: [`task:${slugOf(taskKey)}`],
        });
        return this.mutateWithRetry(taskKey, (view) => {
            const remaining = view.value.blockerKeys.filter((k) => k !== input.blockerKey);
            if (remaining.length > 0) {
                // Still blocked by others — just drop this blocker from the list.
                return { status: view.status, value: { ...view.value, blockerKeys: remaining } };
            }
            this.assertTransition(taskKey, 'unblock', view.status);
            return {
                status: TRANSITIONS.unblock.to,
                value: { ...view.value, blockerKeys: remaining },
            };
        });
    }
    /** Engineer submits work: attach an artifact and move the task to review. */
    complete(taskKey, input) {
        const artifactKey = `artifact:${input.slug ?? `${slugOf(taskKey)}-${shortId()}`}`;
        const artifactValue = ArtifactValueSchema.parse({
            taskKey,
            summary: input.summary,
            content: input.content,
        });
        const artifact = this.board.post({
            key: artifactKey,
            type: 'artifact',
            value: artifactValue,
            author: input.author,
            tags: [`task:${slugOf(taskKey)}`],
        });
        const task = this.transition(taskKey, 'complete', input.author, (v) => ({
            ...v,
            artifactKeys: [...v.artifactKeys, artifactKey],
        }));
        return { task, artifact };
    }
    /** PM review: accept (→done) or reject (→in_progress with notes). */
    review(taskKey, input) {
        const action = input.decision === 'accept' ? 'accept' : 'reject';
        return this.transition(taskKey, action, input.author, (v) => action === 'reject' ? { ...v, reviewNotes: input.notes } : v);
    }
    archiveTask(taskKey, author) {
        return this.transition(taskKey, 'archive', author, (v) => v);
    }
    /**
     * Roll Cursor token usage onto a task (Phase 3). Does not change status — it
     * only accumulates the usage counters, so it is legal from any state.
     */
    patchUsage(taskKey, delta, author = 'lead-pm') {
        return this.mutateWithRetry(taskKey, (view) => {
            const u = view.value.usage ?? { inputTokens: 0, outputTokens: 0, requests: 0 };
            return {
                status: view.status,
                value: {
                    ...view.value,
                    usage: {
                        inputTokens: u.inputTokens + (delta.inputTokens ?? 0),
                        outputTokens: u.outputTokens + (delta.outputTokens ?? 0),
                        requests: u.requests + 1,
                        model: delta.model ?? u.model,
                    },
                },
            };
        }, author);
    }
    // -- internals ------------------------------------------------------------
    toView(entry) {
        return {
            key: entry.key,
            status: (entry.status ?? 'open'),
            rev: entry.rev,
            updatedAt: entry.updatedAt,
            value: TaskValueSchema.parse(entry.value),
        };
    }
    assertTransition(taskKey, action, from) {
        if (!TRANSITIONS[action].from.includes(from)) {
            throw new IllegalTransitionError(taskKey, action, from);
        }
    }
    isDoneOrMissing(taskKey) {
        const [e] = this.board.read({ key: taskKey, includeArchived: true, limit: 1 });
        if (!e)
            return false;
        return TERMINAL.has((e.status ?? 'open'));
    }
    /** Apply a state-machine transition with rev-guarded retry. */
    transition(taskKey, action, author, mutateValue) {
        return this.mutateWithRetry(taskKey, (view) => {
            this.assertTransition(taskKey, action, view.status);
            return { status: TRANSITIONS[action].to, value: mutateValue(view.value) };
        }, author);
    }
    mutateWithRetry(taskKey, compute, author = 'lead-pm') {
        for (let attempt = 0; attempt < 2; attempt++) {
            const view = this.getTask(taskKey);
            if (!view)
                throw new Error(`Task not found: ${taskKey}`);
            const next = compute(view);
            try {
                const updated = this.board.patch({
                    key: taskKey,
                    author,
                    expectedRev: view.rev,
                    changes: { value: next.value, status: next.status },
                });
                return this.toView(updated);
            }
            catch (err) {
                if (err instanceof ConcurrencyError && attempt === 0)
                    continue; // re-read and retry once
                throw err;
            }
        }
        // Unreachable, but satisfies the type checker.
        throw new ConcurrencyError(taskKey, -1, -1);
    }
}
//# sourceMappingURL=task-board.js.map