/**
 * Export RCO session state to Cursor rules + MCP JSON artifacts.
 */
import type { RcoState } from './types.js';
export interface ExportCursorOptions {
    state: RcoState;
    outputDir?: string;
    /** When true, also writes into ~/.cursor/rules (best effort). */
    writeToCursor?: boolean;
    /** When true, append triage hints derived from session outputs. */
    dynamicRules?: boolean;
}
export declare function exportCursor(opts: ExportCursorOptions): {
    rulePath: string;
    mcpPath: string;
};
//# sourceMappingURL=exportCursor.d.ts.map