/**
 * Verification strategy catalogue — maps types to shell commands.
 *
 * Defaults align with Roland's npm scripts; override via config.yaml loop_engine.verification.
 */

import type { VerificationStrategyType } from './verify-result.js';

export interface VerificationStrategyConfig {
  type: VerificationStrategyType;
  command: string;
  timeoutMs?: number;
  /** When true, failure does not fail the overall verify gate */
  optional?: boolean;
}

export const DEFAULT_VERIFICATION_STRATEGIES: VerificationStrategyConfig[] = [
  { type: 'unit', command: 'npm run test:run', timeoutMs: 180_000 },
  { type: 'lint', command: 'npm run lint', timeoutMs: 120_000, optional: true },
  { type: 'typecheck', command: 'npm run build', timeoutMs: 180_000, optional: true },
];

export const SMOKE_STRATEGY: VerificationStrategyConfig = {
  type: 'smoke',
  command: 'node scripts/test-mcp-tools.mjs',
  timeoutMs: 60_000,
  optional: true,
};

export const INTEGRATION_STRATEGY: VerificationStrategyConfig = {
  type: 'integration',
  command: 'npm run test:rco',
  timeoutMs: 180_000,
  optional: true,
};

export const E2E_STRATEGY: VerificationStrategyConfig = {
  type: 'e2e',
  command: 'npm run test:e2e',
  timeoutMs: 300_000,
  optional: true,
};

const BUILTIN_BY_TYPE: Record<VerificationStrategyType, VerificationStrategyConfig> = {
  unit: DEFAULT_VERIFICATION_STRATEGIES[0]!,
  lint: DEFAULT_VERIFICATION_STRATEGIES[1]!,
  typecheck: DEFAULT_VERIFICATION_STRATEGIES[2]!,
  smoke: SMOKE_STRATEGY,
  integration: INTEGRATION_STRATEGY,
  e2e: E2E_STRATEGY,
};

export function resolveStrategies(
  configured: VerificationStrategyConfig[] | undefined,
  templateFilter?: VerificationStrategyType[],
): VerificationStrategyConfig[] {
  const base = configured && configured.length > 0 ? configured : DEFAULT_VERIFICATION_STRATEGIES;
  if (!templateFilter || templateFilter.length === 0) return base;

  const byType = new Map(base.map((s) => [s.type, s]));
  const resolved: VerificationStrategyConfig[] = [];
  for (const type of templateFilter) {
    const hit = byType.get(type) ?? BUILTIN_BY_TYPE[type];
    if (hit) resolved.push(hit);
  }
  return resolved.length > 0 ? resolved : base;
}

export function isVerificationStrategyType(value: string): value is VerificationStrategyType {
  return value in BUILTIN_BY_TYPE;
}
