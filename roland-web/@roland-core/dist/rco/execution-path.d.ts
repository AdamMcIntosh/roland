/**
 * Roland execution-path triage — Direct (Cursor chat) vs Team (roland team + ClosedLoop template).
 *
 * Used by:
 *   - MCP `triage` tool (execution_path field)
 *   - Orchestrator / Roland system prompts (EXECUTION_PATH_FRAMEWORK)
 *   - Triage Router skill (.hermes/SKILL.md) and triage-router.ts
 *   - Unit tests for routing examples
 */
export type ExecutionPath = 'direct' | 'team';
export interface ExecutionPathDecision {
    path: ExecutionPath;
    reasons: string[];
    /** Rough effort estimate in minutes */
    estimatedMinutes: number;
    /** When path is 'team', the offer line Roland shows before spawning */
    teamOffer: string | null;
    /** One-line visible summary for the operator */
    summary: string;
    /** True when operator used a force-team trigger — bypasses normal scoring */
    forced?: boolean;
    /** Goal with force-team triggers stripped (for roland_run_team / roland team) */
    cleanedGoal?: string;
    /** Recommended Pure ClosedLoop template (team path only) */
    loopTemplate?: string;
    /** Why this template was chosen */
    loopTemplateReason?: string;
    /** Full `roland team "…" --loop-template …` command */
    teamCommand?: string;
}
/** Case-insensitive triggers that force Team path regardless of task size. */
export declare const FORCE_TEAM_TRIGGERS: ReadonlyArray<{
    pattern: RegExp;
    label: string;
}>;
/** Detect power-user force-team override in the operator message. */
export declare function detectForceTeam(message: string): boolean;
/** Return the matched force-team trigger label, if any. */
export declare function matchedForceTeamTrigger(message: string): string | null;
/** Strip force-team triggers so the remainder is a clean goal for PM team runs. */
export declare function stripForceTeamTriggers(message: string): string;
/** Embedded in Roland system prompts — keep in sync with classifyExecutionPath heuristics. */
export declare const EXECUTION_PATH_FRAMEWORK = "## Execution Path Triage (mandatory \u2014 every new request)\n\n**Hybrid model:** In Cursor, `@roland` + MCP triage is self-contained (no Hermes). Roland ClosedLoop = execution engine \u00B7 Pure ClosedLoop default (`use_pm_team: false`).\n\nBefore acting, classify the request as **Direct** or **Team (ClosedLoop mission)**. State your decision visibly in one line (use the `summary` shape from `triage` when available).\n\n### Direct \u2014 handle in this Cursor chat (fast path)\n\n- Small, **single-file** edits (comment, typo, rename, one-liner)\n- Simple questions, debugging help, research, or quick fixes\n- Clarifications or planning discussions (no implementation yet)\n- Tasks estimated **< 30 minutes**\n- No structured tests or full PACVRE loop required\n\n**When Direct:** proceed immediately with Cursor tools. Do **not** call `roland_run_team`.\n\n### Team \u2014 spawn Pure ClosedLoop mission (recommended for multi-step work)\n\n- Multi-step features or refactors\n- Multiple files / components / services\n- Needs testing, verification gates, reflection, or loop memory\n- Estimated **> 30\u201345 minutes**\n\n**When Team:** do **not** start implementing in chat. Triage in Cursor via `@roland`, then offer:\n\n```bash\nroland team \"<goal>\" --loop-template full-cycle-verified-loop\n```\n\nTemplate preference: `standard-code-loop` (default) \u00B7 `small-fix-loop` \u00B7 `feature-implementation-loop` \u00B7 `refactor-and-modernize-loop` \u00B7 `research-and-plan-loop` \u00B7 `full-cycle-verified-loop` \u00B7 `maintenance-loop`.\n\nWait for operator confirmation unless they used a force-team trigger.\n\n> [DEPRECATED] Do not suggest legacy LeadPM / `use_pm_team: true` unless the operator explicitly requests legacy PM behavior.\n\n### Force-team override (power user)\n\nOperators can bypass scoring and force **Team** with any of these triggers (case-insensitive):\n\n- `--force-team`\n- `force team`\n- `full team`\n- `run as team`\n- `spawn team`\n\n**When force-team is detected:** skip normal triage scoring, respond *\"Understood \u2014 forcing full team mission.\"*, and launch with `execution_path.team_command` (includes `--loop-template`) immediately \u2014 no confirmation.\n\n### Trade-offs\n\n| Path | Pros | Cons |\n|------|------|------|\n| **Direct** | Fast feedback, low overhead, ideal for Q&A and tiny edits | No PACVRE loop, verification gates, or loop memory |\n| **Team + ClosedLoop** | @roland triage + Roland harness, EvaluationGate, reflection, clean PR output | Higher latency; overkill for trivial edits |";
/** Classify whether Roland should act in chat (direct) or offer a ClosedLoop mission (team). */
export declare function classifyExecutionPath(message: string): ExecutionPathDecision;
//# sourceMappingURL=execution-path.d.ts.map