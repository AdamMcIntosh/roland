#!/usr/bin/env node
/**
 * Roland Watch Mode — monitors git commits (or file changes) and automatically
 * runs a PM team session whenever something changes.
 *
 * Usage:
 *   roland watch                           # watch git; use commit message as goal
 *   roland watch --task "run full review"  # fixed goal on every change
 *   roland watch --pattern "src/**"        # watch file changes instead of git
 *   roland watch --interval 30             # poll every 30s (default 60)
 *   roland watch --once                    # run once on first change, then exit
 *   roland watch --notify --webhook <url>  # push notification on each run
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runTeam } from './team-orchestrator.js';
import { Notifier } from './notifier.js';
// ── Terminal helpers (same palette as team-cli) ───────────────────────────────
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
export function parseWatchArgs(argv) {
    const args = argv[0] === 'watch' ? argv.slice(1) : argv;
    let task;
    let pattern;
    let stateDir = '.roland';
    let agentsDir;
    let intervalSec = 60;
    let once = false;
    let notify = false;
    let webhookUrl;
    let quiet = false;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if ((a === '--task' || a === '-t') && args[i + 1]) {
            task = args[++i];
            continue;
        }
        if (a === '--pattern' && args[i + 1]) {
            pattern = args[++i];
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
        if ((a === '--interval' || a === '-i') && args[i + 1]) {
            intervalSec = Math.max(10, Number(args[++i]) || 60);
            continue;
        }
        if (a === '--once') {
            once = true;
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
    }
    return { task, pattern, stateDir, agentsDir, intervalSec, once, notify, webhookUrl, quiet };
}
// ── Git helpers ───────────────────────────────────────────────────────────────
function gitHead() {
    try {
        return execSync('git rev-parse HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return null;
    }
}
function gitCommitMessage(sha) {
    try {
        return execSync(`git log -1 --pretty=%s ${sha}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return `Review changes at ${sha.slice(0, 8)}`;
    }
}
function gitCommitBody(sha) {
    try {
        return execSync(`git log -1 --pretty=%b ${sha}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return '';
    }
}
function gitChangedFiles(fromSha, toSha) {
    try {
        const out = execSync(`git diff --name-only ${fromSha} ${toSha}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out.trim().split('\n').filter(Boolean);
    }
    catch {
        return [];
    }
}
// ── File-pattern watcher ──────────────────────────────────────────────────────
function maxMtime(dir, pattern) {
    // Walk the directory tree and find the most recently modified file
    // matching the pattern (simplified: compare all files in dir).
    // For a production impl, use fast-glob; here we do a lightweight recursive stat.
    try {
        let latest = 0;
        const walk = (d) => {
            for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                const full = path.join(d, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
                    walk(full);
                }
                else if (entry.isFile()) {
                    // Simple glob match: check if the pattern (as suffix) matches
                    if (matchPattern(full, pattern)) {
                        const stat = fs.statSync(full);
                        if (stat.mtimeMs > latest)
                            latest = stat.mtimeMs;
                    }
                }
            }
        };
        walk(dir);
        return latest;
    }
    catch {
        return 0;
    }
}
function matchPattern(filePath, pattern) {
    // Minimal glob: supports * and ** and extensions like "src/**/*.ts"
    const norm = filePath.replace(/\\/g, '/');
    const regexStr = pattern
        .replace(/\\/g, '/')
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '§DSTAR§')
        .replace(/\*/g, '[^/]*')
        .replace(/§DSTAR§/g, '.*');
    try {
        return new RegExp(regexStr + '$').test(norm);
    }
    catch {
        return norm.includes(pattern.replace(/\*/g, ''));
    }
}
function printHistory(history) {
    if (history.length === 0)
        return;
    err('');
    err(c.bold('  Recent runs:'));
    for (const r of history.slice(-5).reverse()) {
        const icon = r.status === 'ok' ? c.green('✓') : c.red('✗');
        err(`  ${icon} ${c.dim(r.at)}  ${r.goal.slice(0, 50)}  ${c.dim(r.trigger)}`);
    }
}
// ── Main watch loop ───────────────────────────────────────────────────────────
export async function runWatchCli(argv) {
    const { task, pattern, stateDir, agentsDir, intervalSec, once, notify, webhookUrl, quiet } = parseWatchArgs(argv);
    const notifier = new Notifier({
        desktop: notify,
        webhookUrl,
        onComplete: notify || Boolean(webhookUrl),
        onError: notify || Boolean(webhookUrl),
    });
    // ── Header ─────────────────────────────────────────────────────────────────
    err('');
    err('  ' + '═'.repeat(COLS - 2));
    err('  ' + c.bold('👁️   Roland Watch Mode'));
    err(`  ${c.dim('Mode:')}      ${pattern ? `file pattern: ${pattern}` : 'git commits'}`);
    err(`  ${c.dim('Interval:')}  ${intervalSec}s`);
    err(`  ${c.dim('Goal:')}      ${task ? `"${task}"` : 'latest commit message'}`);
    if (once)
        err(`  ${c.dim('Once mode — will exit after first run')}`);
    err('  ' + '═'.repeat(COLS - 2));
    err('');
    // ── Detect watch mode ──────────────────────────────────────────────────────
    const isGitMode = !pattern;
    // Initial state snapshot
    let lastGitSha = isGitMode ? gitHead() : null;
    let lastMtime = !isGitMode ? maxMtime(process.cwd(), pattern) : 0;
    const history = [];
    if (isGitMode && !lastGitSha) {
        err(c.red('  ✗ Not a git repository (or git not found). Use --pattern for file watching.'));
        err('');
        process.exit(1);
    }
    err(`  ${c.dim('Watching...')}  ${c.cyan(isGitMode ? `HEAD: ${lastGitSha?.slice(0, 8) ?? '?'}` : `mtime snapshot taken`)}`);
    err(`  ${c.dim('Press Ctrl+C to stop')}`);
    err('');
    // ── Main loop ──────────────────────────────────────────────────────────────
    while (true) {
        await new Promise((r) => setTimeout(r, intervalSec * 1000));
        let changed = false;
        let trigger = '';
        let goal = task ?? '';
        let fromSha = '';
        if (isGitMode) {
            const currentSha = gitHead();
            if (currentSha && currentSha !== lastGitSha) {
                changed = true;
                fromSha = lastGitSha ?? '';
                trigger = `commit ${currentSha.slice(0, 8)}`;
                if (!goal) {
                    const subject = gitCommitMessage(currentSha);
                    const body = gitCommitBody(currentSha);
                    const changed = gitChangedFiles(lastGitSha ?? `${currentSha}^`, currentSha);
                    const fileList = changed.slice(0, 10).join(', ') + (changed.length > 10 ? ` …+${changed.length - 10} more` : '');
                    goal = [
                        `Review and act on the latest commit: "${subject}"`,
                        body && `Commit description: ${body}`,
                        fileList && `Changed files: ${fileList}`,
                        'Identify anything that needs fixing, testing, or documenting. Implement improvements as needed.',
                    ].filter(Boolean).join('\n\n');
                }
                lastGitSha = currentSha;
            }
        }
        else {
            const currentMtime = maxMtime(process.cwd(), pattern);
            if (currentMtime > lastMtime) {
                changed = true;
                trigger = `file change (${new Date(currentMtime).toISOString().slice(11, 19)})`;
                if (!goal)
                    goal = `Files matching "${pattern}" changed. Review changes, fix issues, and run tests.`;
                lastMtime = currentMtime;
            }
        }
        if (!changed) {
            process.stderr.write(`\r  ${c.dim(`Watching… last checked ${new Date().toISOString().slice(11, 19)}`)}   `);
            continue;
        }
        // ── Run triggered ─────────────────────────────────────────────────────────
        err('');
        err(rule());
        err(`  ${c.cyan('⟳')} ${c.bold('Change detected')} — ${trigger}`);
        err(`  ${c.dim('Goal:')} ${goal.split('\n')[0].slice(0, COLS - 12)}`);
        err(rule());
        err('');
        const at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        let runStatus = 'ok';
        let tasksCompleted = 0;
        let wavesRun = 0;
        try {
            if (!quiet) {
                err(`  ${c.dim('Starting roland team...')}`);
            }
            const result = await runTeam({ goal, stateDir, agentsDir });
            tasksCompleted = Object.keys(result.taskResults).length;
            wavesRun = result.wavesRun;
            err('');
            err(rule());
            err(`  ${c.green('✅')} ${c.bold('Run complete')}  ${tasksCompleted} tasks · ${wavesRun} waves · ${trigger}`);
            err(rule());
            err('');
            if (!quiet) {
                const preview = result.synthesis.slice(0, 600).replace(/\n{3,}/g, '\n\n');
                for (const line of preview.split('\n').slice(0, 12)) {
                    err('  ' + c.dim(line));
                }
                if (result.synthesis.length > 600)
                    err(`  ${c.dim('…(full synthesis above)')}`);
                err('');
            }
            await notifier.notify({
                event: 'complete',
                goal: goal.split('\n')[0],
                summary: `Triggered by: ${trigger}`,
                tasksCompleted,
                wavesRun,
                blockersEncountered: result.blockersEncountered,
            });
        }
        catch (e) {
            runStatus = 'error';
            const msg = e instanceof Error ? e.message : String(e);
            err('');
            err(rule());
            err(`  ${c.red('✗')} ${c.bold('Run failed')}  ${msg.slice(0, 120)}`);
            err(rule());
            err('');
            await notifier.notify({ event: 'error', goal: goal.split('\n')[0], summary: trigger, errorMessage: msg });
        }
        history.push({ at, trigger, goal: goal.split('\n')[0], status: runStatus, tasks: tasksCompleted, waves: wavesRun });
        printHistory(history);
        if (once) {
            err(`  ${c.dim('--once mode: exiting')}`);
            err('');
            process.exit(runStatus === 'ok' ? 0 : 1);
        }
        err(`  ${c.dim('Resuming watch...')}`);
        err('');
    }
}
// ── Standalone entry ──────────────────────────────────────────────────────────
async function main() {
    await runWatchCli(process.argv.slice(2));
}
const _thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] === _thisFile || process.argv[1]?.replace(/\.ts$/, '.js') === _thisFile) {
    main().catch((e) => {
        process.stderr.write(`\n❌ Roland Watch fatal error: ${e instanceof Error ? e.message : String(e)}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=watch-cli.js.map