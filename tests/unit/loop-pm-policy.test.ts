/**
 * Loop PM policy — Pure ClosedLoop only (legacy PM Team removed v1.6.0).
 *
 * PM integration is permanently disabled: template opt-in flags, phase
 * overrides, and enablePmIntegration are all ignored.
 *
 * Scoped run: npx vitest run tests/unit/loop-pm-policy.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolvePmIntegrationStatus,
  isLoopPmTeamEnabled,
  shouldUsePmTeam,
  formatPmIntegrationLabel,
} from '../../src/loop-engine/index.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';
import type { LoopTemplate } from '../../src/loop-engine/loop-phases.js';

const minimalTemplate: LoopTemplate = {
  name: 'minimal-3-phase',
  description: 'test',
  phases: [{ phase: 'plan' }, { phase: 'act' }, { phase: 'verify' }],
};

const legacyOptInTemplate: LoopTemplate = {
  name: 'feature-implementation-loop',
  description: 'test',
  phases: [{ phase: 'plan' }, { phase: 'act' }, { phase: 'verify' }],
  pmPlan: 'always',
  pmAct: 'always',
  usePmTeam: true,
};

describe('loop-pm-policy (Pure ClosedLoop only)', () => {
  beforeEach(() => {
    clearLoopEngineConfigCache();
    delete process.env.ROLAND_LOOP_PM;
  });

  afterEach(() => {
    clearLoopEngineConfigCache();
    delete process.env.ROLAND_LOOP_PM;
  });

  it('defaults to pure ClosedLoop', () => {
    const status = resolvePmIntegrationStatus(minimalTemplate);
    expect(status.enabled).toBe(false);
    expect(status.source).toBe('disabled');
    expect(isLoopPmTeamEnabled(minimalTemplate)).toBe(false);
  });

  it('ignores legacy template opt-in flags (use_pm_team, pm_plan/pm_act: always)', () => {
    const status = resolvePmIntegrationStatus(legacyOptInTemplate);
    expect(status.enabled).toBe(false);
    expect(status.source).toBe('disabled');
    expect(isLoopPmTeamEnabled(legacyOptInTemplate)).toBe(false);
  });

  it('ignores enablePmIntegration override', () => {
    expect(
      resolvePmIntegrationStatus(minimalTemplate, { enablePmIntegration: true }).enabled,
    ).toBe(false);
    expect(
      resolvePmIntegrationStatus(legacyOptInTemplate, { enablePmIntegration: true }).enabled,
    ).toBe(false);
  });

  it('shouldUsePmTeam never routes to PM Team', () => {
    expect(shouldUsePmTeam('Big multi-file refactor across services', 'always').usePm).toBe(false);
    expect(shouldUsePmTeam('Fix typo in README', 'auto').usePm).toBe(false);
    expect(shouldUsePmTeam('Anything', 'never').usePm).toBe(false);
  });

  it('formatPmIntegrationLabel always reports Pure ClosedLoop', () => {
    const status = resolvePmIntegrationStatus(legacyOptInTemplate);
    expect(formatPmIntegrationLabel(status)).toContain('Pure ClosedLoop');
    expect(formatPmIntegrationLabel(status)).not.toContain('[DEPRECATED]');
  });

  it('status reason explains the lightweight path', () => {
    const status = resolvePmIntegrationStatus(legacyOptInTemplate);
    expect(status.reason).toContain('Pure ClosedLoop');
  });
});
