#!/usr/bin/env node
/**
 * ## P2 Polish & Reach
 *
 * RCO Team CLI — Pure ClosedLoop mission launcher (primary execution path).
 * Default: auto-select loop template (small-fix-loop / standard templates).
 * Legacy PM Team: opt-in via --legacy-pm or --use-pm-team.
 *
 * Monitor with: roland hitl-status · roland board-status --concise · roland mission-summary
 */
export interface TeamCliArgs {
    goal: string;
    stateDir: string;
    quiet: boolean;
    stream: boolean;
    noTui: boolean;
    simpleTui: boolean;
    notify: boolean;
    clean: boolean;
    background: boolean;
    noImprove: boolean;
    web: boolean;
    webhookUrl?: string;
    agentsDir?: string;
    parallel: boolean;
    loopTemplate?: string;
    legacyPm: boolean;
}
/**
 * Resolve loop template for `roland team` — Pure ClosedLoop by default.
 * Returns undefined only when --legacy-pm / --use-pm-team opts into legacy PM waves.
 */
export declare function resolveTeamLoopTemplate(opts: {
    goal: string;
    loopTemplate?: string;
    legacyPm?: boolean;
}): string | undefined;
export declare function parseTeamArgs(argv: string[]): TeamCliArgs;
export declare function runTeamCli(argv: string[]): Promise<void>;
//# sourceMappingURL=team-cli.d.ts.map