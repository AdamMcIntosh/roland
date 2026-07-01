/**
 * ## Assumptions
 * - In Cursor, `@roland` + MCP triage handles PM — no Hermes dependency.
 * - Roland ClosedLoop is the loop execution engine (PACVRE harness); Pure ClosedLoop is the default.
 * - [DEPRECATED] Legacy PM Team (LeadPM, `use_pm_team: true`, `pm_plan`/`pm_act`) is advanced/legacy opt-in only.
 * - Global: `loop_engine.use_pm_team` in config.yaml (default false).
 * - Per-template: `use_pm_team: true` or `pm_plan/pm_act: always`.
 * - `pm_plan/pm_act: auto` invokes legacy PM only when global or template opt-in is true.
 * - `enablePmIntegration` on ClosedLoopOptions overrides both ways.
 */

import type { LoopTemplate } from './loop-phases.js';
import { loadLoopEngineConfig } from './loop-config.js';
import { warnLegacyPmTeam } from './pm-deprecation.js';

export interface PmIntegrationStatus {
  enabled: boolean;
  /** Human-readable reason for logs and dashboard. */
  reason: string;
  source: 'disabled' | 'opt-in' | 'always' | 'override-on' | 'override-off';
}

export interface PmIntegrationResolveOptions {
  enablePmIntegration?: boolean;
}

/**
 * Resolve whether [DEPRECATED] legacy PM Team is wired into this loop mission.
 * @deprecated Prefer Pure ClosedLoop + @roland in Cursor. Legacy path kept for backward compatibility.
 */
export function resolvePmIntegrationStatus(
  template: LoopTemplate,
  opts: PmIntegrationResolveOptions = {},
): PmIntegrationStatus {
  if (opts.enablePmIntegration === false) {
    return {
      enabled: false,
      reason: 'enablePmIntegration=false — pure ClosedLoop',
      source: 'override-off',
    };
  }
  if (opts.enablePmIntegration === true) {
    warnLegacyPmTeam('enablePmIntegration=true');
    return {
      enabled: true,
      reason: '[DEPRECATED] enablePmIntegration=true — legacy PM Team explicitly enabled',
      source: 'override-on',
    };
  }

  const hasAlways =
    template.pmPlan === 'always' ||
    template.pmAct === 'always' ||
    template.phases.some((p) => p.pmTeam === 'always');

  if (hasAlways) {
    warnLegacyPmTeam('template pm_plan/pm_act/phase pm_team: always');
    return {
      enabled: true,
      reason: '[DEPRECATED] template pm_plan/pm_act/phase pm_team: always',
      source: 'always',
    };
  }

  const cfg = loadLoopEngineConfig();
  const globalOptIn = cfg.usePmTeam === true;
  const templateOptIn = template.usePmTeam === true;

  if (!globalOptIn && !templateOptIn) {
    const hasAuto =
      template.pmPlan === 'auto' ||
      template.pmAct === 'auto' ||
      template.phases.some((p) => p.pmTeam === 'auto');
    if (hasAuto) {
      return {
        enabled: false,
        reason:
          'pm_plan/pm_act auto present but use_pm_team not enabled — pure ClosedLoop ' +
          '(set loop_engine.use_pm_team: true or template use_pm_team: true)',
        source: 'disabled',
      };
    }
    return {
      enabled: false,
      reason: 'no PM Team opt-in — pure ClosedLoop',
      source: 'disabled',
    };
  }

  const reason = templateOptIn
    ? 'template use_pm_team: true'
    : 'loop_engine.use_pm_team: true';
  warnLegacyPmTeam(reason);
  return {
    enabled: true,
    reason: `[DEPRECATED] ${reason}`,
    source: 'opt-in',
  };
}

export function isLoopPmTeamEnabled(
  template: LoopTemplate,
  opts: PmIntegrationResolveOptions = {},
): boolean {
  return resolvePmIntegrationStatus(template, opts).enabled;
}

/** Dashboard / health label — Hermes + Pure ClosedLoop vs [DEPRECATED] legacy PM Team. */
export function formatPmIntegrationLabel(status: PmIntegrationStatus): string {
  return status.enabled
    ? 'PM-Enhanced [DEPRECATED] — use Pure ClosedLoop'
    : 'Pure ClosedLoop (Roland @ Cursor + Loop Engine)';
}

/** Structured log lines for loop mission startup (used when ModelRouter summary is skipped). */
export function logPmIntegrationMode(status: PmIntegrationStatus, templateName: string): void {
  const label = formatPmIntegrationLabel(status);
  console.error(`[Loop] PM Integration: ${label}`);
  console.error(`[Loop]   template=${templateName} reason=${status.reason}`);
  if (status.enabled) {
    console.error(
      '[Loop] [DEPRECATED] Legacy PM Team will delegate Plan/Act to team-orchestrator (pmSlice). ' +
        'Prefer Pure ClosedLoop (use_pm_team: false).',
    );
  } else {
    console.error(
      '[Loop] @roland / Pure ClosedLoop — lightweight Plan/Act · PACVRE verify/critique/reflect in harness.',
    );
  }
}

/**
 * ## Old PM Persona Deprecated — Pure ClosedLoop + @roland
 *
 * ```yaml
 * # Recommended: Pure ClosedLoop (default) — triage via @roland in Cursor
 * loop_engine:
 *   use_pm_team: false
 *
 * # [DEPRECATED] Legacy PM Team opt-in — advanced/legacy only
 * loop_engine:
 *   use_pm_team: true
 *
 * # Per-template legacy opt-in (feature-implementation-loop.yaml)
 * use_pm_team: true
 * pm_plan: auto
 * pm_act: auto
 * ```
 */
