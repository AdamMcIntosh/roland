/**
 * ## Assumptions
 * - Between-iterations hooks run via the same CommandRunner as TestExecutor (shell, injectable).
 * - git-commit with require_approval + dry_run:false pauses until operator approves via dashboard.
 * - dry_run / noOp hooks log intent without executing.
 * - exit_on_failure stops the loop when hook fails (unless optional).
 */
import type { CommandRunner } from './verification/index.js';
import type { LoopMemory, BetweenIterationRun } from './loop-memory.js';
import type { ResolvedBetweenIterationsHook } from './loop-template-resolution.js';
import type { LoopGitCommitApprovalSnapshot } from './loop-state.js';
export interface BetweenIterationsOptions {
    /** Legacy: raw command string. Prefer `hook` for full config. */
    command?: string;
    hook?: ResolvedBetweenIterationsHook;
    iteration: number;
    cwd?: string;
    timeoutMs?: number;
    runner?: CommandRunner;
    memory: LoopMemory;
    /** Interpolation vars for git-commit message_template. */
    hookVars?: Record<string, string | number | undefined>;
    /** State dir for HITL approval file (`.roland/git-commit-approval.json`). */
    stateDir?: string;
    /** Called when git-commit approval is pending (dashboard visibility). */
    onApprovalPending?: (snapshot: LoopGitCommitApprovalSnapshot) => void;
    /** Called when approval resolves (approve/reject/timeout). */
    onApprovalResolved?: () => void;
}
export interface BetweenIterationsResult {
    run: BetweenIterationRun;
    success: boolean;
    /** When exit_on_failure is set and hook failed. */
    fatal?: boolean;
}
/**
 * Run a between-iterations hook and persist results to LoopMemory.
 */
export declare function runBetweenIterations(opts: BetweenIterationsOptions): Promise<BetweenIterationsResult>;
/**
 * ## HITL Git-Commit Approval + Between-Iterations Hooks Complete
 *
 * git-commit supports require_approval for operator confirm/reject/edit via dashboard.
 */
//# sourceMappingURL=between-iterations.d.ts.map