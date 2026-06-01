/**
 * Diff Engine — generates unified diffs and HTML previews for file changes.
 *
 * No external dependencies: implements LCS-based line diff in pure TypeScript.
 */
export type DiffLineType = 'context' | 'added' | 'removed';
export interface DiffLine {
    type: DiffLineType;
    content: string;
    oldLineNo: number | null;
    newLineNo: number | null;
}
export interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: DiffLine[];
}
export interface DiffResult {
    hunks: DiffHunk[];
    additions: number;
    deletions: number;
    markdownDiff: string;
    htmlPreview: string | null;
}
export interface DiffOptions {
    filename?: string;
    contextLines?: number;
    includeHtml?: boolean;
}
/**
 * Generate a diff between `original` and `modified` content.
 *
 * @param original - Original file content (string)
 * @param modified - Modified file content (string)
 * @param options  - { filename, contextLines, includeHtml }
 */
export declare function generateDiff(original: string, modified: string, options?: DiffOptions): DiffResult;
//# sourceMappingURL=diff-engine.d.ts.map