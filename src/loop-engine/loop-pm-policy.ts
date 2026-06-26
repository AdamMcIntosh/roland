/**
 * ## Assumptions
 * - Pure ClosedLoop is the default — PM Team is opt-in only.
 * - Global: `loop_engine.use_pm_team` in config.yaml (default false).
 * - Per-template: `use_pm_team: true` or `pm_plan/pm_act: always`.
 * - `pm_plan/pm_act: auto` invokes PM only when global or template opt-in is true.
 * - `enablePmIntegration` on ClosedLoopOptions overrides both ways.
 */

import type { LoopTemplate } from './loop-phases.js';
import { loadLoopEngineConfig } from './loop-config.js';

export interface PmIntegrationStatus {
  enabled: boolean;
  /** Human-readable reason for logs and dashboard. */
  reason: string;
  source: 'disabled' | 'opt-in' | 'always' | 'override-on' | 'override-off';
}

export interface PmIntegrationResolveOptions {
  enablePmIntegration?: boolean;
}

/** Resolve whether legacy PM Team is wired into this loop mission. */
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
    return {
      enabled: true,
      reason: 'enablePmIntegration=true — legacy PM Team explicitly enabled',
      source: 'override-on',
    };
  }

  const hasAlways =
    template.pmPlan === 'always' ||
    template.pmAct === 'always' ||
    template.phases.some((p) => p.pmTeam === 'always');

  if (hasAlways) {
    return {
      enabled: true,
      reason: 'template pm_plan/pm_act/phase pm_team: always',
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

  return {
    enabled: true,
    reason: templateOptIn
      ? 'template use_pm_team: true'
      : 'loop_engine.use_pm_team: true',
    source: 'opt-in',
  };
}

export function isLoopPmTeamEnabled(
  template: LoopTemplate,
  opts: PmIntegrationResolveOptions = {},
): boolean {
  return resolvePmIntegrationStatus(template, opts).enabled;
}

/** Dashboard / health label — Pure ClosedLoop vs PM-Enhanced. */
export function formatPmIntegrationLabel(status: PmIntegrationStatus): string {
  return status.enabled ? 'PM-Enhanced (Legacy)' : 'Pure ClosedLoop';
}

/** Structured log lines for loop mission startup (used when ModelRouter summary is skipped). */
export function logPmIntegrationMode(status: PmIntegrationStatus, templateName: string): void {
  const label = formatPmIntegrationLabel(status);
  console.error(`[Loop] PM Integration: ${label}`);
  console.error(`[Loop]   template=${templateName} reason=${status.reason}`);
  if (status.enabled) {
    console.error(
      '[Loop] ⚠ Legacy PM Team will delegate Plan/Act to team-orchestrator (pmSlice). ' +
        'Prefer pure ClosedLoop unless multi-agent waves are required.',
    );
  } else {
    console.error('[Loop] Plan/Act use lightweight handlers — verify/critique/reflect in ClosedLoop harness.');
  }
}

/**
 * ## Final Decoupling + Model Router Integration Complete
 *
 * ```yaml
 * # Pure ClosedLoop (default)
 * loop_engine:
 *   use_pm_team: false
 *
 * # Enable PM for templates with pm_plan/pm_act: auto
 * loop_engine:
 *   use_pm_team: true
 *
 * # Per-template opt-in (feature-implementation-loop.yaml)
 * use_pm_team: true
 * pm_plan: auto
 * pm_act: auto
 * ```
 */
