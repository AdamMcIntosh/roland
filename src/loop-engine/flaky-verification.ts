/**
 * ## P1 Honesty & Consolidation
 *
 * Tracks consecutive identical verification failures to detect likely
 * test-suite or environment issues rather than code regressions.
 */

import { createHash } from 'crypto';
import type { GateResult } from './evaluation-gate.js';

export const DEFAULT_FLAKY_ESCAPE_THRESHOLD = 3;

export const FLAKY_DIAGNOSIS = 'test-suite/environment failure';

export interface FlakyVerificationState {
  lastFingerprint?: string;
  consecutiveIdenticalFailures: number;
}

export interface FlakyVerificationUpdate {
  state: FlakyVerificationState;
  fingerprint: string;
  hitThreshold: boolean;
  diagnosis?: string;
}

/** Build a stable fingerprint from failed gate names and failure messages. */
export function verificationFailureFingerprint(gates: GateResult[]): string {
  const parts = gates
    .filter((g) => !g.pass && !g.skipped)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const failures = g.failures.length > 0 ? g.failures.join('|') : 'no-detail';
      return `${g.name}:${failures}`;
    });

  const raw = parts.join(';') || 'no-failures';
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Update flaky verification tracking after a verify phase run.
 * Resets the streak when verification passes or the fingerprint changes.
 */
export function updateFlakyVerification(
  prev: FlakyVerificationState | undefined,
  gates: GateResult[],
  verificationPassed: boolean,
  threshold: number = DEFAULT_FLAKY_ESCAPE_THRESHOLD,
): FlakyVerificationUpdate {
  if (verificationPassed) {
    return {
      state: { consecutiveIdenticalFailures: 0 },
      fingerprint: '',
      hitThreshold: false,
    };
  }

  const fingerprint = verificationFailureFingerprint(gates);
  const sameAsLast = prev?.lastFingerprint === fingerprint;
  const consecutiveIdenticalFailures = sameAsLast
    ? (prev?.consecutiveIdenticalFailures ?? 0) + 1
    : 1;

  const state: FlakyVerificationState = {
    lastFingerprint: fingerprint,
    consecutiveIdenticalFailures,
  };

  const hitThreshold = consecutiveIdenticalFailures >= threshold;

  return {
    state,
    fingerprint,
    hitThreshold,
    diagnosis: hitThreshold ? FLAKY_DIAGNOSIS : undefined,
  };
}
