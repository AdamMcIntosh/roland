/**
 * ## Assumptions
 * - Hermes is the primary PM / strategist; Roland ClosedLoop is the loop execution engine.
 * - [DEPRECATED] Legacy PM Team opt-in via enablePmIntegration, loop_engine.use_pm_team, or template use_pm_team.
 * - ClosedLoop is the production entry point; LoopEngine remains the phase execution core.
 * - EvaluationGate replaces direct TestExecutor calls in the verify phase.
 * - SpecialistSpawner fires on every phase transition via LoopHooks.
 * - LoopMemory persists reflections, exit tracking, and artifacts under `.roland/loops/<loop-id>/`.
 * - PR titles/descriptions are generated on loop completion via pr-format.ts.
 * - Checkpoint/recovery delegates to LoopEngine (loop-checkpoint.json + loop-state.json).
 */
import fs from 'fs';
import path from 'path';
import { formatPrFromGoal } from '../rco/pr-format.js';
import { Phase as P } from './loop-phases.js';
import { LoopEngine, } from './loop-engine.js';
import { LoopTemplates, summarizeTemplateSpawns } from './loop-templates.js';
import { createDefaultHandlersWithoutPm, VerifyPhaseHandler, ReflectionPhaseHandler, PlanPhaseHandler, ActPhaseHandler, } from './phase-handlers/index.js';
import { SpecialistSpawner } from './specialist-spawner.js';
import { LoopMemory } from './loop-memory.js';
import { LoopPmBridge } from './pm-integration.js';
import { ModelRouter, initModelRouter, ModelRouterError } from '../models/model-router.js';
import { loadLoopEngineConfig, resolveBetweenIterations } from './loop-config.js';
import { summarizeVerificationConfig, summarizeBetweenIterationsConfig, resolveBetweenIterationsHook, resolveMinConfidence, } from './loop-template-resolution.js';
import { isLoopPmTeamEnabled, resolvePmIntegrationStatus, } from './loop-pm-policy.js';
export const CLOSED_LOOP_PR_FILE = 'closed-loop-pr.json';
/**
 * ClosedLoop — production closed-loop execution harness.
 *
 * Lifecycle: PLAN → ACT → VERIFY → CRITIQUE → RETRY → ESCALATE (optional) → OBSERVE → REFLECT → exit check.
 */
