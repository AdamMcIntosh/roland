/**
 * ## CLI-First + Hermes Monitoring Shift
 *
 * Assumptions:
 * - Hermes is the primary PM / strategist; Roland ClosedLoop owns loop-template missions.
 * - CLI + MCP (`hitl_status`, `poll_hitl_events`, `mission_summary`) are the monitoring backbone.
 * - Dashboard is optional adjunct — not required for mission visibility.
 * - [DEPRECATED] Legacy PM team mode (plan → waves → synthesis) serves non-loop missions only.
 *
 * ## Dashboard De-emphasized — CLI + Hermes Hybrid Complete
 *
 * RCO Team Orchestrator — [DEPRECATED] PM-style parallel agent execution with review loop.
 *
 * Execution flow ([DEPRECATED] legacy PM path only):
 *
 *   Phase 1 — [DEPRECATED] Lead PM planning
 *     The Lead PM (Grok 4.3) reads the goal + Blackboard + roster and
 *     returns a structured task plan.
 *
 *   Phase 2 — Iterated wave execution (the PM control loop)
 *     Each wave runs all ready tasks in parallel (DAG-aware via dependsOn).
 *     Mission graph persisted to `.roland/mission-dag.json` when DAG planning
 *     is enabled; wave scheduling unchanged for flat plans.
 *       - Worker signals are parsed (blockers posted to Blackboard, messages to Bus)
 *       - PM reviews results; blockers are surfaced prominently
 *       - PM decides: continue | adjust (spawn / unblock / re-scope)
 *     Loop continues until no tasks remain.
 *
 *   Phase 3 — Lead PM synthesis
 *     The PM reviews all results and produces the final deliverable.
 */
