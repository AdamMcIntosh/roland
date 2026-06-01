#!/usr/bin/env node
/**
 * Roland PR Mode — reads a GitHub PR via `gh` CLI and runs the PM team
 * to review it, fix issues, and optionally push improvements.
 *
 * Prerequisites: `gh` CLI installed and authenticated.
 *
 * Usage:
 *   roland pr 42                        # review PR #42
 *   roland pr                           # auto-detect PR from current branch
 *   roland pr 42 --fix                  # review + push fixes
 *   roland pr 42 --fix --branch fix/42  # fixes on a specific branch
 *   roland pr 42 --state-dir .roland
 *   roland pr 42 --notify --webhook https://ntfy.sh/my-topic
 */
export interface PrCliArgs {
    prNumber?: number;
    fix: boolean;
    branch?: string;
    stateDir: string;
    agentsDir?: string;
    notify: boolean;
    webhookUrl?: string;
    quiet: boolean;
    reviewOnly: boolean;
}
export declare function parsePrArgs(argv: string[]): PrCliArgs;
export declare function runPrCli(argv: string[]): Promise<void>;
//# sourceMappingURL=pr-cli.d.ts.map