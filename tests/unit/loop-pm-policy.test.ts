/**
 * Loop PM policy — pure ClosedLoop default, explicit PM opt-in.
 *
 * Scoped run: npx vitest run tests/unit/loop-pm-policy.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolvePmIntegrationStatus,
  isLoopPmTeamEnabled,
  shouldUsePmTeam,
} from '../../src/loop-engine/index.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';
import type { LoopTemplate } from '../../src/loop-engine/loop-phases.js';

const minimalTemplate: LoopTemplate = {
  name: 'minimal-3-phase',
  description: 'test',
  phases: [{ phase: 'plan' }, { phase: 'act' }, { phase: 'verify' }],
};

const autoTemplate: LoopTemplate = {
  name: 'feature-implementation-loop',
  description: 'test',
  phases: [{ phase: 'plan' }, { phase: 'act' }, { phase: 'verify' }],
  pmPlan: 'auto',
  pmAct: 'auto',
};

const optInTemplate: LoopTemplate = {
  ...autoTemplate,
  usePmTeam: true,
};

describe('loop-pm-policy', () => {
  beforeEach(() => {
    clearLoopEngineConfigCache();
    delete process.env.ROLAND_LOOP_PM;
  });

  afterEach(() => {
    clearLoopEngineConfigCache();
    delete process.env.ROLAND_LOOP_PM;
  });

  it('defaults to pure ClosedLoop when no PM opt-in', () => {
    const status = resolvePmIntegrationStatus(autoTemplate);
    expect(status.enabled).toBe(false);
    expect(isLoopPmTeamEnabled(autoTemplate)).toBe(false);
  });

  it('enables PM when template use_pm_team is true', () => {
    const status = resolvePmIntegrationStatus(optInTemplate);
    expect(status.enabled).toBe(true);
    expect(status.source).toBe('opt-in');
  });

  it('shouldUsePmTeam auto requires pmOptIn', () => {
    const without = shouldUsePmTeam('Big multi-file refactor across services', 'auto', { pmOptIn: false });
    expect(without.usePm).toBe(false);

    const withOptIn = shouldUsePmTeam('Big multi-file refactor across services', 'auto', { pmOptIn: true });
    expect(withOptIn.usePm).toBe(true);
  });

  it('minimal template stays pure ClosedLoop', () => {
    expect(resolvePmIntegrationStatus(minimalTemplate).enabled).toBe(false);
  });

  it('enablePmIntegration=true forces PM on', () => {
    expect(
      resolvePmIntegrationStatus(minimalTemplate, { enablePmIntegration: true }).enabled,
    ).toBe(true);
  });
});
