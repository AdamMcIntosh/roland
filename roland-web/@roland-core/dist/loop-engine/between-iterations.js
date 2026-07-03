/**
 * ## Assumptions
 * - Between-iterations hooks run via the same CommandRunner as TestExecutor (shell, injectable).
 * - git-commit with require_approval + dry_run:false pauses until operator approves via dashboard.
 * - dry_run / noOp hooks log intent without executing.
 * - exit_on_failure stops the loop when hook fails (unless optional).
 */
import { runGitCommitAction } from './git-commit-action.js';
import { GitCommitApprovalQueue, DEFAULT_GIT_COMMIT_APPROVAL_TIMEOUT_MS, } from './git-commit-approval.js';
const DEFAULT_TIMEOUT_MS = 120_000;
function logBetween(msg, detail) {
    const line = `[Loop][between-iter] ${msg}`;
    if (detail && Object.keys(detail).length > 0) {
        console.error(line, detail);
    }
    else {
        console.error(line);
    }
}
function resolveHook(opts) {
    if (opts.hook)
        return opts.hook;
    const command = opts.command ?? '';
    return {
        command,
        label: command || 'between-iterations',
        timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        optional: false,
        dryRun: false,
        exitOnFailure: false,
        noOp: !command,
        source: 'template',
    };
}
async function runGitCommitHook(hook, opts, cwd) {
    const gc = hook.gitCommit;
    const vars = {
        iteration: opts.iteration,
        ...opts.hookVars,
    };
    if (gc.dryRun) {
        const preview = runGitCommitAction({
            cwd,
            messageTemplate: gc.messageTemplate,
            includeFiles: gc.includeFiles,
            autoStage: gc.autoStage,
            dryRun: true,
            vars,
        });
        return { exitCode: preview.exitCode, stdout: preview.stdout, stderr: preview.stderr };
    }
    const preview = runGitCommitAction({
        cwd,
        messageTemplate: gc.messageTemplate,
        includeFiles: gc.includeFiles,
        autoStage: gc.autoStage,
        dryRun: true,
        vars,
    });
    if (!gc.requireApproval) {
        const result = runGitCommitAction({
            cwd,
            messageTemplate: gc.messageTemplate,
            includeFiles: gc.includeFiles,
            autoStage: gc.autoStage,
            dryRun: false,
            vars,
        });
        return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    }
    if (!opts.stateDir) {
        return {
            exitCode: 1,
            stdout: preview.stdout,
            stderr: 'git-commit: require_approval is true but stateDir was not provided',
        };
    }
    const queue = new GitCommitApprovalQueue(opts.stateDir);
    const timeoutMs = gc.approvalTimeoutMs ?? DEFAULT_GIT_COMMIT_APPROVAL_TIMEOUT_MS;
    const request = queue.submit({
        iteration: opts.iteration,
        hookLabel: hook.label,
        message: preview.message,
        statusPreview: preview.stdout,
        cwd,
        autoRejectOnTimeout: gc.autoRejectOnTimeout ?? true,
        timeoutMs,
    });
    opts.onApprovalPending?.({
        id: request.id,
        message: request.message,
        statusPreview: request.statusPreview,
        iteration: request.iteration,
        requestedAt: request.createdAt,
        timeoutAt: request.timeoutAt,
        status: 'pending',
    });
    const decision = await queue.waitForDecision(request.id, timeoutMs + 5_000);
    opts.onApprovalResolved?.();
    if (!decision.approved) {
        const reason = decision.reason ?? 'Commit not approved';
        return {
            exitCode: 1,
            stdout: preview.stdout,
            stderr: `git-commit HITL: ${reason}`,
        };
    }
    const result = runGitCommitAction({
        cwd,
        messageTemplate: gc.messageTemplate,
        includeFiles: gc.includeFiles,
        autoStage: gc.autoStage,
        dryRun: false,
        vars,
        literalMessage: decision.message,
    });
    queue.clear();
    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
/**
 * Run a between-iterations hook and persist results to LoopMemory.
 */
export async function runBetweenIterations(opts) {
    const hook = resolveHook(opts);
    const startedAt = Date.now();
    const cwd = opts.cwd ?? process.cwd();
    const timeoutMs = hook.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const runner = opts.runner;
    const command = hook.command;
    if (hook.noOp || (hook.dryRun && hook.action !== 'git-commit')) {
        logBetween('hook skipped (dry-run / no-op)', {
            iteration: opts.iteration,
            label: hook.label,
            source: hook.source,
        });
        const run = {
            iteration: opts.iteration,
            command: command || `[${hook.label}]`,
            exitCode: 0,
            stdout: hook.dryRun ? 'dry-run — command not executed' : 'no-op hook',
            stderr: '',
            timedOut: false,
            at: startedAt,
            durationMs: Date.now() - startedAt,
        };
        opts.memory.recordBetweenIteration(run);
        return { run, success: true };
    }
    logBetween('running hook', {
        iteration: opts.iteration,
        label: hook.label,
        command: hook.action === 'git-commit' ? '[git-commit action]' : command,
        source: hook.source,
        dryRun: hook.dryRun,
        requireApproval: hook.gitCommit?.requireApproval ?? false,
    });
    let exitCode = 1;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    if (hook.action === 'git-commit' && hook.gitCommit) {
        const gcResult = await runGitCommitHook(hook, opts, cwd);
        exitCode = gcResult.exitCode;
        stdout = gcResult.stdout;
        stderr = gcResult.stderr;
    }
    else if (!runner) {
        stderr = 'No command runner configured';
    }
    else {
        try {
            const result = await runner(command, { cwd, timeoutMs });
            exitCode = result.exitCode;
            stdout = result.stdout;
            stderr = result.stderr;
            timedOut = Boolean(result.timedOut);
        }
        catch (err) {
            stderr = err instanceof Error ? err.message : String(err);
            exitCode = 1;
        }
    }
    const durationMs = Date.now() - startedAt;
    const success = exitCode === 0 && !timedOut;
    const run = {
        iteration: opts.iteration,
        command,
        exitCode,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-4000),
        timedOut,
        at: startedAt,
        durationMs,
    };
    opts.memory.recordBetweenIteration(run);
    logBetween('hook complete', {
        iteration: opts.iteration,
        label: hook.label,
        exitCode,
        durationMs,
        success,
        optional: hook.optional,
        exitOnFailure: hook.exitOnFailure,
    });
    const fatal = !success && hook.exitOnFailure && !hook.optional;
    return {
        run,
        success: hook.optional ? true : success,
        fatal,
    };
}
/**
 * ## HITL Git-Commit Approval + Between-Iterations Hooks Complete
 *
 * git-commit supports require_approval for operator confirm/reject/edit via dashboard.
 */
//# sourceMappingURL=between-iterations.js.map