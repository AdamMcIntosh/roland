/**
 * ## P1 Final Consolidation (v1.4.0)
 *
 * Thin team router — delegates to ClosedLoop (default) or legacy PM engine (`--legacy-pm`).
 *
 * - Loop-template missions → `runClosedLoopMission()` (Pure ClosedLoop)
 * - Legacy PM Team → `src/legacy/pm-team/` (removal target: v1.6.0)
 * - ClosedLoop PM embed slices → `runLegacyPmTeam()` via `pmSlice` / `loopEmbedded`
 */
import { LEGACY_PM_REMOVAL_VERSION } from '../legacy/pm-team/index.js';
export type { TeamTask, TeamPlan, TeamTaskResult, TeamResult, CircuitBreakInfo, TeamOrchestratorOptions, } from '../legacy/pm-team/types.js';
export { LEGACY_PM_REMOVAL_VERSION };
import type { TeamOrchestratorOptions, TeamResult } from '../legacy/pm-team/types.js';
/**
 * Run a team mission — routes to ClosedLoop when `loopTemplate` is set,
 * otherwise legacy PM waves (or PM embed slices when `loopEmbedded`).
 */
export declare function runTeam(opts: TeamOrchestratorOptions): Promise<TeamResult>;
/**
 * ## P1 Consolidation Complete
 *
 * team-orchestrator.ts reduced to thin router (~120 lines).
 * Legacy PM bulk lives in src/legacy/pm-team/ (removal: v1.6.0).
 */
//# sourceMappingURL=team-orchestrator.d.ts.map