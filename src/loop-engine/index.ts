export { Phase, ALL_PHASES, isPhase, phaseLabel } from './loop-phases.js';
export type { PhaseConfig, LoopTemplate } from './loop-phases.js';

export {
  LoopMemory,
  deriveLoopId,
  readLoopMemoryState,
  findLatestLoopMemory,
  LOOPS_ROOT,
  LOOP_STATE_JSON,
  LOOP_REFLECTION_MD,
} from './loop-memory.js';
export type {
  LoopDiskState,
  LoopMemoryOptions,
  ReflectionEntry,
  StructuredReflection,
  SpecProgressSnapshot,
  BetweenIterationRun,
} from './loop-memory.js';

export {
  evaluateExitConditions,
} from './exit-conditions.js';
export type {
  ExitConditionStatus,
  ExitEvaluationContext,
  ExitEvaluationResult,
} from './exit-conditions.js';

export { runBetweenIterations } from './between-iterations.js';
export type { BetweenIterationsOptions, BetweenIterationsResult } from './between-iterations.js';

export type { ExitConditionConfig, ExitConditionType } from './loop-phases.js';

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
  LoopRetrySnapshot,
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
  ClosedLoop,
  createClosedLoop,
  CLOSED_LOOP_PR_FILE,
} from './closed-loop.js';
export type { ClosedLoopOptions, ClosedLoopResult } from './closed-loop.js';

export {
  EvaluationGate,
  evaluationResultToLoopState,
} from './evaluation-gate.js';
export type {
  EvaluationGateResult,
  EvaluationGateOptions,
  GateResult,
  CustomCriterion,
  CustomCriterionContext,
  CustomCriterionResult,
  GateVerifierType,
} from './evaluation-gate.js';

export {
  SpecialistSpawner,
  PHASE_SPECIALIST_DEFAULTS,
  ON_DEMAND_SPECIALISTS,
} from './specialist-spawner.js';
export type { SpawnRequest, SpecialistSpawnerOptions } from './specialist-spawner.js';

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
  parseMarkdownTaskList,
  computeSpecProgress,
  resolveSpecPath,
  readSpecContent,
  formatSpecProgressSummary,
  createSpecCompletionCriterion,
} from './spec-progress.js';
export type { SpecTaskItem, SpecProgress } from './spec-progress.js';

export {
  createDefaultHandlers,
  PlanPhaseHandler,
  ActPhaseHandler,
  VerifyPhaseHandler,
  CritiquePhaseHandler,
  RetryPhaseHandler,
  EscalatePhaseHandler,
  ObservePhaseHandler,
  ReflectionPhaseHandler,
} from './phase-handlers/index.js';
export type { VerifyPhaseHandlerOptions } from './phase-handlers/verify-phase.js';
export type { RetryPhaseHandlerOptions } from './phase-handlers/retry-phase.js';
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
