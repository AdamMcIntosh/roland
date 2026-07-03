/**
 * ## Assumptions
 * - In Cursor, `@roland` + MCP triage is self-contained — no Hermes dependency.
 * - `roland chat` (Hermes) is an optional CLI alternative for terminal-only workflows.
 * - Roland ClosedLoop is the specialized loop execution engine (PACVRE harness).
 * - Legacy LeadPM / PM Team (`use_pm_team: true`) remains for backward compatibility only.
 */
/** Short tag for inline comments, labels, and log prefixes. */
export declare const DEPRECATED_LEGACY_PM_TAG = "[DEPRECATED]";
/** Canonical recommendation shown in runtime warnings and docs. */
export declare const HERMES_PM_RECOMMENDATION = "Prefer Pure ClosedLoop (default). In Cursor use @roland; legacy use_pm_team is deprecated.";
/** @deprecated Use HERMES_PM_RECOMMENDATION — name retained for export stability. */
export declare const PURE_CLOSEDLOOP_RECOMMENDATION = "Prefer Pure ClosedLoop (default). In Cursor use @roland; legacy use_pm_team is deprecated.";
/** Full runtime warning when legacy PM Team path is active. */
export declare const LEGACY_PM_TEAM_WARNING: string;
/**
 * Emit a deprecation warning when legacy PM Team code paths run.
 * @deprecated Legacy PM Team — use Pure ClosedLoop + @roland in Cursor instead.
 */
export declare function warnLegacyPmTeam(source: string, detail?: string): void;
/** Warn once per process when `loop_engine.use_pm_team: true` is loaded from config. */
export declare function warnGlobalUsePmTeamIfNeeded(usePmTeam: boolean): void;
//# sourceMappingURL=pm-deprecation.d.ts.map