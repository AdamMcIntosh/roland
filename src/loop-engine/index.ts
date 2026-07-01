export { Phase, ALL_PHASES, isPhase, phaseLabel } from './loop-phases.js';
export type { PhaseConfig, LoopTemplate, PmTeamMode, SpecialistSpawnDefinition, SpawnConditions, VerificationStrategyDefinition, BetweenIterationsHookConfig, PhaseVerificationEntry } from './loop-phases.js';

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

export { LoopTemplates, LoopTemplateSchema, lintLoopTemplate, lintAllLoopTemplates, CORE_GENERIC_TEMPLATES, TEMPLATE_ALIASES, summarizeTemplateSpawns, buildLoopTemplateCatalog } from './loop-templates.js';
export type { TemplateLintIssue, TemplateLoadError, TemplateLintSeverity, LoopTemplateListEntry } from './loop-templates.js';
export {
  loadLoopEngineConfig,
  loadDefaultDispatchPolicy,
  LoopEngineConfigSchema,
  resolveCritiqueThresholds,
  resolveBetweenIterations,
  clearLoopEngineConfigCache,
} from './loop-config.js';
export type { LoopEngineConfig, CritiqueThresholds } from './loop-config.js';

export {
  runLoopReadinessCheck,
  formatLoopReadinessReport,
} from './loop-readiness.js';
export type { LoopReadinessReport, ReadinessCheck } from './loop-readiness.js';

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
  LOOP_PM_SESSION_FILE,
  readLoopPmSession,
  writeLoopPmSession,
} from './loop-pm-session.js';
export type { LoopPmSession, LoopPmExecutionPath } from './loop-pm-session.js';

export {
  LoopPmBridge,
  resolvePmTeamMode,
  shouldUsePmTeam,
} from './pm-integration.js';
export type { LoopPmBridgeOptions } from './pm-integration.js';

export {
  resolvePmIntegrationStatus,
  isLoopPmTeamEnabled,
  logPmIntegrationMode,
  formatPmIntegrationLabel,
} from './loop-pm-policy.js';
export type { PmIntegrationStatus } from './loop-pm-policy.js';

export {
  DEPRECATED_LEGACY_PM_TAG,
  HERMES_PM_RECOMMENDATION,
  LEGACY_PM_TEAM_WARNING,
  warnLegacyPmTeam,
  warnGlobalUsePmTeamIfNeeded,
} from './pm-deprecation.js';

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
  evaluateSpawnConditions,
  interpolateSpawnPrompt,
  resolvePhaseSpawns,
  collapseToSpawnRequest,
} from './specialist-spawner.js';
export type { SpawnRequest, SpecialistSpawnerOptions, SpawnContext } from './specialist-spawner.js';

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

export {
  resolveVerificationStrategies,
  resolveBetweenIterationsHook,
  resolveBetweenIterationsCommand,
  summarizeVerificationConfig,
  summarizeBetweenIterationsConfig,
  listPhaseAfterHooks,
  normalizeBetweenIterationsHook,
  resolveMinConfidence,
} from './loop-template-resolution.js';
export { runGitCommitAction } from './git-commit-action.js';
export type { GitCommitActionOptions, GitCommitActionResult } from './git-commit-action.js';
export {
  GitCommitApprovalQueue,
  GIT_COMMIT_APPROVAL_FILE,
  DEFAULT_GIT_COMMIT_APPROVAL_TIMEOUT_MS,
} from './git-commit-approval.js';
export type {
  GitCommitApprovalRequest,
  GitCommitApprovalWaitResult,
} from './git-commit-approval.js';
export type { ResolvedBetweenIterationsHook } from './loop-template-resolution.js';
export type { LoopLiveActivity, LoopSpawnPulse, LoopGitCommitApprovalSnapshot } from './loop-state.js';
export type { LoopHealthReport, LoopHealthStatus } from './loop-health.js';
export { buildLoopHealthReport } from './loop-health.js';

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
