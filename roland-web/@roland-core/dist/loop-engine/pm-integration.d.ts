import type { Blackboard } from '../coordination/legacy-blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { TeamOrchestratorOptions } from '../rco/team-orchestrator.js';
import type { LoopTemplate, Phase, PhaseConfig, PmTeamMode } from './loop-phases.js';
import type { PhaseResult } from './phase-handlers/types.js';
import { ModelRouter } from '../models/model-router.js';
export { LOOP_PM_SESSION_FILE, readLoopPmSession, writeLoopPmSession, type LoopPmExecutionPath, type LoopPmSession, } from './loop-pm-session.js';
export interface LoopPmBridgeOptions {
    stateDir: string;
    goal: string;
    template: LoopTemplate;
    blackboard: Blackboard;
    commandBoard?: CommandBlackboard;
    isTestMode?: boolean;
    /** Forwarded to embedded PM Team runs (HITL, callbacks). */
    teamOpts?: Partial<TeamOrchestratorOptions>;
    modelRouter?: ModelRouter;
}
/** [DEPRECATED] Resolve legacy PM Team mode for a phase from phase config, template defaults, or never. */
export declare function resolvePmTeamMode(phase: Phase, phaseConfig: PhaseConfig | undefined, template: LoopTemplate): PmTeamMode;
/** [DEPRECATED] Decide whether to invoke legacy PM Team for this phase (`auto` requires loop-level PM opt-in). */
export declare function shouldUsePmTeam(goal: string, mode: PmTeamMode, opts?: {
    pmOptIn?: boolean;
}): {
    usePm: boolean;
    reason: string;
};
/**
 * [DEPRECATED] Legacy PM Team bridge — bridges ClosedLoop Plan/Act to team-orchestrator when opted in.
 * Prefer Hermes + Pure ClosedLoop (lightweight-plan-act.ts) unless use_pm_team is enabled.
 * @deprecated Use Hermes for PM duties; keep only for backward compatibility.
 */
export declare class LoopPmBridge {
    private readonly opts;
    private readonly router;
    private readonly pmOptIn;
    constructor(opts: LoopPmBridgeOptions);
    private lightweightCtx;
    /** Run Plan phase — optionally invokes Lead PM planning. */
    runPlanning(iteration: number, phaseConfig?: PhaseConfig): Promise<PhaseResult>;
    /** Run Act phase — uses PM waves when Plan chose pm_team, else pure ClosedLoop. */
    runAct(iteration: number, phaseConfig?: PhaseConfig): Promise<PhaseResult>;
    private runPmPlanning;
    private runPmAct;
}
/**
 * ## Final Decoupling + Model Router Integration Complete
 *
 * Legacy PM Team bridge — only constructed when `isLoopPmTeamEnabled()` is true.
 * Pure ClosedLoop uses `lightweight-plan-act.ts` directly from phase handlers.
 */
//# sourceMappingURL=pm-integration.d.ts.map