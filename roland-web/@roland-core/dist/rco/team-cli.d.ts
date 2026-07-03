#!/usr/bin/env node
/**
 * ## CLI-First + Hermes Monitoring Shift
 *
 * RCO Team CLI — Pure ClosedLoop mission launcher (primary execution path).
 * Monitor with: roland hitl-status · roland board-status --concise · roland mission-summary
 *
 * ## Dashboard De-emphasized — CLI + Hermes Hybrid Complete
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
}
export declare function parseTeamArgs(argv: string[]): TeamCliArgs;
export declare function runTeamCli(argv: string[]): Promise<void>;
//# sourceMappingURL=team-cli.d.ts.map