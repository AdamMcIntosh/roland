#!/usr/bin/env node
/**
 * Roland Watch Mode — monitors git commits (or file changes) and automatically
 * runs a PM team session whenever something changes.
 *
 * Usage:
 *   roland watch                           # watch git; use commit message as goal
 *   roland watch --task "run full review"  # fixed goal on every change
 *   roland watch --pattern "src/**"        # watch file changes instead of git
 *   roland watch --interval 30             # poll every 30s (default 60)
 *   roland watch --once                    # run once on first change, then exit
 *   roland watch --notify --webhook <url>  # push notification on each run
 */
export interface WatchCliArgs {
    task?: string;
    pattern?: string;
    stateDir: string;
    agentsDir?: string;
    intervalSec: number;
    once: boolean;
    notify: boolean;
    webhookUrl?: string;
    quiet: boolean;
}
export declare function parseWatchArgs(argv: string[]): WatchCliArgs;
export declare function runWatchCli(argv: string[]): Promise<void>;
//# sourceMappingURL=watch-cli.d.ts.map