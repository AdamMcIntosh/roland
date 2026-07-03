/**
 * Loop health diagnostics — aggregated report for /api/loop-health.
 */
import { type LoopState } from './loop-state.js';
import { computeLoopMetrics } from './loop-observability.js';
export type LoopHealthStatus = 'healthy' | 'degraded' | 'escalated' | 'idle' | 'unknown';
export interface LoopHealthReport {
    status: LoopHealthStatus;
    healthy: boolean;
    timestamp: number;
    stateDir: string;
    loop: {
        active: boolean;
        templateId: string | null;
        currentPhase: string | null;
        iteration: number | null;
        retryCount: number | null;
        runStatus: string | null;
        lastVerificationPass: boolean | null;
        lastCritiqueDecision: string | null;
        /** EvaluationGate weighted confidence (0–1). */
        confidence: number | null;
        /** True when confidence meets threshold and required gates passed. */
        verificationAccepted: boolean | null;
    };
    /** Recent PACVRE transitions for dashboard timeline. */
    phaseHistory: Array<{
        phase: string;
        success?: boolean;
        summary?: string;
        startedAt: number;
        completedAt?: number;
    }>;
    /** Specialist spawn intents recorded on the blackboard during closed-loop runs. */
    specialistSpawns: Array<{
        primaryAgent: string;
        phase: string;
        reason: string;
        iteration: number;
        spawnedAt: number;
        supportingAgents: string[];
    }>;
    /** PR draft artifact when closed loop completes or escalates. */
    closedLoopPr: {
        title: string;
        body: string;
        status: string;
        iteration: number;
        at: number;
        loopId?: string;
        exitReason?: string;
    } | null;
    /** LoopMemory disk persistence summary. */
    loopMemory: {
        loopId: string | null;
        reflectionCount: number;
        confidenceStreak: number;
        lastReflection: string | null;
        betweenIterationRuns: number;
    } | null;
    /** Latest exit condition evaluation statuses. */
    exitConditions: Array<{
        id: string;
        type: string;
        description: string;
        met: boolean;
        reason: string;
    }>;
    exitEvaluation: {
        shouldExit: boolean;
        reason: string;
        at: number | null;
    } | null;
    metrics: ReturnType<typeof computeLoopMetrics> | null;
    historySummary: string | null;
    checkpoint: {
        present: boolean;
        phase: string | null;
        savedAt: number | null;
    };
    supervisor: {
        alive: boolean;
        pid: number | null;
        restarts: number | null;
    };
    files: {
        loopState: boolean;
        loopMetrics: boolean;
        loopHistory: boolean;
        loopCheckpoint: boolean;
        runState: boolean;
        loopMemory: boolean;
    };
    diagnostics: string[];
    actions: {
        canResume: boolean;
        canReplan: boolean;
        hitlResumeCmd: string;
        hitlReplanCmd: string;
        gitCommitApproveCmd: string;
        gitCommitRejectCmd: string;
    };
    templates: Array<{
        name: string;
        description: string;
        phaseCount: number;
    }>;
    /** Active role-based model routing (Loop Engineering). */
    roleRouting: {
        summary: string;
        defaultDispatch?: string;
        cursorSdkAvailable?: boolean;
        roles: Record<string, {
            provider: string;
            model: string;
            displayLabel: string;
            isFallback: boolean;
            dispatchMethod?: string;
            sdkModelId?: string;
            directProvider?: string;
            directModel?: string;
        }>;
        phaseModels: Record<string, string>;
        phaseDispatch?: Record<string, string>;
    } | null;
    /** Legacy PM Team integration status. */
    pmIntegration: {
        enabled: boolean;
        configured: boolean;
        reason: string;
        executionPath: string;
        label: string;
    };
    /** Compact completion summary when loop is finished or escalated. */
    loopSummary: {
        status: string;
        iterations: number;
        retryCount: number;
        confidence: number | null;
        exitReason: string | null;
        complete: boolean;
    } | null;
    /** Real-time activity during active loop runs. */
    liveActivity: LoopState['liveActivity'] | null;
    /** Pending git-commit HITL approval. */
    pendingGitCommitApproval: LoopState['pendingGitCommitApproval'] | null;
    /** Recent spawn activity pulses. */
    spawnActivityHistory: LoopState['spawnActivityHistory'] | null;
}
export declare function buildLoopHealthReport(stateDir: string): LoopHealthReport;
//# sourceMappingURL=loop-health.d.ts.map