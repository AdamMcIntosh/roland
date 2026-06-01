/**
 * Git Tools — lightweight wrappers for common git operations.
 *
 * Exposes git state to MCP clients so coding agents can reason about
 * what has changed, what is staged, and what the recent history looks like.
 * Each function returns plain strings (git output) rather than parsed objects
 * so the agent can interpret the output naturally.
 */
export interface GitStatusResult {
    staged: string[];
    unstaged: string[];
    untracked: string[];
    raw: string;
}
export interface GitCommitResult {
    sha: string;
    message: string;
}
/**
 * Returns parsed git status (staged, unstaged, untracked) plus raw output.
 */
export declare function gitStatus(cwd: string): GitStatusResult;
/**
 * Returns git diff output. If `staged` is true, returns staged diff only.
 * If `filePath` is provided, limits diff to that file.
 */
export declare function gitDiff(cwd: string, opts?: {
    staged?: boolean;
    filePath?: string;
    maxLines?: number;
}): string;
/**
 * Returns the last N commits from git log.
 */
export declare function gitLog(cwd: string, limit?: number): string;
/**
 * Stage files and create a commit with the given message.
 * `files` defaults to all changes (git add -A) if not provided.
 */
export declare function gitCommit(cwd: string, message: string, files?: string[]): GitCommitResult;
//# sourceMappingURL=git-tools.d.ts.map