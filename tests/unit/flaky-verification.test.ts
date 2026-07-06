/**
 * ## P1 Honesty & Consolidation
 *
 * Flaky verification escape hatch — fingerprint and threshold tracking.
 *
 * Scoped: npm run test:run -- tests/unit/flaky-verification.test.ts
 */

import { describe, it, expect } from 'vitest';
import type { GateResult } from '../../src/loop-engine/evaluation-gate.js';
import {
  DEFAULT_FLAKY_ESCAPE_THRESHOLD,
  FLAKY_DIAGNOSIS,
  updateFlakyVerification,
  verificationFailureFingerprint,
} from '../../src/loop-engine/flaky-verification.js';

function failedGate(name: string, failures: string[]): GateResult {
  return {
    type: 'unit',
    name,
    pass: false,
    required: true,
    weight: 1,
    durationMs: 10,
    confidence: 0,
    failures,
  };
}

function passedGate(name: string): GateResult {
  return {
    type: 'unit',
    name,
    pass: true,
    required: true,
    weight: 1,
    durationMs: 5,
    confidence: 1,
    failures: [],
  };
}

describe('verificationFailureFingerprint', () => {
  it('hashes failed gate names and failure messages', () => {
    const gates = [failedGate('unit', ['expected true to be false'])];
    const fp1 = verificationFailureFingerprint(gates);
    const fp2 = verificationFailureFingerprint(gates);
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
  });

  it('changes when failure messages differ', () => {
    const fp1 = verificationFailureFingerprint([failedGate('unit', ['error A'])]);
    const fp2 = verificationFailureFingerprint([failedGate('unit', ['error B'])]);
    expect(fp1).not.toBe(fp2);
  });

  it('ignores passing and skipped gates', () => {
    const fp = verificationFailureFingerprint([
      passedGate('lint'),
      { ...failedGate('unit', ['boom']), skipped: true },
      failedGate('unit', ['boom']),
    ]);
    expect(fp).toBe(verificationFailureFingerprint([failedGate('unit', ['boom'])]));
  });
});

describe('updateFlakyVerification', () => {
  it('resets streak when verification passes', () => {
    const prev = { lastFingerprint: 'abc', consecutiveIdenticalFailures: 2 };
    const result = updateFlakyVerification(prev, [failedGate('unit', ['x'])], true, 3);
    expect(result.state.consecutiveIdenticalFailures).toBe(0);
    expect(result.hitThreshold).toBe(false);
    expect(result.state.lastFingerprint).toBeUndefined();
  });

  it('increments consecutive count for identical failures', () => {
    const gates = [failedGate('unit', ['same error'])];
    const fp = verificationFailureFingerprint(gates);

    const first = updateFlakyVerification(undefined, gates, false, 3);
    expect(first.state.consecutiveIdenticalFailures).toBe(1);
    expect(first.hitThreshold).toBe(false);

    const second = updateFlakyVerification(first.state, gates, false, 3);
    expect(second.state.consecutiveIdenticalFailures).toBe(2);
    expect(second.fingerprint).toBe(fp);
    expect(second.hitThreshold).toBe(false);
  });

  it('resets count when fingerprint changes', () => {
    const gatesA = [failedGate('unit', ['error A'])];
    const gatesB = [failedGate('unit', ['error B'])];
    const first = updateFlakyVerification(undefined, gatesA, false, 3);
    const second = updateFlakyVerification(first.state, gatesB, false, 3);
    expect(second.state.consecutiveIdenticalFailures).toBe(1);
    expect(second.hitThreshold).toBe(false);
  });

  it('hits threshold and returns test-suite/environment diagnosis', () => {
    const gates = [failedGate('unit', ['flaky timeout'])];
    let state = undefined;
    let last;
    for (let i = 0; i < DEFAULT_FLAKY_ESCAPE_THRESHOLD; i++) {
      last = updateFlakyVerification(state, gates, false, DEFAULT_FLAKY_ESCAPE_THRESHOLD);
      state = last.state;
    }
    expect(last!.hitThreshold).toBe(true);
    expect(last!.diagnosis).toBe(FLAKY_DIAGNOSIS);
    expect(last!.state.consecutiveIdenticalFailures).toBe(DEFAULT_FLAKY_ESCAPE_THRESHOLD);
  });

  it('respects custom threshold from config', () => {
    const gates = [failedGate('unit', ['same'])];
    let state = undefined;
    let last;
    for (let i = 0; i < 2; i++) {
      last = updateFlakyVerification(state, gates, false, 2);
      state = last.state;
    }
    expect(last!.hitThreshold).toBe(true);
    expect(last!.diagnosis).toBe(FLAKY_DIAGNOSIS);
  });
});