export class ClosedLoop {
    engine;
    spawner;
    opts;
    template;
    memory;
    modelRouter;
    pmIntegration;
    constructor(opts) {
        this.opts = opts;
        this.modelRouter = initModelRouter();
        const validation = ModelRouter.validateOnStartup(this.modelRouter);
        if (!validation.ok) {
            throw new ModelRouterError(`ClosedLoop cannot start — missing model roles: ${validation.missing.join(', ')}. ` +
                'Configure models.pm, models.coding, models.critic, models.verifier in config.yaml.', validation.missing[0]);
        }
        for (const w of validation.warnings.slice(0, 3)) {
            console.error(`[ModelRouter] Note: ${w}`);
        }
        for (const w of validation.dispatchWarnings.slice(0, 5)) {
            console.error(`[ModelRouter] Dispatch: ${w}`);
        }
        this.template = ClosedLoop.resolveTemplate(opts.template);
        this.pmIntegration = resolvePmIntegrationStatus(this.template, opts);
        const loopCfg = loadLoopEngineConfig();
        const spawnSummary = summarizeTemplateSpawns(this.template);
        const verificationSummary = summarizeVerificationConfig(this.template);
        const betweenIterSummary = summarizeBetweenIterationsConfig(this.template);
        const betweenHook = resolveBetweenIterationsHook(this.template);
        const hitlGitCommitEnabled = Boolean(betweenHook?.gitCommit?.requireApproval && !betweenHook.gitCommit.dryRun);
        const minConfidence = resolveMinConfidence(this.template, opts.minConfidence);
        this.modelRouter.logLoopRunConfigSummary({
            templateId: this.template.name,
            canonicalTemplateId: new LoopTemplates().resolveName(this.template.name),
            pmEnabled: this.pmIntegration.enabled,
            pmReason: this.pmIntegration.reason,
            usePmTeam: loopCfg.usePmTeam,
            defaultDispatch: loopCfg.defaultDispatch ?? 'cursor_sdk',
            spawnSummary,
            verificationSummary,
            betweenIterSummary,
            minConfidence,
            hitlGitCommitEnabled,
        });
        this.memory = new LoopMemory({
            stateDir: opts.stateDir,
            loopId: opts.loopId,
            goal: opts.goal,
            templateId: this.template.name,
        });
        this.spawner = new SpecialistSpawner({
            blackboard: opts.blackboard,
            commandBoard: opts.commandBoard,
            goal: opts.goal,
            modelRouter: this.modelRouter,
            onSpawnPulse: (pulse) => {
                this.engine?.recordSpawnPulse(pulse);
            },
        });
        const pmEnabled = isLoopPmTeamEnabled(this.template, opts);
        const lightweightCtx = {
            stateDir: opts.stateDir,
            goal: opts.goal,
            template: this.template,
            blackboard: opts.blackboard,
            commandBoard: opts.commandBoard,
            modelRouter: this.modelRouter,
            cwd: opts.cwd ??
                process.env.ROLAND_PROJECT_ROOT?.trim() ??
                process.env.ROLAND_ROOT?.trim() ??
                process.cwd(),
            isTestMode: opts.isTestMode,
        };
        const pmBridge = pmEnabled
            ? new LoopPmBridge({
                stateDir: opts.stateDir,
                goal: opts.goal,
                template: this.template,
                blackboard: opts.blackboard,
                commandBoard: opts.commandBoard,
                isTestMode: opts.isTestMode,
                teamOpts: opts.teamOpts,
                modelRouter: this.modelRouter,
            })
            : undefined;
        const handlers = createDefaultHandlersWithoutPm();
        handlers.set(P.Plan, new PlanPhaseHandler({ pmBridge, lightweight: lightweightCtx }));
        handlers.set(P.Act, new ActPhaseHandler({ pmBridge, lightweight: lightweightCtx }));
        handlers.set(P.Verify, new VerifyPhaseHandler({
            template: this.template,
            cwd: opts.cwd,
            runner: opts.runner,
            customCriteria: opts.customCriteria,
            requireManualReview: opts.requireManualReview,
            manualReviewApproved: opts.manualReviewApproved,
            minConfidence,
            exitConditions: this.template.exitConditions,
        }));
        handlers.set(P.Reflect, new ReflectionPhaseHandler({ memory: this.memory }));
        const mergedHooks = ClosedLoop.mergeHooks(opts.hooks, this);
        this.engine = new LoopEngine({
            stateDir: opts.stateDir,
            template: this.template,
            goal: opts.goal,
            blackboard: opts.blackboard,
            commandBoard: opts.commandBoard,
            handlers,
            hooks: mergedHooks,
            isTestMode: opts.isTestMode,
            recoverOnStart: opts.recoverOnStart,
            resumeFromState: opts.resumeFromState,
            timeoutMs: opts.timeoutMs,
            skipBackoff: opts.skipBackoff,
            loopMemory: this.memory,
            runner: opts.runner,
            cwd: opts.cwd,
            liveContext: {
                dispatchMethod: loopCfg.defaultDispatch ?? 'cursor_sdk',
                executionMode: pmEnabled ? 'PM-Enhanced' : 'Pure ClosedLoop',
            },
        });
        console.error(`[Loop][closed-loop] harness ready template="${this.template.name}" loopId=${this.memory.loopId} ` +
            `phases=${this.template.phases.map((p) => p.phase).join('→')} ` +
            `exitRules=${this.template.exitConditions?.length ?? 1} betweenIter=${Boolean(resolveBetweenIterations(this.template))} ` +
            `pmIntegration=${pmEnabled ? 'legacy-enabled' : 'pure-closed-loop'}` +
            (spawnSummary ? ` customSpawns="${spawnSummary}"` : '') +
            (verificationSummary ? ` verification="${verificationSummary}"` : '') +
            (betweenIterSummary ? ` betweenIter="${betweenIterSummary}"` : ''));
    }
    getPmIntegration() {
        return this.pmIntegration;
    }
    /** Run the full closed loop until complete, escalate, fail, timeout, or exit conditions met. */
    async run(context = {}) {
        this.spawner.spawnForPhase(P.Plan, 1, this.findPhaseConfig(P.Plan), {
            retryCount: 0,
            goal: this.opts.goal,
        });
        const result = await this.engine.runFullLoop(context);
        const formattedPr = this.persistFormattedPr(result.state, result.status);
        if (result.status === 'escalated') {
            this.spawner.spawnOnDemand('verification_failed', result.state.iteration, 'Loop escalated — dispatch reviewer');
        }
        return {
            ...result,
            formattedPr,
            spawnCount: this.spawner.getHistory().length,
            loopId: this.memory.loopId,
            loopDir: this.memory.loopDir,
            pmIntegration: this.pmIntegration,
        };
    }
    getState() {
        return this.engine.getState();
    }
    getTemplate() {
        return this.template;
    }
    getEngine() {
        return this.engine;
    }
    getSpawner() {
        return this.spawner;
    }
    getMemory() {
        return this.memory;
    }
    /** Build PR title/body from goal + loop outcome without persisting. */
    formatPr(state, status) {
        const s = state ?? this.engine.getState();
        const st = status ?? s.status;
        return formatPrFromGoal(this.opts.goal, {
            runId: this.opts.runId ?? `loop-${s.startedAt}`,
            agent: 'closed-loop',
            testingNotes: buildTestingNotes(s, st),
            impactNote: buildImpactNote(s, st),
            modelRoutingNotes: this.modelRouter.formatRoutingSummary(),
        });
    }
    persistFormattedPr(state, status) {
        const formatted = this.formatPr(state, status);
        const prPath = path.join(this.opts.stateDir, CLOSED_LOOP_PR_FILE);
        try {
            fs.mkdirSync(this.opts.stateDir, { recursive: true });
            fs.writeFileSync(prPath, JSON.stringify({
                ...formatted,
                status,
                iteration: state.iteration,
                loopId: this.memory.loopId,
                exitReason: state.lastExitEvaluation?.reason,
                at: Date.now(),
            }, null, 2), 'utf-8');
        }
        catch {
            // Non-fatal — PR artifact is also on blackboard.
        }
        this.opts.blackboard.post({
            type: 'artifact',
            title: `PR draft: ${formatted.title}`,
            content: formatted.body,
            status: 'done',
            author: 'loop-engine',
            priority: 'medium',
            tags: ['loop', 'pr-format', status],
            relatedIds: [],
        });
        this.opts.commandBoard?.appendBullet('Mission Objectives', `[PR] ${formatted.title}`);
        console.error(`[Loop][closed-loop] PR formatted title="${formatted.title}" status=${status}`);
        return formatted;
    }
    findPhaseConfig(phase) {
        return this.template.phases.find((p) => p.phase === phase);
    }
    onPhaseStart(phase, iteration) {
        const state = this.engine.getState();
        this.spawner.spawnForPhase(phase, iteration, this.findPhaseConfig(phase), {
            retryCount: state.retryCount,
            goal: this.opts.goal,
        });
    }
    onPhaseComplete(phase, result, iteration) {
        if (phase === P.Verify && !result.success) {
            this.spawner.spawnOnDemand('verification_failed', iteration, result.summary);
        }
        if (phase === P.Critique && result.critique?.retryDecision === 'escalate') {
            this.spawner.spawnOnDemand('architecture_review', iteration, result.summary);
        }
    }
    static resolveTemplate(template) {
        if (template && typeof template !== 'string')
            return template;
        const loader = new LoopTemplates();
        const name = template ?? loader.getDefault()?.name ?? 'standard-code-loop';
        const resolved = loader.get(name);
        if (!resolved) {
            throw new Error(`ClosedLoop: unknown loop template "${name}"`);
        }
        return resolved;
    }
    static mergeHooks(userHooks, self) {
        return {
            ...userHooks,
            onPhaseStart: (phase, iteration) => {
                self.onPhaseStart(phase, iteration);
                userHooks?.onPhaseStart?.(phase, iteration);
            },
            onPhaseComplete: (phase, result) => {
                const iteration = self.engine.getState().iteration;
                self.onPhaseComplete(phase, result, iteration);
                userHooks?.onPhaseComplete?.(phase, result);
            },
            onReflection: (iteration, content) => {
                userHooks?.onReflection?.(iteration, content);
            },
            onExitConditionEvaluated: (iteration, shouldExit, reason) => {
                userHooks?.onExitConditionEvaluated?.(iteration, shouldExit, reason);
            },
        };
    }
}
function buildTestingNotes(state, status) {
    const v = state.lastVerification;
    const lines = [];
    if (v) {
        lines.push(`Verification: ${v.summary}`);
        if (v.confidence !== undefined)
            lines.push(`Confidence: ${v.confidence}`);
        if (v.strategies?.length) {
            lines.push(v.strategies.map((s) => `- ${s.type}: ${s.pass ? 'pass' : 'fail'}`).join('\n'));
        }
    }
    if (state.lastExitEvaluation) {
        lines.push(`Exit: ${state.lastExitEvaluation.reason}`);
    }
    lines.push(`Loop status: ${status}, iterations: ${state.iteration}, retries: ${state.retryCount}`);
    return lines.join('\n');
}
function buildImpactNote(state, status) {
    if (status === 'completed' && state.lastExitEvaluation?.shouldExit) {
        return `Closed loop completed — ${state.lastExitEvaluation.reason}`;
    }
    if (status === 'completed') {
        return `Closed loop completed after ${state.iteration} iteration(s) with ${state.retryCount} retry(ies).`;
    }
    if (status === 'escalated') {
        return `Closed loop escalated to operator after ${state.retryCount} retry(ies) — manual review required.`;
    }
    return `Closed loop ended with status ${status}.`;
}
/** Factory for programmatic / CLI use. */
export function createClosedLoop(opts) {
    return new ClosedLoop(opts);
}
//# sourceMappingURL=closed-loop.js.map