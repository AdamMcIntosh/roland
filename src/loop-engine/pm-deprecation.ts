/**
 * ## Assumptions
 * - In Cursor, `@roland` + MCP triage is self-contained.
 * - Roland ClosedLoop is the specialized loop execution engine (PACVRE harness).
 * - Legacy LeadPM / PM Team (`use_pm_team: true`) remains for backward compatibility only.
 */

/** Short tag for inline comments, labels, and log prefixes. */
export const DEPRECATED_LEGACY_PM_TAG = '[DEPRECATED]';

/** Canonical recommendation shown in runtime warnings and docs. */
export const PURE_CLOSEDLOOP_RECOMMENDATION =
  'Prefer Pure ClosedLoop (default). In Cursor use @roland; legacy use_pm_team is deprecated.';

/** Full runtime warning when legacy PM Team path is active. */
export const LEGACY_PM_TEAM_WARNING =
  `${DEPRECATED_LEGACY_PM_TAG} Legacy PM Team (LeadPM / use_pm_team: true) is deprecated. ` +
  `${PURE_CLOSEDLOOP_RECOMMENDATION}`;

/**
 * Emit a deprecation warning when legacy PM Team code paths run.
 * @deprecated Legacy PM Team — use Pure ClosedLoop + @roland in Cursor instead.
 */
export function warnLegacyPmTeam(source: string, detail?: string): void {
  const suffix = detail ? ` (${detail})` : '';
  console.warn(`${LEGACY_PM_TEAM_WARNING} Source: ${source}${suffix}`);
}

let warnedGlobalUsePmTeam = false;

/** Warn once per process when `loop_engine.use_pm_team: true` is loaded from config. */
export function warnGlobalUsePmTeamIfNeeded(usePmTeam: boolean): void {
  if (!usePmTeam || warnedGlobalUsePmTeam) return;
  warnedGlobalUsePmTeam = true;
  warnLegacyPmTeam('loop_engine.use_pm_team: true');
}
