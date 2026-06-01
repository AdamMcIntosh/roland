/**
 * RCO Team Orchestrator — PM-style parallel agent execution with review loop.
 *
 * Execution flow:
 *
 *   Phase 1 — Lead PM planning
 *     The Lead PM (Grok 4.3) reads the goal + Blackboard + roster and
 *     returns a structured task plan.
 *
 *   Phase 2 — Iterated wave execution (the PM control loop)
 *     Each wave runs all ready tasks in parallel. After every wave:
 *       - Worker signals are parsed (blockers posted to Blackboard, messages to Bus)
 *       - PM reviews results; blockers are surfaced prominently
 *       - PM decides: continue | adjust (spawn / unblock / re-scope)
 *     Loop continues until no tasks remain.
 *
 *   Phase 3 — Lead PM synthesis
 *     The PM reviews all results and produces the final deliverable.
 */
import type { ReviewDecision, ReviewTask } from './pm-prompts.js';
import { HitlQueue } from './hitl.js';
export interface TeamTask extends ReviewTask {
}
export interface TeamPlan {
    tasks: TeamTask[];
    pmNotes?: string;
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
    onTaskStart?: (taskId: string, agent: string, title: string) => void;
    onTaskComplete?: (taskId: string, agent: string, output: string, hadBlocker: boolean) => void;
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
}
export declare function runTeam(opts: TeamOrchestratorOptions): Promise<TeamResult>;
//# sourceMappingURL=team-orchestrator.d.ts.map