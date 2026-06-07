export type {
  VerificationStrategyType,
  VerificationFailure,
  StrategyResult,
  VerificationResult,
} from './verify-result.js';
export {
  aggregateVerificationResult,
  verificationResultToLoopState,
} from './verify-result.js';

export type { VerificationStrategyConfig } from './verification-strategies.js';
export {
  DEFAULT_VERIFICATION_STRATEGIES,
  SMOKE_STRATEGY,
  INTEGRATION_STRATEGY,
  E2E_STRATEGY,
  resolveStrategies,
  isVerificationStrategyType,
} from './verification-strategies.js';

export { TestExecutor } from './test-executor.js';
export type { TestExecutorOptions, CommandRunner } from './test-executor.js';
