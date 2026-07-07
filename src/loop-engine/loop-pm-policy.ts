/**
 * ## Pure ClosedLoop (v1.6.0)
 *
 * Legacy PM Team integration removed — all loops use lightweight Plan/Act.
 */

import type { LoopTemplate } from './loop-phases.js';

export interface PmIntegrationStatus {
  enabled: boolean;
  reason: string;
  source: 'disabled';
}

export interface PmIntegrationResolveOptions {
  enablePmIntegration?: boolean;
}

/** Legacy PM Team removed — always Pure ClosedLoop. */
export function resolvePmIntegrationStatus(
  _template: LoopTemplate,
  _opts: PmIntegrationResolveOptions = {},
): PmIntegrationStatus {
  return {
    enabled: false,
    reason: 'Pure ClosedLoop — lightweight Plan/Act',
    source: 'disabled',
  };
}

export function isLoopPmTeamEnabled(
  _template: LoopTemplate,
  _opts: PmIntegrationResolveOptions = {},
): boolean {
  return false;
}

export function formatPmIntegrationLabel(_status: PmIntegrationStatus): string {
  return 'Pure ClosedLoop (Roland @ Cursor + Loop Engine)';
}

export function logPmIntegrationMode(status: PmIntegrationStatus, templateName: string): void {
  console.error(`[Loop] PM Integration: ${formatPmIntegrationLabel(status)}`);
  console.error(`[Loop]   template=${templateName} reason=${status.reason}`);
  console.error(
    '[Loop] @roland / Pure ClosedLoop — lightweight Plan/Act · PACVRE verify/critique/reflect in harness.',
  );
}
