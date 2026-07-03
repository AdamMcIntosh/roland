/**
 * ## CLI-First Simplification
 *
 * Shared CLI printers for mission monitoring — single source of truth used by
 * `roland status`, `roland live`, `roland hitl-status`, `roland mission-summary`,
 * `roland hitl-events`, and MCP parity tools. Hermes polls via MCP; operators use CLI.
 *
 * ## Dashboard Demoted — CLI + Hermes Primary Complete
 */
export interface StatusCliOpts {
    json?: boolean;
    goal?: string;
    concise?: boolean;
}
export interface LiveMonitorOpts extends StatusCliOpts {
    intervalSec?: number;
    once?: boolean;
}
/** One-shot unified mission snapshot — primary `roland status` output. */
export declare function printUnifiedStatus(stateDir?: string, opts?: StatusCliOpts): void;
/** Continuous live monitor — refreshes unified status on an interval. */
export declare function runLiveMonitor(stateDir?: string, opts?: LiveMonitorOpts): Promise<void>;
/** Print HITL status — delegates to buildHitlStatusReport (MCP parity). */
export declare function printHitlStatus(stateDir?: string, opts?: StatusCliOpts): void;
/** Print latest mission completion snapshot. */
export declare function printMissionSummary(stateDir?: string, opts?: StatusCliOpts): void;
/** Poll HITL events since timestamp (epoch ms). */
export declare function printHitlEvents(stateDir?: string, opts?: {
    since?: number;
    limit?: number;
    json?: boolean;
}): void;
//# sourceMappingURL=status-cli.d.ts.map