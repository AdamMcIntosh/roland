/**
 * ## Assumptions
 * - Human-in-the-loop git-commit approval uses `.roland/git-commit-approval.json`.
 * - Dashboard / CLI write decisions; the loop polls until approve, reject, or timeout.
 * - Safe default: require_approval is false unless explicitly set in template/config.
 * - auto_reject_on_timeout defaults true when require_approval is enabled.
 */
export declare const GIT_COMMIT_APPROVAL_FILE = "git-commit-approval.json";
export declare const GIT_COMMIT_APPROVAL_POLL_MS = 2000;
export declare const DEFAULT_GIT_COMMIT_APPROVAL_TIMEOUT_MS: number;
export type GitCommitApprovalDecision = 'pending' | 'approved' | 'rejected' | 'timeout';
export interface GitCommitApprovalRequest {
    id: string;
    iteration: number;
    hookLabel: string;
    message: string;
    statusPreview: string;
    cwd: string;
    createdAt: number;
    timeoutAt: number;
    autoRejectOnTimeout: boolean;
    status: GitCommitApprovalDecision;
    decisionAt?: number;
    /** Operator-edited commit message when approved. */
    approvedMessage?: string;
    reason?: string;
}
export interface GitCommitApprovalWaitResult {
    approved: boolean;
    message: string;
    reason?: string;
    timedOut: boolean;
    rejected: boolean;
}
/** File-backed queue for git-commit HITL approval (dashboard + loop poll). */
export declare class GitCommitApprovalQueue {
    private readonly filePath;
    constructor(stateDir: string);
    submit(partial: Omit<GitCommitApprovalRequest, 'id' | 'createdAt' | 'status' | 'timeoutAt'> & {
        timeoutMs: number;
    }): GitCommitApprovalRequest;
    read(): GitCommitApprovalRequest | null;
    /** Operator-side: approve, reject, or approve with edited message. */
    decide(id: string, decision: 'approve' | 'reject', opts?: {
        message?: string;
        reason?: string;
    }): boolean;
    markTimeout(id: string): void;
    clear(): void;
    /** Loop-side: poll until operator decides or timeout elapses. */
    waitForDecision(id: string, timeoutMs: number, pollMs?: number): Promise<GitCommitApprovalWaitResult>;
}
//# sourceMappingURL=git-commit-approval.d.ts.map