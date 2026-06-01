/**
 * LeadPM — the single facade the MCP server holds for the PM control loop.
 *
 * Composes the Phase 1 substrate (Blackboard + MessageBus via CoordinationManager)
 * with the Phase 2 TaskBoard + Roster. It builds the dispatch packets the host
 * uses to launch engineers, sends the bus notifications that keep everyone in
 * sync, and assembles the get_team_context digest whose needsAttention heuristics
 * always surface blockers first — enforcing "unblock before new work".
 */
import { TaskBoard } from './task-board.js';
import { Roster } from './roster.js';
import { loadPlaybook, PLAYBOOK_VERSION } from './playbook.js';
import { TaskRouter } from './router.js';
import { TeamRecipes, instantiate } from './team-recipes.js';
import { PROVIDER } from './model-policy.js';
import { PMEventLog } from './event-log.js';
import { renderCursorLaunch, renderStandup } from './render.js';
import { selectRelevantFiles } from '../utils/file-gatherer.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { getGlobalTracker } from '../orchestrator/advanced-cost-tracker.js';
const DEFAULT_STALL_MS = 15 * 60 * 1000; // 15 minutes with no update → flag as stalled
const USAGE_NOTE = 'Billed via your Cursor subscription — these are token-usage figures for attribution, not dollar costs.';
export class LeadPM {
    board;
    bus;
    tasks;
    roster;
    router;
    recipes;
    tracker;
    events;
    stallMs;
    constructor(coordination, opts = {}) {
        this.board = coordination.blackboard;
        this.bus = coordination.bus;
        this.tasks = new TaskBoard(this.board);
        this.roster =
            opts.roster ?? new Roster(Roster.resolveAgentsDir(), { laneOverrides: opts.laneOverrides });
        this.router = new TaskRouter({ policy: opts.policy, laneOverrides: opts.laneOverrides });
        this.recipes = opts.recipes ?? new TeamRecipes();
        this.tracker = opts.tracker ?? getGlobalTracker();
        this.events = opts.eventLog ?? new PMEventLog();
        this.stallMs = opts.stallMs ?? DEFAULT_STALL_MS;
    }
    logEvent(action, fields = {}) {
        this.events.append({ action, ...fields });
    }
    /** Reverse-chronological PM event timeline (Phase 4 observability). */
    getPmEvents(limit = 50, filter) {
        return this.events.tail(limit, filter);
    }
    /** The morning-standup view: rendered Markdown plus the structured context. */
    getStandup() {
        const context = this.getTeamContext();
        return { markdown: renderStandup(context), context };
    }
    // -- meta -----------------------------------------------------------------
    getPlaybook() {
        return { playbook: loadPlaybook(), version: PLAYBOOK_VERSION };
    }
    listTeam() {
        return this.roster.list().map((e) => {
            const r = this.router.route(e.specialty, e.name);
            return {
                name: e.name,
                specialty: e.specialty,
                lane: r.lane,
                model: r.model,
                rationale: r.rationale,
                tools: e.tools,
            };
        });
    }
    // -- task lifecycle -------------------------------------------------------
    async spawnTask(input) {
        const author = input.author ?? 'lead-pm';
        const task = this.tasks.createTask({ ...input, author });
        const engineer = input.assignee
            ? this.roster.get(input.assignee) ?? this.roster.recommend(input.description)
            : this.roster.recommend(input.description);
        const dispatch = await this.buildDispatch(task, engineer);
        this.logEvent('spawn', { taskKey: task.key, actor: author, detail: `${task.value.title} → ${engineer.name}` });
        return { task, dispatch };
    }
    async assignTask(input) {
        const author = input.author ?? 'lead-pm';
        const task = this.tasks.assign(input.taskKey, input.assignee, author);
        const engineer = this.roster.get(input.assignee) ?? this.roster.recommend(task.value.description);
        const dispatch = await this.buildDispatch(task, engineer);
        this.bus.send({ from: 'lead-pm', to: input.assignee, topic: 'assignment', body: dispatch.brief });
        this.logEvent('assign', { taskKey: input.taskKey, actor: author, detail: `→ ${input.assignee} (${dispatch.recommendedModel})` });
        return { task, dispatch };
    }
    markBlocked(input) {
        const { task, blocker } = this.tasks.block(input.taskKey, {
            need: input.need,
            raisedBy: input.raisedBy,
            slug: input.slug,
        });
        this.bus.send({
            from: input.raisedBy,
            to: 'lead-pm',
            topic: 'blocker',
            body: `BLOCKED ${input.taskKey} (${blocker.key}): ${input.need}`,
        });
        this.logEvent('block', { taskKey: input.taskKey, actor: input.raisedBy, detail: input.need });
        return { task, blocker: { key: blocker.key, need: input.need } };
    }
    unblockTask(input) {
        const author = input.author ?? 'lead-pm';
        const task = this.tasks.unblock(input.taskKey, {
            blockerKey: input.blockerKey,
            resolution: input.resolution,
            author,
        });
        if (task.value.assignee) {
            this.bus.send({
                from: 'lead-pm',
                to: task.value.assignee,
                topic: 'unblock',
                body: `UNBLOCKED ${input.taskKey}: ${input.resolution}`,
            });
        }
        this.logEvent('unblock', { taskKey: input.taskKey, actor: author, detail: input.resolution });
        return { task };
    }
    completeTask(input) {
        const { task, artifact } = this.tasks.complete(input.taskKey, {
            summary: input.summary,
            content: input.content,
            author: input.author,
            slug: input.slug,
        });
        this.bus.send({
            from: input.author,
            to: 'lead-pm',
            topic: 'review',
            body: `READY FOR REVIEW ${input.taskKey} (${artifact.key}): ${input.summary}`,
        });
        this.logEvent('complete', { taskKey: input.taskKey, actor: input.author, detail: input.summary });
        // Optional: roll up Cursor token usage in the same call so engineers report
        // once. Usage is only recorded when token counts are actually supplied.
        let usageView = task.value.usage;
        if (input.model && ((input.inputTokens ?? 0) > 0 || (input.outputTokens ?? 0) > 0)) {
            const { taskUsage } = this.recordUsage({
                taskKey: input.taskKey,
                engineer: input.author,
                model: input.model,
                inputTokens: input.inputTokens ?? 0,
                outputTokens: input.outputTokens ?? 0,
            });
            usageView = taskUsage;
        }
        return { task, artifactKey: artifact.key, usage: usageView };
    }
    // -- usage attribution ----------------------------------------------------
    /**
     * Attribute Cursor token usage to a task + engineer. Cost is computed via
     * ModelRouter.estimateCost, which returns 0 for Cursor/subscription models —
     * so this records *usage* (tokens/requests), not dollars, and never touches
     * the legacy OpenRouter budget.
     */
    recordUsage(input) {
        const cost = ModelRouter.estimateCost(input.model, input.inputTokens, input.outputTokens);
        this.tracker.recordCost(input.model, PROVIDER, input.engineer, input.inputTokens, input.outputTokens, cost, { query: input.taskKey, taskKey: input.taskKey });
        const task = this.tasks.patchUsage(input.taskKey, {
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            model: input.model,
        });
        this.logEvent('usage', {
            taskKey: input.taskKey,
            actor: input.engineer,
            detail: `${input.model}: ${input.inputTokens} in / ${input.outputTokens} out`,
        });
        return { taskUsage: task.value.usage, teamUsage: this.getTeamUsage() };
    }
    /** Cursor usage attribution across the team: by engineer, model, and task. */
    getTeamUsage() {
        const byEngineer = {};
        const byModel = {};
        const byTask = {};
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalRequests = 0;
        const add = (into, key, r) => {
            const cur = into[key] ?? { inputTokens: 0, outputTokens: 0, requests: 0 };
            cur.inputTokens += r.inputTokens;
            cur.outputTokens += r.outputTokens;
            cur.requests += 1;
            cur.model = r.model;
            into[key] = cur;
        };
        for (const r of this.tracker.getRecords()) {
            if (r.provider !== PROVIDER)
                continue; // PM-team (Cursor) usage only
            add(byEngineer, r.agent, r);
            add(byModel, r.model, r);
            if (r.taskKey)
                add(byTask, r.taskKey, r);
            totalInputTokens += r.inputTokens;
            totalOutputTokens += r.outputTokens;
            totalRequests += 1;
        }
        return {
            byEngineer,
            byModel,
            byTask,
            totalInputTokens,
            totalOutputTokens,
            totalRequests,
            note: USAGE_NOTE,
        };
    }
    reviewTask(input) {
        const author = input.author ?? 'lead-pm';
        const task = this.tasks.review(input.taskKey, {
            decision: input.decision,
            notes: input.notes,
            author,
        });
        if (input.decision === 'reject' && task.value.assignee) {
            this.bus.send({
                from: 'lead-pm',
                to: task.value.assignee,
                topic: 'rework',
                body: `CHANGES REQUESTED ${input.taskKey}: ${input.notes ?? '(see acceptance criteria)'}`,
            });
        }
        this.logEvent('review', {
            taskKey: input.taskKey,
            actor: author,
            detail: input.decision === 'accept' ? 'accepted' : `rejected: ${input.notes ?? ''}`,
        });
        return { task };
    }
    // -- the heartbeat: get_team_context --------------------------------------
    getTeamContext() {
        const now = Date.now();
        const all = this.tasks.allTasks();
        const ready = this.tasks.readyToStart();
        const inbox = this.bus.poll({ recipient: 'lead-pm', ack: false });
        const recentDecisions = this.board.read({ type: 'decision', limit: 5 });
        const summary = { open: 0, in_progress: 0, blocked: 0, in_review: 0, done: 0 };
        for (const t of all) {
            if (t.status in summary)
                summary[t.status] += 1;
        }
        const needsAttention = [];
        // 1. BLOCKERS — highest priority, so unblocking always leads.
        for (const t of all.filter((x) => x.status === 'blocked')) {
            const blockers = this.tasks.openBlockersFor(t.key);
            if (blockers.length === 0) {
                // Blocked with no live blocker record — surface anyway so it never sticks.
                needsAttention.push({
                    kind: 'blocker',
                    priority: 100,
                    taskKey: t.key,
                    reason: `"${t.value.title}" is blocked but has no open blocker record.`,
                    action: `unblock_task { taskKey: "${t.key}", blockerKey: "<none>", resolution: "..." }`,
                });
            }
            for (const b of blockers) {
                const bv = b.value;
                needsAttention.push({
                    kind: 'blocker',
                    priority: 100,
                    taskKey: t.key,
                    blockerKey: b.key,
                    reason: `"${t.value.title}" blocked — needs: ${bv.need} (raised by ${bv.raisedBy})`,
                    action: `unblock_task { taskKey: "${t.key}", blockerKey: "${b.key}", resolution: "<your decision>" }`,
                });
            }
        }
        // 2. INBOX blocker notifications — near-blocker urgency.
        for (const m of inbox) {
            const isBlockerMsg = m.topic === 'blocker';
            needsAttention.push({
                kind: 'inbox',
                priority: isBlockerMsg ? 90 : 45,
                reason: `Message from ${m.from} [${m.topic}]: ${m.body}`,
                action: `bus_poll { recipient: "lead-pm" }`,
            });
        }
        // 3. REVIEWS — work waiting on your acceptance.
        for (const t of all.filter((x) => x.status === 'in_review')) {
            needsAttention.push({
                kind: 'review',
                priority: 80,
                taskKey: t.key,
                reason: `"${t.value.title}" is awaiting your review (${t.value.artifactKeys.length} artifact(s)).`,
                action: `review_task { taskKey: "${t.key}", decision: "accept" | "reject", notes: "..." }`,
            });
        }
        // 4. STALLED — in_progress with no update for a while; engineer may be stuck.
        for (const t of all.filter((x) => x.status === 'in_progress')) {
            if (now - t.updatedAt > this.stallMs) {
                const mins = Math.round((now - t.updatedAt) / 60000);
                needsAttention.push({
                    kind: 'stalled',
                    priority: 60,
                    taskKey: t.key,
                    reason: `"${t.value.title}" has been in_progress with no update for ~${mins} min — check on ${t.value.assignee ?? 'the engineer'}.`,
                    action: `bus_send { from: "lead-pm", to: "${t.value.assignee ?? '<assignee>'}", body: "status?" }`,
                });
            }
        }
        // 5. READY but unassigned — safe to start once everything above is clear.
        for (const t of ready.filter((x) => !x.value.assignee)) {
            needsAttention.push({
                kind: 'ready',
                priority: 40,
                taskKey: t.key,
                reason: `"${t.value.title}" is ready to start (dependencies satisfied) and unassigned.`,
                action: `assign_task { taskKey: "${t.key}", assignee: "<engineer>" }`,
            });
        }
        // Most urgent first; older items break ties so nothing starves.
        needsAttention.sort((a, b) => b.priority - a.priority);
        const directive = this.buildDirective(summary, ready.length);
        const nextActions = needsAttention.slice(0, 8).map((a) => a.action);
        return {
            directive,
            summary,
            needsAttention,
            blockers: all
                .filter((t) => t.status === 'blocked')
                .flatMap((t) => this.tasks.openBlockersFor(t.key)),
            activeTasks: this.tasks.activeTasks(),
            readyToStart: ready,
            inbox,
            recentDecisions,
            nextActions,
            usage: this.getTeamUsage(),
        };
    }
    // -- synthesis ------------------------------------------------------------
    synthesizeDeliverable() {
        const tasks = this.board
            .read({ type: 'task', includeArchived: true, limit: 200 })
            .filter((e) => e.status === 'done' || e.status === 'archived');
        const artifactKeys = new Set();
        const lines = ['# Deliverable\n'];
        for (const t of tasks) {
            const v = t.value;
            lines.push(`## ${v.title ?? t.key} (${t.status})`);
            for (const k of v.artifactKeys ?? [])
                artifactKeys.add(k);
        }
        const artifacts = this.board
            .read({ type: 'artifact', includeArchived: true, limit: 200 })
            .filter((e) => artifactKeys.has(e.key));
        for (const a of artifacts) {
            const av = a.value;
            lines.push(`- **${a.key}** (${av.taskKey}): ${av.summary ?? ''}`);
        }
        return { summary: lines.join('\n'), artifacts };
    }
    // -- internals ------------------------------------------------------------
    buildDirective(summary, readyCount) {
        if (summary.blocked > 0) {
            return `⚠ ${summary.blocked} blocked task(s). UNBLOCK before starting new work.`;
        }
        if (summary.in_review > 0) {
            return `${summary.in_review} task(s) awaiting your review. Clear the review queue next.`;
        }
        if (readyCount > 0) {
            return `${readyCount} task(s) ready to start. Assign them to engineers.`;
        }
        if (summary.in_progress > 0) {
            return `${summary.in_progress} task(s) in progress. Monitor for blockers.`;
        }
        return `Team idle — decompose the next goal or synthesize the deliverable.`;
    }
    async buildDispatch(task, engineer) {
        let contextFiles = [];
        try {
            contextFiles = await selectRelevantFiles(task.value.description);
        }
        catch {
            // Best-effort; context gathering is optional and must never block dispatch.
        }
        const routing = this.router.route(task.value.description, engineer.name);
        const reportingInstructions = `When finished, call complete_task with taskKey="${task.key}", a one-line summary, your output as the artifact, ` +
            `and (if you can) model="${routing.model}" with input_tokens/output_tokens so usage is attributed. ` +
            `If you hit a blocker, immediately call mark_blocked with taskKey="${task.key}" describing exactly what you need from the PM. ` +
            `Do not start work outside this task's scope.`;
        const brief = [
            `[Engineer persona: ${engineer.name}]`,
            engineer.role_prompt,
            ``,
            `[Run on: ${routing.model} — ${routing.rationale}]`,
            `[Task: ${task.value.title}]  (key: ${task.key})`,
            task.value.description,
            ``,
            `Acceptance criteria: ${task.value.acceptanceCriteria ?? '— (use your judgment; ask if unclear)'}`,
            `Depends on: ${task.value.dependsOn.length ? task.value.dependsOn.join(', ') : 'nothing'}`,
            ``,
            `Reporting: ${reportingInstructions}`,
        ].join('\n');
        const cursorLaunch = renderCursorLaunch({
            taskKey: task.key,
            engineer: engineer.name,
            model: routing.model,
            brief,
            contextFiles,
        });
        return {
            taskKey: task.key,
            persona: { name: engineer.name, role_prompt: engineer.role_prompt },
            recommendedModel: routing.model,
            routing,
            brief,
            contextFiles,
            reportingInstructions,
            cursorLaunch,
        };
    }
    // -- team recipes ---------------------------------------------------------
    /** The bundled team templates (full-feature-team, bugfix-team, refactor-team…). */
    listTeamRecipes() {
        return this.recipes.list();
    }
    /**
     * Instantiate a team recipe for a goal: seed the whole task graph on the board
     * (namespaced + dependency-linked) and return dispatch packets for the tasks
     * that are ready to start now (those with no dependencies).
     */
    async startTeamRecipe(input) {
        const author = input.author ?? 'lead-pm';
        const recipe = this.recipes.get(input.recipe);
        if (!recipe) {
            const known = this.recipes.list().map((r) => r.name).join(', ') || '(none found)';
            throw new Error(`Unknown team recipe "${input.recipe}". Available: ${known}.`);
        }
        const seeds = instantiate(recipe, input.goal, { namespace: input.namespace });
        const tasks = seeds.map((s) => this.tasks.createTask({ ...s, author }));
        this.logEvent('recipe-start', { actor: author, detail: `${recipe.name}: ${input.goal} (${tasks.length} tasks)` });
        // Dispatch the dependency-free tasks so the host can launch them immediately.
        const dispatches = [];
        for (const t of tasks) {
            if (t.value.dependsOn.length === 0) {
                const engineer = t.value.assignee
                    ? this.roster.get(t.value.assignee) ?? this.roster.recommend(t.value.description)
                    : this.roster.recommend(t.value.description);
                dispatches.push(await this.buildDispatch(t, engineer));
            }
        }
        return { tasks, dispatches, teamContext: this.getTeamContext() };
    }
}
//# sourceMappingURL=lead-pm.js.map