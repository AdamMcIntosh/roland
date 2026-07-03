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
export declare function aggregateVerificationResult(strategies: StrategyResult[], opts?: {
    hadWaveBlockers?: boolean;
    startedAt: number;
}): VerificationResult;
export declare function verificationResultToLoopState(result: VerificationResult): {
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
};
//# sourceMappingURL=verify-result.d.ts.map