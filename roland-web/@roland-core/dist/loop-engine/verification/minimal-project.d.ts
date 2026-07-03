/**
 * ## Evaluation Gate & Blocker Fix
 *
 * Helpers for minimal / greenfield projects that lack npm test scripts or
 * placeholder test harnesses. Used by TestExecutor to soft-skip instead of
 * hard-failing the unit verification gate.
 */
/** True when package.json exists but has no `scripts.test` entry. */
export declare function lacksNpmTestScript(cwd: string): boolean;
/** True when runner output indicates npm had no test script to run. */
export declare function isNoTestSpecifiedOutput(stdout: string, stderr: string): boolean;
/** Unit strategy types that may soft-skip on missing tests in minimal projects. */
export declare function shouldSoftSkipMissingTests(strategyType: string): boolean;
/** True when the project has no lint runner config (greenfield / minimal). */
export declare function lacksLintConfig(cwd: string): boolean;
/** True when TypeScript is mentioned but tsconfig is absent (bootstrap in progress). */
export declare function lacksTypecheckConfig(cwd: string): boolean;
/** Strategy types that may soft-skip when tooling is not yet configured. */
export declare function shouldSoftSkipMissingTooling(strategyType: string): boolean;
/**
 * ## Roland Execution Now Reliable
 *
 * Soft-skip helpers for greenfield projects missing test/lint/typecheck tooling.
 * Test: npx vitest run tests/unit/act-validation.test.ts tests/unit/minimal-project-verification.test.ts
 */
//# sourceMappingURL=minimal-project.d.ts.map