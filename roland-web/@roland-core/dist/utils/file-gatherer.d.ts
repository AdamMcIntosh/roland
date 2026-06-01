/**
 * File Gatherer — Smart context gathering for complex execution strategies.
 *
 * Identifies and bundles relevant file contents so subagents receive full
 * codebase context instead of having to re-explore from scratch.
 *
 * Pipeline: listProjectFiles → extractTaskKeywords → scoreFileRelevance
 *           → askLlmForRelevantFiles (optional) → bundleFileContents
 */
export interface FileBundle {
    files: Array<{
        path: string;
        content: string;
        sizeBytes: number;
    }>;
    totalBytes: number;
    truncated: boolean;
}
export interface ContextGatheringConfig {
    enabled: boolean;
    max_files: number;
    max_bytes: number;
    llm_model: string;
    llm_timeout_ms: number;
    exclude_patterns: string[];
}
export declare const DEFAULT_CONTEXT_GATHERING_CONFIG: ContextGatheringConfig;
/**
 * List all tracked project files using git ls-files, filtering out binaries
 * and excluded patterns.
 */
export declare function listProjectFiles(excludePatterns?: string[]): string[];
/**
 * Extract likely file/module name keywords from a task description.
 */
export declare function extractTaskKeywords(task: string): string[];
/**
 * Score a file's relevance to the task based on keyword matching.
 */
export declare function scoreFileRelevance(filePath: string, keywords: string[]): number;
/**
 * Call a free LLM via OpenRouter to refine file selection.
 * Returns the LLM-selected file paths, or null on failure.
 */
export declare function askLlmForRelevantFiles(task: string, candidates: string[], config: ContextGatheringConfig): Promise<string[] | null>;
/**
 * Main entry: select relevant files for a task using heuristic scoring
 * with optional LLM refinement.
 */
export declare function selectRelevantFiles(task: string, config?: ContextGatheringConfig): Promise<string[]>;
/**
 * Read selected files from disk and bundle their contents,
 * respecting the byte limit.
 */
export declare function bundleFileContents(files: string[], maxBytes?: number): FileBundle;
/**
 * Format a FileBundle as markdown for inclusion in prompts.
 */
export declare function formatBundleAsMarkdown(bundle: FileBundle): string;
//# sourceMappingURL=file-gatherer.d.ts.map