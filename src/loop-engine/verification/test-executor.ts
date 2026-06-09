/**
 * Test executor — runs verification strategies via shell commands.
 *
 * Integrates with npm test / project scripts. Injectable exec for unit tests.
 */

import { spawnHidden } from '../../utils/spawn-silent.js';
import type {
  StrategyResult,
  VerificationFailure,
  VerificationResult,
} from './verify-result.js';
import { aggregateVerificationResult } from './verify-result.js';
import type { VerificationStrategyConfig } from './verification-strategies.js';

export type CommandRunner = (
  command: string,
  opts: { cwd: string; timeoutMs: number },
) => Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean }>;

const DEFAULT_TIMEOUT_MS = 180_000;
const OUTPUT_TAIL_CHARS = 2_000;

function logVerify(msg: string, detail?: Record<string, unknown>): void {
  const line = `[Loop][verify] ${msg}`;
  if (detail && Object.keys(detail).length > 0) {
    console.error(line, detail);
  } else {
    console.error(line);
  }
}

function defaultRunner(
  command: string,
  opts: { cwd: string; timeoutMs: number },
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean }> {
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

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
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

function parseFailures(output: string): VerificationFailure[] {
  const lines = output.split('\n').filter((l) => l.trim().length > 0);
  const failures: VerificationFailure[] = [];

  for (const line of lines) {
    if (
      /FAIL|AssertionError|✕|×|failed|error TS\d+/i.test(line) &&
      !/passed|0 failed/i.test(line)
    ) {
      failures.push({ message: line.trim().slice(0, 300) });
      if (failures.length >= 8) break;
    }
  }

  if (failures.length === 0 && output.trim()) {
    failures.push({ message: output.trim().slice(-400) });
  }

  return failures;
}

function outputTail(stdout: string, stderr: string): string {
  const combined = [stderr, stdout].filter(Boolean).join('\n').trim();
  return combined.length > OUTPUT_TAIL_CHARS
    ? '…' + combined.slice(-OUTPUT_TAIL_CHARS)
    : combined;
}

function parseCoveragePercent(output: string): number | undefined {
  const m = output.match(/(?:All files|Statements)\s*\|\s*([\d.]+)/);
  if (m) return parseFloat(m[1]!);
  const pct = output.match(/(\d+(?:\.\d+)?)\s*%\s*(?:coverage|Coverage)/i);
  if (pct) return parseFloat(pct[1]!);
  return undefined;
}

export interface TestExecutorOptions {
  cwd?: string;
  strategies: VerificationStrategyConfig[];
  hadWaveBlockers?: boolean;
  runner?: CommandRunner;
}

export class TestExecutor {
  private readonly cwd: string;
  private readonly strategies: VerificationStrategyConfig[];
  private readonly hadWaveBlockers: boolean;
  private readonly runner: CommandRunner;

  constructor(opts: TestExecutorOptions) {
    this.cwd = opts.cwd ?? process.cwd();
    this.strategies = opts.strategies;
    this.hadWaveBlockers = Boolean(opts.hadWaveBlockers);
    this.runner = opts.runner ?? defaultRunner;
  }

  async runAll(): Promise<VerificationResult> {
    const startedAt = Date.now();
    const strategyResults: StrategyResult[] = [];

    for (const strategy of this.strategies) {
      logVerify(`Running ${strategy.type}`, { command: strategy.command });
      const result = await this.runStrategy(strategy);
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
    if (coverage !== undefined) aggregated.coveragePercent = coverage;

    return aggregated;
  }

  private async runStrategy(strategy: VerificationStrategyConfig): Promise<StrategyResult> {
    const started = Date.now();
    const timeoutMs = strategy.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const { exitCode, stdout, stderr, timedOut } = await this.runner(strategy.command, {
        cwd: this.cwd,
        timeoutMs,
      });
      const durationMs = Date.now() - started;
      const combined = outputTail(stdout, stderr);
      const pass = !timedOut && exitCode === 0;

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
    } catch (err) {
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
