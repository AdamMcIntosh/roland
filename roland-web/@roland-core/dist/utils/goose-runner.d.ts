/**
 * Goose Runner — utilities for spawning headless Goose coding sessions.
 *
 * Goose is an AI agent CLI with a built-in Developer extension that provides
 * shell execution and file read/write tools. This module wraps `goose run`
 * for use by the recipe runner and the run_goose_task MCP tool.
 *
 * Requirements:
 *   - `goose` CLI in PATH (https://block.github.io/goose/)
 *   - OPENROUTER_API_KEY (when provider=openrouter, the default routing path)
 *   - Developer extension enabled in ~/.config/goose/config.yaml
 */
export interface GooseModel {
    provider: string;
    model: string;
}
export interface GooseSessionResult {
    output: string;
    exitCode: number;
    durationMs: number;
    modelUsed: GooseModel;
}
export interface GooseSessionOptions {
    task: string;
    model?: GooseModel;
    projectRoot?: string;
    extraEnv?: Record<string, string>;
    timeoutMs?: number;
    maxTurns?: number;
    /** Called with each stdout/stderr chunk as it arrives. */
    onChunk?: (chunk: string) => void;
    /**
     * Named session for continuity across calls. When provided, uses
     * `goose run --session <name>` instead of `--no-session`, so Goose
     * preserves conversation history between invocations.
     */
    sessionName?: string;
    /**
     * Supervised mode — intercept Goose tool-call confirmation prompts
     * and auto-approve/deny based on the project permission policy.
     * Requires GOOSE_MODE != 'auto' (set automatically when true).
     */
    supervised?: boolean;
}
/**
 * Map a bare model ID (as used in Roland recipe YAMLs) to a Goose
 * provider + model pair that can be set via GOOSE_PROVIDER / GOOSE_MODEL.
 */
export declare function normaliseGooseModel(modelId: string): GooseModel;
export declare function isGooseAvailable(): boolean;
export declare function getGooseVersion(): string | null;
/**
 * Spawn a headless Goose session for a single task.
 *
 * Streams stdout/stderr in real-time to process.stdout and optionally to the
 * `onChunk` callback. Returns the full buffered output on completion.
 */
export declare function spawnGooseSession(options: GooseSessionOptions): Promise<GooseSessionResult>;
//# sourceMappingURL=goose-runner.d.ts.map