/**
 * ## Assumptions
 * - ClosedLoop is the single source of truth for all loop-template missions (Loop Engineering pivot).
 * - Legacy PM team orchestration (`runTeamInner`) remains for missions without `--loop-template`.
 * - ClosedLoop.run() owns EvaluationGate, LoopMemory, Reflection, ExitConditions, SpecialistSpawner, and PR formatting.
 * - TeamResult shape is preserved so team-cli, MCP tools, and dashboard callers need no breaking changes.
 * - LoopEngineCoordinator + inline LoopEngine construction in team-orchestrator is deprecated for loop missions.
 */
import type { TeamOrchestratorOptions, TeamResult } from './team-orchestrator.js';
/** True when a loop template id was supplied (CLI `--loop-template`, MCP `loop_template`, etc.). */
export declare function hasLoopTemplate(loopTemplate?: string): boolean;
export interface ClosedLoopMissionOptions extends TeamOrchestratorOptions {
}
/**
 * Run a loop-template mission through ClosedLoop — the primary Loop Engineering execution path.
 *
 * Routing (team-orchestrator):
 * ```typescript
 * if (hasLoopTemplate(loopTemplate)) {
 *   return runClosedLoopMission(opts);
 * }
 * // else legacy PM team mode
 * ```
 */
export declare function runClosedLoopMission(opts: ClosedLoopMissionOptions): Promise<TeamResult>;
/**
 * ## Old PM Persona Deprecated — Hermes is Primary PM
 *
 * Pure ClosedLoop (Hermes PM + Roland Loop Engine) is default.
 * [DEPRECATED] Legacy PM Team opt-in: loop_engine.use_pm_team or template use_pm_team.
 */
//# sourceMappingURL=loop-orchestrator.d.ts.map