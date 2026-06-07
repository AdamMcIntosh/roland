export { Phase, ALL_PHASES, isPhase, phaseLabel } from './loop-phases.js';
export type { PhaseConfig, LoopTemplate } from './loop-phases.js';

export {
  LOOP_STATE_FILE,
  LoopStateStore,
  createInitialLoopState,
  readLoopState,
} from './loop-state.js';
export type {
  LoopState,
  LoopRunStatus,
  PhaseTransition,
  LoopVerificationSnapshot,
} from './loop-state.js';

export { LoopTemplates, LoopTemplateSchema } from './loop-templates.js';
export { loadLoopEngineConfig, LoopEngineConfigSchema } from './loop-config.js';
export type { LoopEngineConfig } from './loop-config.js';

export type {
  VerificationStrategyType,
  VerificationResult,
  StrategyResult,
  VerificationStrategyConfig,
} from './verification/index.js';
export {
  TestExecutor,
  resolveStrategies,
  aggregateVerificationResult,
  verificationResultToLoopState,
  DEFAULT_VERIFICATION_STRATEGIES,
} from './verification/index.js';
export type { CommandRunner } from './verification/index.js';

export { LoopEngine, LoopEngineCoordinator } from './loop-engine.js';
export type { LoopEngineOptions, LoopHooks, LoopRunResult } from './loop-engine.js';

export {
  createDefaultHandlers,
  PlanPhaseHandler,
  ActPhaseHandler,
  VerifyPhaseHandler,
  CritiquePhaseHandler,
  RetryPhaseHandler,
  ObservePhaseHandler,
} from './phase-handlers/index.js';
export type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './phase-handlers/index.js';
