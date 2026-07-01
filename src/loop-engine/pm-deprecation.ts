/**
 * ## Assumptions
 * - Hermes (`roland chat`, Cursor `@roland`, `roland team`) is the primary PM / strategist layer.
 * - Roland ClosedLoop is the specialized loop execution engine (PACVRE harness).
 * - Legacy LeadPM / PM Team (`use_pm_team: true`, `pm_plan`/`pm_act`) remains for backward compatibility only.
 */

/** Short tag for inline comments, labels, and log prefixes. */
export const DEPRECATED_LEGACY_PM_TAG = '[DEPRECATED]';

/** Canonical recommendation shown in runtime warnings and docs. */
export const HERMES_PM_RECOMMENDATION =
  'Hermes is now the recommended PM layer. Prefer Pure ClosedLoop (default).';

/** Full runtime warning when legacy PM Team path is active. */
export const LEGACY_PM_TEAM_WARNING =
  `${DEPRECATED_LEGACY_PM_TAG} Legacy PM Team (LeadPM / use_pm_team: true) is deprecated. ` +
  `${HERMES_PM_RECOMMENDATION}`;

/**
 * Emit a deprecation warning when legacy PM Team code paths run.
 * @deprecated Legacy PM Team — use Hermes + Pure ClosedLoop instead.
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
