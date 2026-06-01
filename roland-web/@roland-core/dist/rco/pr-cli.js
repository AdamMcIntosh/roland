#!/usr/bin/env node
/**
 * Roland PR Mode — reads a GitHub PR via `gh` CLI and runs the PM team
 * to review it, fix issues, and optionally push improvements.
 *
 * Prerequisites: `gh` CLI installed and authenticated.
 *
 * Usage:
 *   roland pr 42                        # review PR #42
 *   roland pr                           # auto-detect PR from current branch
 *   roland pr 42 --fix                  # review + push fixes
 *   roland pr 42 --fix --branch fix/42  # fixes on a specific branch
 *   roland pr 42 --state-dir .roland
 *   roland pr 42 --notify --webhook https://ntfy.sh/my-topic
 */
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { runTeam } from './team-orchestrator.js';
import { Notifier } from './notifier.js';
// ── Terminal helpers ──────────────────────────────────────────────────────────
const c = {
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const COLS = Math.min(process.stderr.columns ?? 80, 100);
const err = (s = '') => process.stderr.write(s + '\n');
const rule = () => c.dim('─'.repeat(COLS));
export function parsePrArgs(argv) {
    const args = argv[0] === 'pr' ? argv.slice(1) : argv;
    let prNumber;
    let fix = false;
    let branch;
    let stateDir = '.roland';
    let agentsDir;
    let notify = false;
    let webhookUrl;
    let quiet = false;
    let reviewOnly = false;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--fix') {
            fix = true;
            continue;
        }
        if (a === '--review-only') {
            reviewOnly = true;
            continue;
        }
        if ((a === '--branch' || a === '-b') && args[i + 1]) {
            branch = args[++i];
            continue;
        }
        if (a === '--state-dir' && args[i + 1]) {
            stateDir = args[++i];
            continue;
        }
        if (a === '--agents-dir' && args[i + 1]) {
            agentsDir = args[++i];
            continue;
        }
        if (a === '--notify' || a === '-n') {
            notify = true;
            continue;
        }
        if (a === '--webhook' && args[i + 1]) {
            webhookUrl = args[++i];
            notify = true;
            continue;
        }
        if (a === '--quiet' || a === '-q') {
            quiet = true;
            continue;
        }
        if (!a.startsWith('-') && /^\d+$/.test(a)) {
            prNumber = Number(a);
            continue;
        }
    }
    return { prNumber, fix, branch, stateDir, agentsDir, notify, webhookUrl, quiet, reviewOnly };
}
function ghExists() {
    try {
        spawnSync('gh', ['--version'], { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
function getPrData(prNum) {
    const json = execSync(`gh pr view ${prNum} --json number,title,body,headRefName,baseRefName,author,additions,deletions,changedFiles,files`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(json);
}
function getCurrentPrNumber() {
    try {
        const json = execSync('gh pr view --json number', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        return JSON.parse(json).number ?? null;
    }
    catch {
        return null;
    }
}
function getPrDiff(prNum, maxChars = 8_000) {
    try {
        const diff = execSync(`gh pr diff ${prNum}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 });
        if (diff.length <= maxChars)
            return diff;
        // Truncate but keep the beginning (most important context)
        return diff.slice(0, maxChars) + `\n\n…(diff truncated at ${maxChars} chars — ${diff.length} total)\n`;
    }
    catch {
        return '(diff unavailable)';
    }
}
// ── Goal builder ──────────────────────────────────────────────────────────────
function buildPrGoal(pr, diff, mode) {
    const fileList = pr.files
        .slice(0, 15)
        .map((f) => `  - ${f.path} (+${f.additions}/-${f.deletions})`)
        .join('\n');
    const moreFiles = pr.changedFiles > 15 ? `  …and ${pr.changedFiles - 15} more files\n` : '';
    const description = (pr.body ?? '').trim().slice(0, 1_500) || '(no description provided)';
    const action = mode === 'fix'
        ? 'Review this PR thoroughly, identify all issues, and implement the necessary fixes and improvements.'
        : 'Review this PR thoroughly and produce a comprehensive review covering: correctness, security, performance, test coverage, and code quality.';
    return [
        `${mode === 'fix' ? 'Review and fix' : 'Review'} GitHub PR #${pr.number}: "${pr.title}"`,
        '',
        `**Author:** @${pr.author.login}`,
        `**Branch:** ${pr.headRefName} → ${pr.baseRefName}`,
        `**Changes:** +${pr.additions}/-${pr.deletions} across ${pr.changedFiles} file(s)`,
        '',
        '**PR Description:**',
        description,
        '',
        '**Changed Files:**',
        fileList,
        moreFiles,
        '**Diff:**',
        '```diff',
        diff,
        '```',
        '',
        action,
        '',
        mode === 'fix'
            ? 'After completing fixes: write a summary of changes made and why. Do NOT push — the orchestrator handles git operations.'
            : 'Write a structured review with sections: Summary, Issues Found (severity: critical/high/medium/low), Suggestions, and Overall Verdict.',
    ].join('\n');
}
// ── Git operations (for --fix mode) ──────────────────────────────────────────
function gitStatus() {
    try {
        return execSync('git status --short', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return '';
    }
}
function gitCommitAndPush(prNum, branch) {
    const status = gitStatus();
    if (!status) {
        err(`  ${c.dim('No changes to commit.')}`);
        return;
    }
    // Switch to fix branch if specified
    if (branch) {
        try {
            execSync(`git checkout -b ${branch}`, { stdio: 'ignore' });
            err(`  ${c.green('✓')} Created branch ${branch}`);
        }
        catch {
            try {
                execSync(`git checkout ${branch}`, { stdio: 'ignore' });
                err(`  ${c.green('✓')} Switched to branch ${branch}`);
            }
            catch {
                err(`  ${c.yellow('⚠')} Could not create/switch branch — committing on current branch`);
            }
        }
    }
    execSync('git add -A', { stdio: 'ignore' });
    const message = `fix: PM team review improvements for PR #${prNum}\n\nCo-authored-by: Roland PM Team <noreply@anthropic.com>`;
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
    err(`  ${c.green('✓')} Committed changes`);
    try {
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        execSync(`git push origin ${currentBranch}`, { stdio: 'ignore' });
        err(`  ${c.green('✓')} Pushed to origin/${currentBranch}`);
    }
    catch {
        err(`  ${c.yellow('⚠')} Push failed — run: git push`);
    }
}
// ── Main CLI ──────────────────────────────────────────────────────────────────
export async function runPrCli(argv) {
    const { prNumber: rawPrNum, fix, branch, stateDir, agentsDir, notify, webhookUrl, quiet, reviewOnly } = parsePrArgs(argv);
    // ── Validate gh is available ───────────────────────────────────────────────
    if (!ghExists()) {
        err(c.red('  ✗ `gh` CLI not found. Install it from https://cli.github.com/'));
        err('');
        process.exit(1);
    }
    // ── Resolve PR number ──────────────────────────────────────────────────────
    let prNumber = rawPrNum;
    if (!prNumber) {
        err(`  ${c.dim('No PR number given — detecting from current branch...')}`);
        prNumber = getCurrentPrNumber() ?? undefined;
        if (!prNumber) {
            err(c.red('  ✗ Could not detect a PR for the current branch. Pass a PR number: roland pr 42'));
            err('');
            process.exit(1);
        }
    }
    const mode = fix && !reviewOnly ? 'fix' : 'review';
    // ── Fetch PR data ──────────────────────────────────────────────────────────
    err('');
    err(`  ${c.dim('Fetching PR #' + prNumber + '...')}`);
    let pr;
    try {
        pr = getPrData(prNumber);
    }
    catch (e) {
        err(c.red(`  ✗ Could not fetch PR #${prNumber}: ${e instanceof Error ? e.message : String(e)}`));
        err('  → Make sure you are authenticated: gh auth login');
        err('');
        process.exit(1);
    }
    err(`  ${c.dim('Fetching diff...')}`);
    const diff = getPrDiff(prNumber);
    // ── Header ─────────────────────────────────────────────────────────────────
    err('');
    err('  ' + '═'.repeat(COLS - 2));
    err('  ' + c.bold(`🔍  Roland PR ${mode === 'fix' ? 'Fix' : 'Review'} — PR #${pr.number}`));
    err(`  ${c.dim('Title:')}   ${pr.title}`);
    err(`  ${c.dim('Author:')}  @${pr.author.login}   ${c.dim(`${pr.headRefName} → ${pr.baseRefName}`)}`);
    err(`  ${c.dim('Changes:')} +${pr.additions}/-${pr.deletions} across ${pr.changedFiles} file(s)`);
    err(`  ${c.dim('Mode:')}    ${mode === 'fix' ? c.yellow('review + fix (will commit changes)') : c.cyan('review only')}`);
    err('  ' + '═'.repeat(COLS - 2));
    err('');
    const notifier = new Notifier({
        desktop: notify,
        webhookUrl,
        onComplete: notify || Boolean(webhookUrl),
        onError: notify || Boolean(webhookUrl),
    });
    // ── Build goal and run ─────────────────────────────────────────────────────
    const goal = buildPrGoal(pr, diff, mode);
    err(`  ${c.dim('Starting PM team review...')}`);
    err('');
    let result;
    try {
        result = await runTeam({ goal, stateDir, agentsDir });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        err(c.red(`  ✗ Team run failed: ${msg}`));
        await notifier.notify({ event: 'error', goal: `PR #${prNumber}: ${pr.title}`, summary: 'Team run failed', errorMessage: msg });
        process.exit(1);
    }
    // ── Footer ─────────────────────────────────────────────────────────────────
    err(rule());
    err(`  ${c.green('✅')} ${c.bold(`PR #${prNumber} ${mode === 'fix' ? 'fix' : 'review'} complete`)}  ${Object.keys(result.taskResults).length} tasks · ${result.wavesRun} waves`);
    err(rule());
    err('');
    // ── Commit + push if --fix ──────────────────────────────────────────────────
    if (mode === 'fix') {
        err(`  ${c.bold('Committing fixes...')}`);
        try {
            gitCommitAndPush(prNumber, branch);
        }
        catch (e) {
            err(c.yellow(`  ⚠ Git operations failed: ${e instanceof Error ? e.message : String(e)}`));
            err('  → Changes are in your working tree; commit manually.');
        }
        err('');
    }
    await notifier.notify({
        event: 'complete',
        goal: `PR #${prNumber}: ${pr.title}`,
        summary: mode === 'fix' ? 'Review + fixes pushed' : 'Review complete',
        tasksCompleted: Object.keys(result.taskResults).length,
        wavesRun: result.wavesRun,
        blockersEncountered: result.blockersEncountered,
    });
    // Synthesis to stdout
    if (!quiet)
        console.log(result.synthesis);
}
// ── Standalone entry ──────────────────────────────────────────────────────────
async function main() {
    await runPrCli(process.argv.slice(2));
}
const _thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] === _thisFile || process.argv[1]?.replace(/\.ts$/, '.js') === _thisFile) {
    main().catch((e) => {
        process.stderr.write(`\n❌ Roland PR fatal error: ${e instanceof Error ? e.message : String(e)}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=pr-cli.js.map