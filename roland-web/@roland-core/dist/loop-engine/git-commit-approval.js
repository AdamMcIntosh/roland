/**
 * ## Assumptions
 * - Human-in-the-loop git-commit approval uses `.roland/git-commit-approval.json`.
 * - Dashboard / CLI write decisions; the loop polls until approve, reject, or timeout.
 * - Safe default: require_approval is false unless explicitly set in template/config.
 * - auto_reject_on_timeout defaults true when require_approval is enabled.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { emitHermesHitlEvent } from '../rco/hitl-hermes.js';
export const GIT_COMMIT_APPROVAL_FILE = 'git-commit-approval.json';
export const GIT_COMMIT_APPROVAL_POLL_MS = 2_000;
export const DEFAULT_GIT_COMMIT_APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function logApproval(msg, detail) {
    const line = `[Loop][git-commit-approval] ${msg}`;
    if (detail && Object.keys(detail).length > 0) {
        console.error(line, detail);
    }
    else {
        console.error(line);
    }
}
/** File-backed queue for git-commit HITL approval (dashboard + loop poll). */
export class GitCommitApprovalQueue {
    filePath;
    constructor(stateDir) {
        this.filePath = path.join(stateDir, GIT_COMMIT_APPROVAL_FILE);
    }
    submit(partial) {
        const now = Date.now();
        const request = {
            id: randomUUID().slice(0, 12),
            iteration: partial.iteration,
            hookLabel: partial.hookLabel,
            message: partial.message,
            statusPreview: partial.statusPreview,
            cwd: partial.cwd,
            createdAt: now,
            timeoutAt: now + partial.timeoutMs,
            autoRejectOnTimeout: partial.autoRejectOnTimeout,
            status: 'pending',
        };
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(request, null, 2), 'utf-8');
        logApproval('approval requested', {
            id: request.id,
            iteration: request.iteration,
            timeoutMs: partial.timeoutMs,
        });
        try {
            const stateDir = path.dirname(this.filePath);
            emitHermesHitlEvent(stateDir, {
                kind: 'git-commit-approval',
                blockerDescription: request.message.slice(0, 200),
                currentGate: 'git-commit',
                suggestedActions: [
                    `roland approve-commit ${request.id}`,
                    `roland reject-commit ${request.id}`,
                    'roland hitl-status',
                ],
                detail: {
                    id: request.id,
                    iteration: request.iteration,
                    hookLabel: request.hookLabel,
                    timeoutAt: request.timeoutAt,
                },
            });
        }
        catch {
            /* Hermes propagation must not block approval queue */
        }
        return request;
    }
    read() {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    /** Operator-side: approve, reject, or approve with edited message. */
    decide(id, decision, opts = {}) {
        const current = this.read();
        if (!current || current.id !== id || current.status !== 'pending') {
            return false;
        }
        const now = Date.now();
        const next = {
            ...current,
            status: decision === 'approve' ? 'approved' : 'rejected',
            decisionAt: now,
            approvedMessage: decision === 'approve' ? (opts.message?.trim() || current.message) : undefined,
            reason: opts.reason,
        };
        fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
        logApproval(`decision: ${next.status}`, { id, reason: opts.reason });
        return true;
    }
    markTimeout(id) {
        const current = this.read();
        if (!current || current.id !== id || current.status !== 'pending')
            return;
        const next = {
            ...current,
            status: 'timeout',
            decisionAt: Date.now(),
            reason: 'Approval timeout — auto-rejected',
        };
        fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
        logApproval('approval timed out', { id });
    }
    clear() {
        try {
            fs.rmSync(this.filePath, { force: true });
        }
        catch {
            // Non-fatal.
        }
    }
    /** Loop-side: poll until operator decides or timeout elapses. */
    async waitForDecision(id, timeoutMs, pollMs = GIT_COMMIT_APPROVAL_POLL_MS) {
        const deadline = Date.now() + timeoutMs;
        logApproval('waiting for operator decision', {
            id,
            timeoutMs,
            hint: 'Approve via `roland approve-commit`, dashboard, or POST /api/git-commit-approval/approve',
        });
        while (Date.now() < deadline) {
            await sleep(pollMs);
            const current = this.read();
            if (!current || current.id !== id) {
                return {
                    approved: false,
                    message: current?.message ?? '',
                    reason: 'Approval request missing or replaced',
                    timedOut: false,
                    rejected: true,
                };
            }
            if (current.status === 'approved') {
                return {
                    approved: true,
                    message: current.approvedMessage ?? current.message,
                    timedOut: false,
                    rejected: false,
                };
            }
            if (current.status === 'rejected') {
                return {
                    approved: false,
                    message: current.message,
                    reason: current.reason ?? 'Operator rejected commit',
                    timedOut: false,
                    rejected: true,
                };
            }
            if (current.status === 'timeout') {
                return {
                    approved: false,
                    message: current.message,
                    reason: current.reason ?? 'Approval timed out',
                    timedOut: true,
                    rejected: true,
                };
            }
            if (Date.now() >= current.timeoutAt) {
                if (current.autoRejectOnTimeout) {
                    this.markTimeout(id);
                    return {
                        approved: false,
                        message: current.message,
                        reason: 'Approval timeout — auto-rejected',
                        timedOut: true,
                        rejected: true,
                    };
                }
                // Continue waiting until outer deadline when auto-reject disabled.
            }
        }
        const current = this.read();
        if (current?.autoRejectOnTimeout !== false) {
            this.markTimeout(id);
        }
        return {
            approved: false,
            message: current?.message ?? '',
            reason: 'Approval wait deadline exceeded',
            timedOut: true,
            rejected: true,
        };
    }
}
//# sourceMappingURL=git-commit-approval.js.map