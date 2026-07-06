/**
 * ## Assumptions
 * - Hermes is the primary PM / strategist; Roland ClosedLoop is the loop execution engine.
 * - [DEPRECATED] Legacy PM Team opt-in via enablePmIntegration, loop_engine.use_pm_team, or template use_pm_team.
 * - ClosedLoop is the production entry point; LoopEngine remains the phase execution core.
 * - EvaluationGate replaces direct TestExecutor calls in the verify phase.
 * - PhaseIntentPoster fires on every phase transition via LoopHooks.
 * - LoopMemory persists reflections, exit tracking, and artifacts under `.roland/loops/<loop-id>/`.
 * - PR titles/descriptions are generated on loop completion via pr-format.ts.
 * - Checkpoint/recovery delegates to LoopEngine (loop-checkpoint.json + loop-state.json).
 */
import type { Blackboard } from '../coordination/legacy-blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import { type FormattedPr } from '../rco/pr-format.js';
import type { LoopTemplate } from './loop-phases.js';
import { LoopEngine, type LoopHooks, type LoopRunResult } from './loop-engine.js';
import type { LoopState, LoopRunStatus } from './loop-state.js';
import type { CustomCriterion } from './evaluation-gate.js';
import { PhaseIntentPoster } from './phase-intent-poster.js';
import type { CommandRunner } from './verification/index.js';
import { LoopMemory } from './loop-memory.js';
import { type PmIntegrationStatus } from './loop-pm-policy.js';
import type { TeamOrchestratorOptions } from '../rco/team-orchestrator.js';
export declare const CLOSED_LOOP_PR_FILE = "closed-loop-pr.json";
export interface ClosedLoopOptions {
    stateDir: string;
    goal: string;
    /** Template name from recipes/loops/ or inline template object. */
    template?: string | LoopTemplate;
    blackboard: Blackboard;
    commandBoard?: CommandBlackboard;
    /** Custom evaluation criteria beyond automated verifiers. */
    customCriteria?: CustomCriterion[];
    /** Inject command runner for tests. */
    runner?: CommandRunner;
    runId?: string;
    loopId?: string;
    cwd?: string;
    isTestMode?: boolean;
    recoverOnStart?: boolean;
    resumeFromState?: boolean;
    timeoutMs?: number;
    skipBackoff?: boolean;
    requireManualReview?: boolean;
    manualReviewApproved?: boolean;
    minConfidence?: number;
    hooks?: LoopHooks;
    /** [DEPRECATED] Explicit opt-in for legacy PM Team (overrides config/template). When false, pure ClosedLoop only. */
    enablePmIntegration?: boolean;
    /** Forwarded to embedded [DEPRECATED] legacy PM Team runs (HITL, wave callbacks). */
    teamOpts?: Partial<TeamOrchestratorOptions>;
}
export interface ClosedLoopResult extends LoopRunResult {
    formattedPr?: FormattedPr;
    spawnCount: number;
    loopId: string;
    loopDir: string;
    pmIntegration: PmIntegrationStatus;
}
/**
 * ClosedLoop — production closed-loop execution harness.
 *
 * Lifecycle: PLAN → ACT → VERIFY → CRITIQUE → RETRY → ESCALATE (optional) → OBSERVE → REFLECT → exit check.
 */
export declare class ClosedLoop {
    private readonly engine;
    private readonly spawner;
    private readonly opts;
    private readonly template;
    private readonly memory;
    private readonly modelRouter;
    private readonly pmIntegration;
    constructor(opts: ClosedLoopOptions);
    getPmIntegration(): PmIntegrationStatus;
    /** Run the full closed loop until complete, escalate, fail, timeout, or exit conditions met. */
    run(context?: {
        hadBlockers?: boolean;
        waveNumber?: number;
    }): Promise<ClosedLoopResult>;
    getState(): LoopState;
    getTemplate(): LoopTemplate;
    getEngine(): LoopEngine;
    getSpawner(): PhaseIntentPoster;
    getMemory(): LoopMemory;
    /** Build PR title/body from goal + loop outcome without persisting. */
    formatPr(state?: LoopState, status?: LoopRunStatus): FormattedPr;
    private persistFormattedPr;
    private findPhaseConfig;
    private onPhaseStart;
    private onPhaseComplete;
    private static resolveTemplate;
    private static mergeHooks;
}
/** Factory for programmatic / CLI use. */
export declare function createClosedLoop(opts: ClosedLoopOptions): ClosedLoop;
/**
 * ## Old PM Persona Deprecated — Hermes is Primary PM
 *
 * Default: Hermes + Pure ClosedLoop Plan/Act via lightweight-plan-act.ts.
 * [DEPRECATED] Legacy PM Team: opt-in via loop_engine.use_pm_team, template use_pm_team, or enablePmIntegration.
 *
 * ```yaml
 * loop_engine:
 *   use_pm_team: false   # default — Hermes PM + Pure ClosedLoop
 * models:
 *   pm: { provider: openrouter, model: grok-4.3 }
 *   coding: { provider: ollama, model: qwen3.5-coder:14b }
 * ```
 */
export {};
//# sourceMappingURL=closed-loop.d.ts.map