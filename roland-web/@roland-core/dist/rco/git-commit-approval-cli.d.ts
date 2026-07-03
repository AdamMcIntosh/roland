/**
 * ## Assumptions
 * - Git-commit HITL uses `.roland/git-commit-approval.json` (same file as dashboard API).
 * - CLI writes decisions via GitCommitApprovalQueue; the loop polls and resumes automatically.
 * - Only one pending approval file exists per state dir; id is optional when status is pending.
 * - Missing, expired, or id-mismatch approvals exit non-zero with actionable messages.
 */
import { type GitCommitApprovalRequest } from '../loop-engine/git-commit-approval.js';
export type GitCommitApprovalCliDecision = 'approve' | 'reject';
export interface GitCommitApprovalCliOptions {
    stateDir?: string;
    id?: string;
    message?: string;
    reason?: string;
    /** When true, print pending approval details (interactive listing). */
    interactive?: boolean;
}
export interface GitCommitApprovalCliResult {
    ok: boolean;
    exitCode: number;
    decision?: GitCommitApprovalCliDecision;
    id?: string;
    message?: string;
    reason?: string;
    error?: string;
}
/** Read pending approval from disk; returns null when none or not pending. */
export declare function readPendingGitCommitApproval(stateDir: string): GitCommitApprovalRequest | null;
/** Resolve approval id — explicit arg or single pending request in state dir. */
export declare function resolveGitCommitApprovalId(stateDir: string, explicitId?: string): {
    id: string;
    request: GitCommitApprovalRequest;
} | {
    error: string;
    exitCode: number;
};
/** Print pending approval details for interactive terminal use. */
export declare function printPendingGitCommitApproval(stateDir: string): boolean;
/** Apply approve/reject decision (same backend as dashboard API). */
export declare function decideGitCommitApprovalCli(decision: GitCommitApprovalCliDecision, opts?: GitCommitApprovalCliOptions): GitCommitApprovalCliResult;
/** CLI entry: `roland approve-commit [id] [--message "..."]` */
export declare function runApproveCommitCli(argv: string[]): number;
/** CLI entry: `roland reject-commit [id] [--reason "..."]` */
export declare function runRejectCommitCli(argv: string[]): number;
/** Print git-commit approval section for `roland hitl-status`. */
export declare function printGitCommitApprovalStatus(stateDir: string): void;
//# sourceMappingURL=git-commit-approval-cli.d.ts.map