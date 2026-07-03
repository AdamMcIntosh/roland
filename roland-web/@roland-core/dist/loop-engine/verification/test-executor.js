/**
 * ## Evaluation Gate & Blocker Fix
 *
 * Test executor — runs verification strategies via shell commands.
 * Soft-skips unit/smoke when minimal projects lack npm test scripts.
 */
import { spawnHidden } from '../../utils/spawn-silent.js';
import { lacksLintConfig, lacksNpmTestScript, lacksTypecheckConfig, isNoTestSpecifiedOutput, shouldSoftSkipMissingTests, shouldSoftSkipMissingTooling, } from './minimal-project.js';
import { aggregateVerificationResult } from './verify-result.js';
const DEFAULT_TIMEOUT_MS = 180_000;
const OUTPUT_TAIL_CHARS = 2_000;
function logVerify(msg, detail) {
    const line = `[Loop][verify] ${msg}`;
    if (detail && Object.keys(detail).length > 0) {
        console.error(line, detail);
    }
    else {
        console.error(line);
    }
}
function defaultRunner(command, opts) {
    return new Promise((resolve) => {
        const child = spawnHidden(command, [], {
            cwd: opts.cwd,
            shell: true,
            env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
        }, opts.timeoutMs);
        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ exitCode: code, stdout, stderr, timedOut });
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ exitCode: 1, stdout, stderr: `${stderr}\n${err.message}`.trim(), timedOut });
        });
    });
}
function parseFailures(output) {
    const lines = output.split('\n').filter((l) => l.trim().length > 0);
    const failures = [];
    for (const line of lines) {
        if (/FAIL|AssertionError|✕|×|failed|error TS\d+/i.test(line) &&
            !/passed|0 failed/i.test(line)) {
            failures.push({ message: line.trim().slice(0, 300) });
            if (failures.length >= 8)
                break;
        }
    }
    if (failures.length === 0 && output.trim()) {
        failures.push({ message: output.trim().slice(-400) });
    }
    return failures;
}
function outputTail(stdout, stderr) {
    const combined = [stderr, stdout].filter(Boolean).join('\n').trim();
    return combined.length > OUTPUT_TAIL_CHARS
        ? '…' + combined.slice(-OUTPUT_TAIL_CHARS)
        : combined;
}
function parseCoveragePercent(output) {
    const m = output.match(/(?:All files|Statements)\s*\|\s*([\d.]+)/);
    if (m)
        return parseFloat(m[1]);
    const pct = output.match(/(\d+(?:\.\d+)?)\s*%\s*(?:coverage|Coverage)/i);
    if (pct)
        return parseFloat(pct[1]);
    return undefined;
}
export class TestExecutor {
    cwd;
    strategies;
    hadWaveBlockers;
    runner;
    onStrategyProgress;
    constructor(opts) {
        this.cwd = opts.cwd ?? process.cwd();
        this.strategies = opts.strategies;
        this.hadWaveBlockers = Boolean(opts.hadWaveBlockers);
        this.runner = opts.runner ?? defaultRunner;
        this.onStrategyProgress = opts.onStrategyProgress;
    }
    async runAll() {
        const startedAt = Date.now();
        const strategyResults = [];
        for (const strategy of this.strategies) {
            logVerify(`Running ${strategy.type}`, { command: strategy.command });
            this.onStrategyProgress?.(strategy.type, 'running');
            const result = await this.runStrategy(strategy);
            this.onStrategyProgress?.(strategy.type, result.skipped ? 'skipped' : result.pass ? 'pass' : 'fail');
            strategyResults.push(result);
            logVerify(`${strategy.type} ${result.pass ? 'passed' : 'failed'}`, {
                durationMs: result.durationMs,
                exitCode: result.exitCode,
            });
        }
        const aggregated = aggregateVerificationResult(strategyResults, {
            hadWaveBlockers: this.hadWaveBlockers,
            startedAt,
        });
        const coverage = strategyResults
            .map((s) => parseCoveragePercent(s.outputTail ?? ''))
            .find((c) => c !== undefined);
        if (coverage !== undefined)
            aggregated.coveragePercent = coverage;
        return aggregated;
    }
    async runStrategy(strategy) {
        const started = Date.now();
        const timeoutMs = strategy.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (strategy.dryRun) {
            logVerify(`Dry-run ${strategy.type} — skipped execution`, { command: strategy.command });
            return {
                type: strategy.type,
                pass: true,
                command: strategy.command,
                durationMs: Date.now() - started,
                exitCode: 0,
                failures: [],
                skipped: true,
                skipReason: 'dry-run — command not executed',
            };
        }
        if (shouldSoftSkipMissingTests(strategy.type) &&
            lacksNpmTestScript(this.cwd)) {
            const reason = 'minimal project — no npm test script (non-blocking warning)';
            logVerify(`${strategy.type} skipped — ${reason}`, { cwd: this.cwd });
            return {
                type: strategy.type,
                pass: true,
                command: strategy.command,
                durationMs: Date.now() - started,
                exitCode: 0,
                failures: [],
                skipped: true,
                skipReason: reason,
            };
        }
        if (shouldSoftSkipMissingTooling(strategy.type)) {
            const skipLint = strategy.type === 'lint' && lacksLintConfig(this.cwd);
            const skipTypecheck = strategy.type === 'typecheck' && lacksTypecheckConfig(this.cwd);
            if (skipLint || skipTypecheck) {
                const reason = skipLint
                    ? 'minimal project — no lint config (non-blocking for greenfield)'
                    : 'minimal project — no tsconfig.json (non-blocking for greenfield)';
                logVerify(`${strategy.type} skipped — ${reason}`, { cwd: this.cwd });
                return {
                    type: strategy.type,
                    pass: true,
                    command: strategy.command,
                    durationMs: Date.now() - started,
                    exitCode: 0,
                    failures: [],
                    skipped: true,
                    skipReason: reason,
                };
            }
        }
        try {
            const { exitCode, stdout, stderr, timedOut } = await this.runner(strategy.command, {
                cwd: this.cwd,
                timeoutMs,
            });
            const durationMs = Date.now() - started;
            const combined = outputTail(stdout, stderr);
            let pass = !timedOut && exitCode === 0;
            if (!pass &&
                !timedOut &&
                shouldSoftSkipMissingTests(strategy.type) &&
                isNoTestSpecifiedOutput(stdout, stderr)) {
                const reason = 'npm test — no test specified (non-blocking for minimal project)';
                logVerify(`${strategy.type} soft-pass — ${reason}`);
                return {
                    type: strategy.type,
                    pass: true,
                    command: strategy.command,
                    durationMs,
                    exitCode,
                    failures: [],
                    outputTail: combined,
                    skipped: true,
                    skipReason: reason,
                };
            }
            if (strategy.optional && !pass) {
                return {
                    type: strategy.type,
                    pass: true,
                    command: strategy.command,
                    durationMs,
                    exitCode,
                    failures: [],
                    outputTail: combined,
                    skipped: true,
                    skipReason: timedOut ? 'optional strategy timed out' : 'optional strategy failed — recorded only',
                };
            }
            return {
                type: strategy.type,
                pass,
                command: strategy.command,
                durationMs,
                exitCode: timedOut ? null : exitCode,
                failures: pass ? [] : parseFailures(combined),
                outputTail: combined,
            };
        }
        catch (err) {
            const durationMs = Date.now() - started;
            const message = err instanceof Error ? err.message : String(err);
            logVerify(`Strategy ${strategy.type} crashed — treating as failure`, { error: message });
            if (strategy.optional) {
                return {
                    type: strategy.type,
                    pass: true,
                    command: strategy.command,
                    durationMs,
                    exitCode: 1,
                    failures: [],
                    skipped: true,
                    skipReason: `optional strategy error: ${message}`,
                };
            }
            return {
                type: strategy.type,
                pass: false,
                command: strategy.command,
                durationMs,
                exitCode: 1,
                failures: [{ message }],
            };
        }
    }
}
//# sourceMappingURL=test-executor.js.map