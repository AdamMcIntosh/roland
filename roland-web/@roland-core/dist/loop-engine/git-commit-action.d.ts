/**
 * ## Assumptions
 * - git-commit is a first-class between-iterations hook with dry_run default true.
 * - Real commits require explicit dry_run: false — never commit silently.
 * - Uses git-tools for mutating operations; preview uses status --short only.
 */
export interface GitCommitActionOptions {
    cwd: string;
    messageTemplate: string;
    includeFiles?: string[];
    autoStage?: boolean;
    dryRun: boolean;
    /** Template variables for message interpolation. */
    vars?: Record<string, string | number | undefined>;
    /** When set, use this literal message instead of interpolating messageTemplate. */
    literalMessage?: string;
}
export interface GitCommitActionResult {
    success: boolean;
    dryRun: boolean;
    message: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    sha?: string;
}
/**
 * Execute or preview the git-commit built-in hook.
 * dryRun (default true): show git status --short + proposed message without committing.
 */
export declare function runGitCommitAction(opts: GitCommitActionOptions): GitCommitActionResult;
//# sourceMappingURL=git-commit-action.d.ts.map