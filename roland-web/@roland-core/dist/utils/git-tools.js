/**
 * Git Tools — lightweight wrappers for common git operations.
 *
 * Exposes git state to MCP clients so coding agents can reason about
 * what has changed, what is staged, and what the recent history looks like.
 * Each function returns plain strings (git output) rather than parsed objects
 * so the agent can interpret the output naturally.
 */
import { execSync } from 'child_process';
// ============================================================================
// Helpers
// ============================================================================
function runGit(args, cwd) {
    try {
        return execSync(`git ${args}`, {
            cwd,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`git ${args.split(' ')[0]} failed: ${msg}`);
    }
}
function isGitRepo(cwd) {
    try {
        runGit('rev-parse --git-dir', cwd);
        return true;
    }
    catch {
        return false;
    }
}
// ============================================================================
// Public API
// ============================================================================
/**
 * Returns parsed git status (staged, unstaged, untracked) plus raw output.
 */
export function gitStatus(cwd) {
    if (!isGitRepo(cwd)) {
        throw new Error(`Not a git repository: ${cwd}`);
    }
    const raw = runGit('status --porcelain', cwd);
    const staged = [];
    const unstaged = [];
    const untracked = [];
    for (const line of raw.split('\n').filter(Boolean)) {
        const xy = line.slice(0, 2);
        const file = line.slice(3);
        const x = xy[0]; // index (staged)
        const y = xy[1]; // worktree (unstaged)
        if (x === '?') {
            untracked.push(file);
        }
        else {
            if (x !== ' ' && x !== '?')
                staged.push(file);
            if (y !== ' ' && y !== '?')
                unstaged.push(file);
        }
    }
    return { staged, unstaged, untracked, raw };
}
/**
 * Returns git diff output. If `staged` is true, returns staged diff only.
 * If `filePath` is provided, limits diff to that file.
 */
export function gitDiff(cwd, opts = {}) {
    if (!isGitRepo(cwd)) {
        throw new Error(`Not a git repository: ${cwd}`);
    }
    const { staged = false, filePath, maxLines = 500 } = opts;
    const stagedFlag = staged ? '--cached ' : '';
    const pathArg = filePath ? `-- "${filePath}"` : '';
    const raw = runGit(`diff ${stagedFlag}${pathArg}`.trim(), cwd);
    const lines = raw.split('\n');
    if (lines.length <= maxLines)
        return raw;
    return lines.slice(0, maxLines).join('\n') +
        `\n\n... (truncated — ${lines.length - maxLines} more lines)`;
}
/**
 * Returns the last N commits from git log.
 */
export function gitLog(cwd, limit = 10) {
    if (!isGitRepo(cwd)) {
        throw new Error(`Not a git repository: ${cwd}`);
    }
    return runGit(`log --oneline --decorate -${limit}`, cwd);
}
/**
 * Stage files and create a commit with the given message.
 * `files` defaults to all changes (git add -A) if not provided.
 */
export function gitCommit(cwd, message, files) {
    if (!isGitRepo(cwd)) {
        throw new Error(`Not a git repository: ${cwd}`);
    }
    if (!message?.trim()) {
        throw new Error('Commit message must not be empty.');
    }
    // Stage files
    if (files && files.length > 0) {
        const quoted = files.map(f => `"${f}"`).join(' ');
        runGit(`add ${quoted}`, cwd);
    }
    else {
        runGit('add -A', cwd);
    }
    // Check there is something to commit
    const staged = runGit('diff --cached --name-only', cwd);
    if (!staged) {
        throw new Error('Nothing to commit — working tree is clean after staging.');
    }
    // Commit
    runGit(`commit -m ${JSON.stringify(message)}`, cwd);
    // Return the new HEAD sha + message
    const sha = runGit('rev-parse --short HEAD', cwd);
    return { sha, message: message.trim() };
}
//# sourceMappingURL=git-tools.js.map