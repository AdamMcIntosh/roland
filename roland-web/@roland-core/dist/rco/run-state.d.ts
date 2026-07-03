/**
 * ## MCP Project Context Fix
 *
 * RunState — persists real-time orchestrator state to .roland/run-state.json.
 *
 * Written by the orchestrator (via RunStateWriter) during every lifecycle event.
 * Read by the TUI renderer and `roland status` observer.
 */
export declare const RUN_STATE_FILE = "run-state.json";
export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'blocked';
export type RunStatus = 'planning' | 'running' | 'reviewing' | 'synthesizing' | 'done' | 'error';
/** Loop Engineering phase — mirrors src/loop-engine/loop-phases.ts */
export type LoopPhase = 'plan' | 'act' | 'verify' | 'critique' | 'retry' | 'escalate' | 'observe' | 'reflect';
/** Git branch / PR metadata for executor tasks (populated by task-git-workflow). */
export interface TaskGitState {
    branch?: string;
    phase?: string;
    statusLabel?: string;
    prUrl?: string;
    prNumber?: number;
}
export interface TaskRunState {
    id: string;
    title: string;
    agent: string;
    wave: number;
    status: TaskStatus;
    startedAt?: number;
    completedAt?: number;
    hadBlocker?: boolean;
    /** Last 300 chars of agent output, set on completion. */
    outputPreview?: string;
    /** Branch / PR workflow state when task is an executor. */
    git?: TaskGitState;
}
export interface RunState {
    runId: string;
    goal: string;
    startedAt: number;
    updatedAt: number;
    /** Launch channel mirrored from mission-meta / ROLAND_TRIGGERED_VIA. */
    triggeredVia?: 'mcp' | 'cli' | 'dashboard' | 'cursor';
    status: RunStatus;
    currentWave: number;
    totalTasks: number;
    completedTasks: number;
    tasks: TaskRunState[];
    /** IDs of tasks currently executing (used to drive activity indicator). */
    activeTaskIds: string[];
    pmNotes?: string;
    errorMessage?: string;
    /** True while run is paused via `roland pause`. Updated by orchestrator. */
    hitlPaused?: boolean;
    /** True after `roland abort` is queued, before it is processed. */
    hitlAbortPending?: boolean;
    /** Set when the wave circuit breaker opens due to connection errors. */
    connectionDropped?: boolean;
    /** Human-readable detail about the connection drop (wave, agent count, etc.). */
    connectionDropMessage?: string;
    /** Active loop template id when Loop Engineering is enabled. */
    loopTemplateId?: string;
    /** Current loop phase (dashboard observability). */
    loopPhase?: LoopPhase;
    /** Outer loop iteration counter. */
    loopIteration?: number;
    /** Last verification gate result. */
    lastVerification?: {
        pass: boolean;
        summary: string;
        at: number;
        durationMs?: number;
        confidence?: number;
        accepted?: boolean;
        strategies?: Array<{
            type: string;
            pass: boolean;
            durationMs: number;
            failures?: string[];
        }>;
    };
    /** Last critique snapshot — summary + retry decision for Mission Intel. */
    lastCritique?: {
        summary: string;
        retryDecision: 'proceed' | 'retry' | 'retry_focused' | 'escalate';
        model: 'critic' | 'coding' | 'grok' | 'composer';
        at: number;
        iteration: number;
        issueCount?: number;
        strengths?: string[];
        issues?: string[];
        suggestions?: string[];
    };
    /** Loop retry counter (dashboard observability). */
    loopRetryCount?: number;
    /** Loop run status mirrored from loop-state.json. */
    loopStatus?: 'running' | 'completed' | 'failed' | 'escalated';
    /** Compact phase timeline for dashboard (most recent transitions). */
    loopPhaseHistory?: Array<{
        phase: string;
        success?: boolean;
        summary?: string;
        startedAt: number;
        completedAt?: number;
    }>;
    /** Last retry snapshot — strategy, focus areas, backoff. */
    lastRetry?: {
        attempt: number;
        strategy: 'full' | 'focused';
        focusAreas: string[];
        backoffMs: number;
        at: number;
    };
    /** Active ModelRouter snapshot for dashboard loop panel. */
    modelRouting?: {
        summary: string;
        roles: Record<string, {
            provider: string;
            model: string;
            displayLabel: string;
            isFallback: boolean;
        }>;
        phaseModels?: Record<string, string>;
    };
    /** Legacy PM Team integration status for active loop. */
    pmIntegration?: {
        enabled: boolean;
        reason: string;
        executionPath?: 'pm_team' | 'lightweight';
    };
    /** Real-time loop activity for live dashboard panel. */
    liveActivity?: {
        kind: 'phase' | 'verification' | 'hook' | 'spawn' | 'idle' | 'approval';
        label: string;
        detail?: string;
        startedAt: number;
        dispatchMethod?: string;
        executionMode?: string;
        verificationStrategies?: Array<{
            type: string;
            status: 'pending' | 'running' | 'pass' | 'fail' | 'skipped';
            weight?: number;
            confidence?: number;
        }>;
        activeHook?: {
            label: string;
            dryRun?: boolean;
            action?: string;
            requireApproval?: boolean;
        };
        progressSummary?: string;
    };
    /** Pending git-commit HITL approval for dashboard. */
    pendingGitCommitApproval?: {
        id: string;
        message: string;
        statusPreview: string;
        iteration: number;
        requestedAt: number;
        timeoutAt: number;
        status: 'pending' | 'approved' | 'rejected' | 'timeout';
    };
    /** Recent specialist spawn pulses. */
    spawnActivityHistory?: Array<{
        role: string;
        phase: string;
        count: number;
        label: string;
        at: number;
    }>;
}
export declare class RunStateWriter {
    private state;
    private readonly filePath;
    constructor(stateDir: string, goal: string, opts?: {
        triggeredVia?: RunState['triggeredVia'];
    });
    planReady(tasks: Array<{
        id: string;
        title: string;
        agent: string;
    }>): void;
    waveStart(waveNumber: number, taskIds: string[]): void;
    taskStart(id: string, git?: TaskGitState): void;
    taskComplete(id: string, output: string, hadBlocker: boolean, git?: TaskGitState): void;
    taskGitUpdate(id: string, git: TaskGitState): void;
    waveReviewing(): void;
    waveComplete(pmNotes?: string): void;
    /** Add tasks dynamically spawned by the PM during review. */
    addTasks(tasks: Array<{
        id: string;
        title: string;
        agent: string;
    }>): void;
    synthesizing(): void;
    setHitlPaused(paused: boolean): void;
    setAbortPending(): void;
    setConnectionDropped(message: string): void;
    clearConnectionDropped(): void;
    done(): void;
    error(message: string): void;
    /** Sync loop-engine state into run-state.json for dashboard / bg-status. */
    updateLoopState(fields: {
        loopTemplateId?: string;
        loopPhase?: LoopPhase;
        loopIteration?: number;
        loopRetryCount?: number;
        loopStatus?: 'running' | 'completed' | 'failed' | 'escalated';
        loopPhaseHistory?: Array<{
            phase: string;
            success?: boolean;
            summary?: string;
            startedAt: number;
            completedAt?: number;
        }>;
        lastVerification?: {
            pass: boolean;
            summary: string;
            at: number;
            durationMs?: number;
            confidence?: number;
            accepted?: boolean;
            strategies?: Array<{
                type: string;
                pass: boolean;
                durationMs: number;
                failures?: string[];
            }>;
        };
        lastCritique?: {
            summary: string;
            retryDecision: 'proceed' | 'retry' | 'retry_focused' | 'escalate';
            model: 'critic' | 'coding' | 'grok' | 'composer';
            at: number;
            iteration: number;
            issueCount?: number;
            strengths?: string[];
            issues?: string[];
            suggestions?: string[];
        };
        lastRetry?: {
            attempt: number;
            strategy: 'full' | 'focused';
            focusAreas: string[];
            backoffMs: number;
            at: number;
        };
        modelRouting?: RunState['modelRouting'];
        pmIntegration?: RunState['pmIntegration'];
        liveActivity?: RunState['liveActivity'];
        pendingGitCommitApproval?: RunState['pendingGitCommitApproval'];
        spawnActivityHistory?: RunState['spawnActivityHistory'];
    }): void;
    get(): RunState;
    private flush;
}
export declare function readRunState(stateDir: string): RunState | null;
//# sourceMappingURL=run-state.d.ts.map