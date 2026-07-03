/**
 * Structured verification results — consumed by Verify phase, loop-state, and dashboard.
 */
export function aggregateVerificationResult(strategies, opts = { startedAt: Date.now() }) {
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
export function verificationResultToLoopState(result) {
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
//# sourceMappingURL=verify-result.js.map