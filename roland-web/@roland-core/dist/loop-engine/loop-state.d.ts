/**
 * Loop state persistence — `.roland/loop-state.json`
 *
 * Survives supervisor restarts; read by dashboard via run-state loop fields.
 */
import type { LoopCritiqueSnapshot } from './self-improvement/types.js';
import type { Phase } from './loop-phases.js';
export type { LoopCritiqueSnapshot } from './self-improvement/types.js';
export declare const LOOP_STATE_FILE = "loop-state.json";
export type LoopRunStatus = 'running' | 'completed' | 'failed' | 'escalated';
export interface PhaseTransition {
    phase: Phase;
    startedAt: number;
    completedAt?: number;
    success?: boolean;
    summary?: string;
}
export interface LoopVerificationStrategySnapshot {
    type: string;
    pass: boolean;
    durationMs: number;
    failures?: string[];
    weight?: number;
    confidence?: number;
    status?: 'pending' | 'running' | 'pass' | 'fail' | 'skipped';
}
export interface LoopVerificationSnapshot {
    pass: boolean;
    summary: string;
    at: number;
    durationMs?: number;
    /** Weighted gate confidence (0–1) from EvaluationGate. */
    confidence?: number;
    /** True when confidence meets threshold and required gates passed. */
    accepted?: boolean;
    strategies?: LoopVerificationStrategySnapshot[];
}
/** Snapshot from retry phase — persisted for dashboard / resume. */
export interface LoopRetrySnapshot {
    attempt: number;
    strategy: 'full' | 'focused';
    focusAreas: string[];
    failedFiles: string[];
    backoffMs: number;
    at: number;
    iteration: number;
}
export interface LoopState {
    templateId: string;
    goal: string;
    iteration: number;
    retryCount: number;
    currentPhase: Phase;
    phaseHistory: PhaseTransition[];
    status: LoopRunStatus;
    startedAt: number;
    updatedAt: number;
    /** LoopMemory disk id when closed-loop harness is active. */
    loopId?: string;
    lastVerification?: LoopVerificationSnapshot;
    /** Most recent critique snapshot for dashboard / retry decisions. */
    lastCritique?: LoopCritiqueSnapshot;
    /** Most recent retry snapshot for dashboard / focused retry scope. */
    lastRetry?: LoopRetrySnapshot;
    /** Append-only critique history across iterations. */
    critiqueHistory?: LoopCritiqueSnapshot[];
    /** Append-only retry history across iterations. */
    retryHistory?: LoopRetrySnapshot[];
    /** Latest exit condition evaluation for dashboard visibility. */
    exitConditionStatus?: Array<{
        id: string;
        type: string;
        description: string;
        met: boolean;
        reason: string;
        evaluatedAt: number;
    }>;
    /** Summary of why the loop exited or continued. */
    lastExitEvaluation?: {
        shouldExit: boolean;
        reason: string;
        at: number;
    };
    /** Real-time activity for dashboard live panel during running loops. */
    liveActivity?: LoopLiveActivity;
    /** Pending git-commit HITL approval (when require_approval is enabled). */
    pendingGitCommitApproval?: LoopGitCommitApprovalSnapshot;
    /** Recent specialist spawn pulses for dashboard history. */
    spawnActivityHistory?: LoopSpawnPulse[];
}
export interface LoopSpawnPulse {
    role: string;
    phase: Phase;
    count: number;
    label: string;
    at: number;
}
export interface LoopGitCommitApprovalSnapshot {
    id: string;
    message: string;
    statusPreview: string;
    iteration: number;
    requestedAt: number;
    timeoutAt: number;
    status: 'pending' | 'approved' | 'rejected' | 'timeout';
}
export interface LoopLiveActivity {
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
    /** Most recent spawn pulse (kind=spawn). */
    spawnPulse?: LoopSpawnPulse;
    /** Rolling spawn history for dashboard (newest last). */
    recentSpawns?: LoopSpawnPulse[];
}
export declare function createInitialLoopState(templateId: string, goal: string, firstPhase: Phase): LoopState;
export declare class LoopStateStore {
    private readonly filePath;
    private state;
    constructor(stateDir: string, initial: LoopState, opts?: {
        skipInitialFlush?: boolean;
    });
    /** Load existing loop-state.json when resuming, else create fresh state. */
    static loadOrCreate(stateDir: string, templateId: string, goal: string, firstPhase: Phase, resume: boolean): LoopStateStore;
    get(): LoopState;
    transitionTo(phase: Phase): void;
    completePhase(phase: Phase, result: {
        success: boolean;
        summary: string;
        verification?: LoopVerificationSnapshot;
        critique?: LoopCritiqueSnapshot;
        retry?: LoopRetrySnapshot;
    }): void;
    incrementIteration(): void;
    incrementRetry(): void;
    setStatus(status: LoopRunStatus): void;
    setLoopId(loopId: string): void;
    setExitEvaluation(statuses: NonNullable<LoopState['exitConditionStatus']>, evaluation: NonNullable<LoopState['lastExitEvaluation']>): void;
    setLiveActivity(activity: LoopLiveActivity | undefined): void;
    setPendingGitCommitApproval(snapshot: LoopGitCommitApprovalSnapshot | undefined): void;
    appendSpawnPulse(pulse: LoopSpawnPulse, maxHistory?: number): void;
    getRecentSpawns(): LoopSpawnPulse[];
    private flush;
}
export declare function readLoopState(stateDir: string): LoopState | null;
//# sourceMappingURL=loop-state.d.ts.map