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
  LoopCritiqueSnapshot,
} from './loop-state.js';

export { LoopTemplates, LoopTemplateSchema } from './loop-templates.js';
export {
  loadLoopEngineConfig,
  LoopEngineConfigSchema,
  resolveCritiqueThresholds,
  clearLoopEngineConfigCache,
} from './loop-config.js';
export type { LoopEngineConfig, CritiqueThresholds } from './loop-config.js';

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
  LoopObservability,
  computeLoopMetrics,
  summarizeHistory,
  LOOP_METRICS_FILE,
  LOOP_HISTORY_FILE,
  HISTORY_SUMMARIZE_AT,
} from './loop-observability.js';
export type {
  LoopMetrics,
  PhaseTransitionLog,
  LoopHistoryEntry,
  LoopExecutionHistory,
  PhaseDurationStats,
} from './loop-observability.js';

export {
  saveLoopCheckpoint,
  readLoopCheckpoint,
  clearLoopCheckpoint,
  tryRecoverLoopState,
  LOOP_CHECKPOINT_FILE,
} from './loop-checkpoint.js';
export type { LoopCheckpoint } from './loop-checkpoint.js';

export {
  isRateLimitOrUnavailableError,
  degradedCritiqueModel,
  loopDegradationPolicy,
  ModelDegradationPolicy,
} from './loop-resilience.js';
export type { DegradationState } from './loop-resilience.js';

export { buildLoopHealthReport } from './loop-health.js';
export type { LoopHealthReport, LoopHealthStatus } from './loop-health.js';

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

export {
  CritiqueEngine,
  resolveRetryStrategy,
  shouldEscalateToHuman,
  generateImprovementProposals,
} from './self-improvement/index.js';
export type {
  RetryDecision,
  CritiqueModel,
  CritiqueInput,
  CritiqueOutput,
  ImprovementProposal,
} from './self-improvement/index.js';
