/**
 * ## Evaluation Gate & Blocker Fix
 *
 * Test executor — runs verification strategies via shell commands.
 * Soft-skips unit/smoke when minimal projects lack npm test scripts.
 */
import type { VerificationResult, VerificationStrategyType } from './verify-result.js';
import type { VerificationStrategyConfig } from './verification-strategies.js';
export type CommandRunner = (command: string, opts: {
    cwd: string;
    timeoutMs: number;
}) => Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut?: boolean;
}>;
export interface TestExecutorOptions {
    cwd?: string;
    strategies: VerificationStrategyConfig[];
    hadWaveBlockers?: boolean;
    runner?: CommandRunner;
    onStrategyProgress?: (type: VerificationStrategyType, status: 'running' | 'pass' | 'fail' | 'skipped') => void;
}
export declare class TestExecutor {
    private readonly cwd;
    private readonly strategies;
    private readonly hadWaveBlockers;
    private readonly runner;
    private readonly onStrategyProgress?;
    constructor(opts: TestExecutorOptions);
    runAll(): Promise<VerificationResult>;
    private runStrategy;
}
//# sourceMappingURL=test-executor.d.ts.map