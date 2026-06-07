/**
 * Critique escalation predicates — boundary coverage for shouldEscalateToHuman
 * and resolveCritiqueThresholds (independent retry budget vs verify-failure threshold).
 *
 * Scoped run: npx vitest run tests/unit/escalation.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  shouldEscalateToHuman,
  escalationRetryDecision,
  DEFAULT_ESCALATION_THRESHOLD,
  DEFAULT_MAX_RETRIES,
  type EscalationContext,
} from '../../src/loop-engine/self-improvement/escalation.js';
import {
  resolveCritiqueThresholds,
  clearLoopEngineConfigCache,
} from '../../src/loop-engine/loop-config.js';
import { LoopTemplates } from '../../src/loop-engine/loop-templates.js';

function escalationCtx(overrides: Partial<EscalationContext> = {}): EscalationContext {
  return {
    retryCount: 0,
    maxRetries: DEFAULT_MAX_RETRIES,
    escalationThreshold: DEFAULT_ESCALATION_THRESHOLD,
    consecutiveVerifyFailures: 0,
    hadBlockers: false,
    ...overrides,
  };
}

describe('shouldEscalateToHuman — retryCount boundary', () => {
  it('does not escalate at retryCount=2 with 3 consecutive verify failures (regression)', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({ retryCount: 2, consecutiveVerifyFailures: 3 }),
      ),
    ).toBe(false);
  });

  it('does not escalate at retryCount=1 with failures below escalationThreshold', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({ retryCount: 1, consecutiveVerifyFailures: 3 }),
      ),
    ).toBe(false);
  });

  it('escalates when retry budget exhausted at retryCount=maxRetries', () => {
    expect(shouldEscalateToHuman(escalationCtx({ retryCount: 3 }))).toBe(true);
  });

  it('does not escalate at retryCount=maxRetries-1 even with many verify failures', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({ retryCount: 2, consecutiveVerifyFailures: 100 }),
      ),
    ).toBe(false);
  });
});

describe('shouldEscalateToHuman — consecutive verify-failure threshold', () => {
  it('escalates when consecutive failures reach escalationThreshold and retryCount > 0', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({
          retryCount: 1,
          consecutiveVerifyFailures: 4,
          escalationThreshold: 4,
        }),
      ),
    ).toBe(true);
  });

  it('does not escalate when failures are one below threshold', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({
          retryCount: 2,
          consecutiveVerifyFailures: 3,
          escalationThreshold: 4,
        }),
      ),
    ).toBe(false);
  });

  it('does not escalate on consecutive failures at retryCount=0 (first failure cycle)', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({ retryCount: 0, consecutiveVerifyFailures: 10 }),
      ),
    ).toBe(false);
  });
});

describe('shouldEscalateToHuman — edge cases', () => {
  it('disables escalation when maxRetries <= 0', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({ maxRetries: 0, retryCount: 5, consecutiveVerifyFailures: 10 }),
      ),
    ).toBe(false);
  });

  it('falls back to DEFAULT_ESCALATION_THRESHOLD when escalationThreshold <= 0', () => {
    expect(
      shouldEscalateToHuman(
        escalationCtx({
          escalationThreshold: 0,
          retryCount: 1,
          consecutiveVerifyFailures: DEFAULT_ESCALATION_THRESHOLD,
        }),
      ),
    ).toBe(true);
  });

  it('maps escalation state to escalate retry decision', () => {
    expect(escalationRetryDecision(escalationCtx({ retryCount: 3 }))).toBe('escalate');
    expect(
      escalationRetryDecision(escalationCtx({ retryCount: 2, consecutiveVerifyFailures: 3 })),
    ).toBe('retry');
  });
});

describe('resolveCritiqueThresholds', () => {
  let templates: LoopTemplates;

  beforeEach(() => {
    templates = new LoopTemplates();
    clearLoopEngineConfigCache();
  });

  afterEach(() => {
    clearLoopEngineConfigCache();
    delete process.env.ROLAND_LOOP_TEST_MODE;
  });

  it('uses production thresholds from standard-code-loop template', () => {
    const template = templates.get('standard-code-loop');
    expect(template).toBeDefined();

    const thresholds = resolveCritiqueThresholds(template!);
    expect(thresholds.maxRetries).toBe(3);
    expect(thresholds.escalationThreshold).toBe(4);
  });

  it('applies test-mode overrides when isTestMode is true', () => {
    const template = templates.get('standard-code-loop');
    expect(template).toBeDefined();

    const thresholds = resolveCritiqueThresholds(template!, { isTestMode: true });
    expect(thresholds.maxRetries).toBe(6);
    expect(thresholds.escalationThreshold).toBe(8);
  });

  it('applies test-mode overrides when ROLAND_LOOP_TEST_MODE=1', () => {
    process.env.ROLAND_LOOP_TEST_MODE = '1';
    const template = templates.get('standard-code-loop');
    expect(template).toBeDefined();

    const thresholds = resolveCritiqueThresholds(template!);
    expect(thresholds.maxRetries).toBe(6);
    expect(thresholds.escalationThreshold).toBe(8);
  });
});
