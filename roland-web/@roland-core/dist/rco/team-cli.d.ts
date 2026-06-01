#!/usr/bin/env node
/**
 * RCO Team CLI — PM-style parallel agent execution.
 *
 * After global install:
 *   roland team "Build a task management API"
 *   roland team "..." --state-dir .roland --stream
 *   roland team "..." --quiet
 *
 * Via npm scripts (dev):
 *   npm run rco:team:dev -- "Build a task management API"
 *   npm run rco:team:dev -- --task "..." --state-dir .roland
 *
 * Exports runTeamCli() so src/index.ts can delegate the `team` subcommand
 * without re-triggering the standalone main() guard.
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
}
export declare function parseTeamArgs(argv: string[]): TeamCliArgs;
export declare function runTeamCli(argv: string[]): Promise<void>;
//# sourceMappingURL=team-cli.d.ts.map