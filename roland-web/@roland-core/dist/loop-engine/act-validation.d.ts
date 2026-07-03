/**
 * ## Roland Execution Reliability Fix
 *
 * Post-Act validation — confirms the coding agent actually wrote files to disk.
 * Prevents silent no-ops where missions complete without deliverables.
 */
export interface WorkspaceBaseline {
    cwd: string;
    isGitRepo: boolean;
    /** Relative paths present at act start (lowercase keys for case-insensitive compare on Windows). */
    fileSnapshot: Map<string, number>;
}
export interface ActValidationResult {
    ok: boolean;
    filesCreated: string[];
    filesModified: string[];
    missingDeliverables: string[];
    message: string;
}
/** Capture workspace state immediately before Act phase dispatch. */
export declare function captureWorkspaceBaseline(cwd: string): WorkspaceBaseline;
/** Infer deliverable filenames from a greenfield goal string. */
export declare function inferExpectedDeliverables(goal: string): string[];
export interface ValidateActExecutionOptions {
    cwd: string;
    goal: string;
    baseline: WorkspaceBaseline;
    agentOutput?: string;
    /** Skip validation in loop test stubs / CI without real SDK agents. */
    skipInTestMode?: boolean;
}
/**
 * Validate that Act phase produced real filesystem changes.
 * Greenfield goals additionally require inferred deliverables (package.json, hello-world.ts, etc.).
 */
export declare function validateActExecution(opts: ValidateActExecutionOptions): ActValidationResult;
/**
 * ## Roland Execution Now Reliable
 *
 * Post-Act validation catches silent no-ops before Verify runs.
 * Test commands:
 *   npx vitest run tests/unit/act-validation.test.ts
 *   npx vitest run tests/unit/loop-agent-dispatch.test.ts
 */
//# sourceMappingURL=act-validation.d.ts.map