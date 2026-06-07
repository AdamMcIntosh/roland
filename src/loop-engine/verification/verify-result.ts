/**
 * Structured verification results — consumed by Verify phase, loop-state, and dashboard.
 */

export type VerificationStrategyType = 'unit' | 'integration' | 'smoke' | 'e2e' | 'lint' | 'typecheck';

export interface VerificationFailure {
  message: string;
  /** Optional test or file reference parsed from runner output */
  location?: string;
}

export interface StrategyResult {
  type: VerificationStrategyType;
  pass: boolean;
  command: string;
  durationMs: number;
  exitCode: number | null;
  failures: VerificationFailure[];
  /** Raw stderr/stdout tail for operator debugging */
  outputTail?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface VerificationResult {
  pass: boolean;
  summary: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  strategies: StrategyResult[];
  /** Optional coverage percentage when reported by the test runner */
  coveragePercent?: number;
  /** Wave blockers from team orchestrator (combined gate) */
  hadWaveBlockers?: boolean;
}

export function aggregateVerificationResult(
  strategies: StrategyResult[],
  opts: { hadWaveBlockers?: boolean; startedAt: number } = { startedAt: Date.now() },
): VerificationResult {
  const completedAt = Date.now();
  const required = strategies.filter((s) => !s.skipped);
  const pass = !opts.hadWaveBlockers && required.every((s) => s.pass);
  const failed = required.filter((s) => !s.pass);
  const summary = pass
    ? `Verification passed — ${required.length} check(s) OK`
    : failed.length > 0
      ? `Verification failed — ${failed.map((s) => s.type).join(', ')}`
      : 'Verification failed — wave blockers detected';

  return {
    pass,
    summary,
    startedAt: opts.startedAt,
    completedAt,
    durationMs: completedAt - opts.startedAt,
    strategies,
    hadWaveBlockers: opts.hadWaveBlockers,
  };
}

export function verificationResultToLoopState(
  result: VerificationResult,
): {
  pass: boolean;
  summary: string;
  at: number;
  durationMs: number;
  strategies: Array<{
    type: string;
    pass: boolean;
    durationMs: number;
    failures?: string[];
  }>;
} {
  return {
    pass: result.pass,
    summary: result.summary,
    at: result.completedAt,
    durationMs: result.durationMs,
    strategies: result.strategies.map((s) => ({
      type: s.type,
      pass: s.pass,
      durationMs: s.durationMs,
      failures: s.failures.length > 0 ? s.failures.map((f) => f.message) : undefined,
    })),
  };
}
