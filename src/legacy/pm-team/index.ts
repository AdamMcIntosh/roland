/**
 * ## P1 Final Consolidation (v1.4.0)
 *
 * Legacy PM Team module — isolated behind `--legacy-pm` for scheduled removal.
 */

/** Target release for complete removal of legacy PM wave/DAG machinery. */
export const LEGACY_PM_REMOVAL_VERSION = 'v1.6.0';

export { runLegacyPmTeam } from './legacy-pm-engine.js';
export type {
  TeamTask,
  TeamPlan,
  TeamTaskResult,
  TeamResult,
  CircuitBreakInfo,
  TeamOrchestratorOptions,
} from './types.js';
