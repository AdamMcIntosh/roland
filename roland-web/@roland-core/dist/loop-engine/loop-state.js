/**
 * ## P1 Final Consolidation (v1.4.0)
 *
 * Loop state persistence — `.roland/loop-state.json`
 *
 * Survives supervisor restarts; read by dashboard via run-state loop fields.
 * Writes use stateLock + safe-write (writeUtf8Json) for UTF-8 persistence.
 */
import fs from 'fs';
import path from 'path';
import { acquireLock, readStateUnlocked, writeStateUnlocked } from '../rco/stateLock.js';
export const LOOP_STATE_FILE = 'loop-state.json';
export function createInitialLoopState(templateId, goal, firstPhase) {
    const now = Date.now();
    return {
        templateId,
        goal,
        iteration: 1,
        retryCount: 0,
        currentPhase: firstPhase,
        phaseHistory: [{ phase: firstPhase, startedAt: now }],
        status: 'running',
        startedAt: now,
        updatedAt: now,
    };
}
export class LoopStateStore {
    filePath;
    state;
    constructor(stateDir, initial, opts = {}) {
        fs.mkdirSync(stateDir, { recursive: true });
        this.filePath = path.join(stateDir, LOOP_STATE_FILE);
        this.state = initial;
        if (!opts.skipInitialFlush) {
            this.flush();
        }
    }
    /** Load existing loop-state.json when resuming, else create fresh state. */
    static loadOrCreate(stateDir, templateId, goal, firstPhase, resume) {
        if (resume) {
            const existing = readLoopState(stateDir);
            if (existing &&
                existing.status === 'running' &&
                existing.templateId === templateId &&
                existing.goal === goal) {
                console.error(`[Loop][state] Resuming from loop-state.json iteration=${existing.iteration} retryCount=${existing.retryCount}`);
                return new LoopStateStore(stateDir, existing, { skipInitialFlush: true });
            }
        }
        return new LoopStateStore(stateDir, createInitialLoopState(templateId, goal, firstPhase));
    }
    get() {
        return {
            ...this.state,
            phaseHistory: this.state.phaseHistory.map((t) => ({ ...t })),
            lastVerification: this.state.lastVerification
                ? { ...this.state.lastVerification }
                : undefined,
            lastCritique: this.state.lastCritique ? { ...this.state.lastCritique } : undefined,
            lastRetry: this.state.lastRetry ? { ...this.state.lastRetry } : undefined,
            critiqueHistory: this.state.critiqueHistory?.map((c) => ({ ...c })),
            retryHistory: this.state.retryHistory?.map((r) => ({ ...r })),
            exitConditionStatus: this.state.exitConditionStatus?.map((s) => ({ ...s })),
            lastExitEvaluation: this.state.lastExitEvaluation
                ? { ...this.state.lastExitEvaluation }
                : undefined,
            loopId: this.state.loopId,
            liveActivity: this.state.liveActivity ? { ...this.state.liveActivity } : undefined,
            pendingGitCommitApproval: this.state.pendingGitCommitApproval
                ? { ...this.state.pendingGitCommitApproval }
                : undefined,
            spawnActivityHistory: this.state.spawnActivityHistory?.map((s) => ({ ...s })),
            flakyVerification: this.state.flakyVerification
                ? { ...this.state.flakyVerification }
                : undefined,
        };
    }
    transitionTo(phase) {
        const now = Date.now();
        const last = this.state.phaseHistory[this.state.phaseHistory.length - 1];
        if (last && !last.completedAt) {
            last.completedAt = now;
        }
        this.state.currentPhase = phase;
        this.state.phaseHistory.push({ phase, startedAt: now });
        this.state.updatedAt = now;
        this.flush();
    }
    completePhase(phase, result) {
        const entry = [...this.state.phaseHistory].reverse().find((t) => t.phase === phase && !t.completedAt);
        const now = Date.now();
        if (entry) {
            entry.completedAt = now;
            entry.success = result.success;
            entry.summary = result.summary;
        }
        if (phase === 'verify') {
            this.state.lastVerification = result.verification ?? {
                pass: result.success,
                summary: result.summary,
                at: now,
            };
        }
        if (phase === 'critique' && result.critique) {
            this.state.lastCritique = result.critique;
            if (!this.state.critiqueHistory)
                this.state.critiqueHistory = [];
            this.state.critiqueHistory.push(result.critique);
        }
        if (phase === 'retry' && result.retry) {
            this.state.lastRetry = result.retry;
            if (!this.state.retryHistory)
                this.state.retryHistory = [];
            this.state.retryHistory.push(result.retry);
        }
        this.state.updatedAt = now;
        this.flush();
    }
    incrementIteration() {
        this.state.iteration += 1;
        // retryCount accumulates across iterations until success or escalation.
        this.state.updatedAt = Date.now();
        this.flush();
    }
    incrementRetry() {
        this.state.retryCount += 1;
        this.state.updatedAt = Date.now();
        this.flush();
    }
    setStatus(status) {
        this.state.status = status;
        this.state.updatedAt = Date.now();
        this.flush();
    }
    setLoopId(loopId) {
        this.state.loopId = loopId;
        this.state.updatedAt = Date.now();
        this.flush();
    }
    setExitEvaluation(statuses, evaluation) {
        this.state.exitConditionStatus = statuses;
        this.state.lastExitEvaluation = evaluation;
        this.state.updatedAt = Date.now();
        this.flush();
    }
    setLiveActivity(activity) {
        this.state.liveActivity = activity;
        this.state.updatedAt = Date.now();
        this.flush();
    }
    setPendingGitCommitApproval(snapshot) {
        this.state.pendingGitCommitApproval = snapshot;
        this.state.updatedAt = Date.now();
        this.flush();
    }
    appendSpawnPulse(pulse, maxHistory = 24) {
        if (!this.state.spawnActivityHistory) {
            this.state.spawnActivityHistory = [];
        }
        this.state.spawnActivityHistory.push(pulse);
        if (this.state.spawnActivityHistory.length > maxHistory) {
            this.state.spawnActivityHistory = this.state.spawnActivityHistory.slice(-maxHistory);
        }
        this.state.updatedAt = Date.now();
        this.flush();
    }
    getRecentSpawns() {
        return this.state.spawnActivityHistory?.map((s) => ({ ...s })) ?? [];
    }
    setFlakyVerification(flaky) {
        this.state.flakyVerification = flaky;
        this.state.updatedAt = Date.now();
        this.flush();
    }
    flush() {
        try {
            const release = acquireLock(this.filePath);
            try {
                writeStateUnlocked(this.filePath, this.state);
            }
            finally {
                release();
            }
        }
        catch {
            // Non-fatal — in-memory state still drives the current run.
        }
    }
}
export function readLoopState(stateDir) {
    const filePath = path.join(stateDir, LOOP_STATE_FILE);
    const release = acquireLock(filePath);
    try {
        return readStateUnlocked(filePath);
    }
    catch {
        return null;
    }
    finally {
        release();
    }
}
//# sourceMappingURL=loop-state.js.map