import type { ReviewDecision, ReviewTask } from './pm-prompts.js';
import { type MissionPlanningMode } from './mission-dag.js';
import type { LoopHooks } from '../loop-engine/index.js';
import { HitlQueue } from './hitl.js';
import { type TaskGitInfo } from './task-git-workflow.js';
export interface TeamTask extends ReviewTask {
}
export interface TeamPlan {
    tasks: TeamTask[];
    pmNotes?: string;
    /** Explicit DAG planning from Lead PM; omitted = flat (backward-compatible). */
    planningMode?: MissionPlanningMode;
    dagNotes?: string;
}
export interface TeamTaskResult {
    taskTitle: string;
    agent: string;
    output: string;
    hadBlocker: boolean;
}
export interface TeamResult {
    goal: string;
    plan: TeamPlan;
    taskResults: Record<string, TeamTaskResult>;
    synthesis: string;
    wavesRun: number;
    blockersEncountered: number;
}
/** Payload delivered to the `onCircuitBreak` callback when the wave circuit breaker opens. */
export interface CircuitBreakInfo {
    waveNumber: number;
    errorCount: number;
    failedAgents: string[];
    savedTasks: Array<{
        id: string;
        agent: string;
        title: string;
    }>;
    blockedTasks: Array<{
        id: string;
        agent: string;
        title: string;
    }>;
}
export interface TeamOrchestratorOptions {
    goal: string;
    stateDir?: string;
    agentsDir?: string;
    /** Fired once after the Lead PM produces the initial task plan. */
    onPlanReady?: (tasks: TeamTask[]) => void;
    /** Fired before each wave's parallel tasks begin executing. */
    onWaveStart?: (waveNumber: number, tasks: TeamTask[]) => void;
    /** Fired just before a single task's agent call is dispatched. */
    onTaskStart?: (taskId: string, agent: string, title: string, git?: TaskGitInfo) => void;
    onTaskComplete?: (taskId: string, agent: string, output: string, hadBlocker: boolean, git?: TaskGitInfo) => void;
    onWaveComplete?: (waveNumber: number, decision: ReviewDecision) => void;
    /** Fired just before the PM agent reviews a completed wave. */
    onWaveReview?: (waveNumber: number) => void;
    /** Fired when the PM spawns additional tasks during an adjust decision. */
    onTasksSpawned?: (tasks: TeamTask[]) => void;
    /** Fired just before the Lead PM begins the final synthesis. */
    onSynthesizing?: () => void;
    /**
     * Fired when an agent signals a BLOCKER.
     * Receives: taskId, agent name, blocker description, current wave number.
     * Use this to fire contextual notifications from the calling code.
     */
    onBlockerDetected?: (taskId: string, agent: string, description: string, waveNumber: number) => void;
    /**
     * HITL command queue. When provided, the orchestrator polls it at the start
     * of each wave and acts on pause / resume / unblock / inject / replan / abort.
     */
    hitlQueue?: HitlQueue;
    /** Fired when the run is paused (paused=true) or resumed (paused=false). */
    onHitlPause?: (paused: boolean) => void;
    /** Fired when an abort command is queued — run will stop after current wave. */
    onAbortPending?: () => void;
    /**
     * Skip the self-improvement retrospective phase entirely.
     * Pass true for CI runs, benchmarks, or short one-off tasks.
     * Default: false.
     */
    noImprove?: boolean;
    /**
     * When true, the retrospective shows an interactive approval prompt (TTY only).
     * When false, new memory bullets are auto-accepted without user interaction.
     * Default: false (auto-accept).
     */
    interactive?: boolean;
    /**
     * Fired when the wave circuit breaker opens — a terminal network error has
     * exhausted all retries for at least one agent. Carries partial progress so
     * callers can render a rich UI (saved tasks, blocked tasks, resume command).
     * The run is paused via HITL immediately after this callback returns.
     */
    onCircuitBreak?: (info: CircuitBreakInfo) => void;
    /**
     * Existing readline interface to reuse for interactive prompts (rating, memory
     * approval). When provided, no competing readline is created on stdin — required
     * when called from the chat REPL to prevent closing stdin and killing the loop.
     */
    rl?: import('readline').Interface;
    /**
     * When true (default), tasks are executed one at a time with a PM review
     * after each individual task. This gives maximum PM control and uses only
     * one Cursor API connection at a time — recommended for long, complex goals
     * and unstable connections.
     *
     * When false (parallel mode), all dependency-free tasks in a wave run
     * concurrently up to MAX_CONCURRENT_AGENTS. Enable with --parallel or
     * ROLAND_PARALLEL=1.
     */
    sequential?: boolean;
    /** When true, suppress SDK shell-exec close-timeout noise on stderr. */
    quiet?: boolean;
    /**
     * Loop template id (e.g. "standard-code-loop", "research-loop").
     * When set, LoopEngine tracks phase transitions and persists to loop-state.json.
     */
    loopTemplate?: string;
    /** Fired when loop phase state changes (wire to RunStateWriter.updateLoopState). */
    onLoopStateChange?: LoopHooks['onStateChange'];
    /** Inject verify-phase command runner (tests / loop-orchestrator ClosedLoop path). */
    loopRunner?: import('../loop-engine/verification/index.js').CommandRunner;
    /**
     * When embedded inside ClosedLoop, limits PM Team scope:
     * - `plan-only`: Lead PM planning then return (no waves/synthesis)
     * - `waves-only`: Execute waves from `existingPlan` (skip planning/synthesis)
     */
    pmSlice?: 'plan-only' | 'waves-only';
    /** Plan from a prior ClosedLoop Plan phase (required for `waves-only`). */
    existingPlan?: TeamPlan;
    /** Suppress mission-start board cleanup when ClosedLoop already initialized boards. */
    loopEmbedded?: boolean;
    /** Loop iteration number for logging when embedded in ClosedLoop. */
    loopIteration?: number;
    /** Explicit opt-in for legacy PM Team inside ClosedLoop Plan/Act (default: config/template policy). */
    enablePmIntegration?: boolean;
}
export declare function runTeam(opts: TeamOrchestratorOptions): Promise<TeamResult>;
/**
 * ## Final Legacy Cleanup + Model Router Integration Complete
 *
 * Routing at top of `runTeamInner()`:
 * ```typescript
 * if (hasLoopTemplate(opts.loopTemplate)) {
 *   return runClosedLoopMission(opts); // ClosedLoop — 100% loop path
 * }
 * // TODO: Legacy PM Team — plan → waves → synthesis below
 * ```
 */
//# sourceMappingURL=team-orchestrator.d.ts.map