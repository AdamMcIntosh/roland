/**
 * Loop PM bridge — lightweight Plan/Act only (legacy PM Team removed v1.6.0).
 */

import type { Blackboard } from '../coordination/legacy-blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { LoopTemplate, Phase, PhaseConfig } from './loop-phases.js';
import { Phase as P } from './loop-phases.js';
import type { PhaseResult } from './phase-handlers/types.js';
import { RoleModelRouter } from '../models/role-model-router.js';
import { runLightweightAct, runLightweightPlan } from './lightweight-plan-act.js';
import {
  readLoopPmSession,
  writeLoopPmSession,
  LOOP_PM_SESSION_FILE,
  type LoopPmExecutionPath,
  type LoopPmSession,
} from './loop-pm-session.js';

export {
  LOOP_PM_SESSION_FILE,
  readLoopPmSession,
  writeLoopPmSession,
  type LoopPmExecutionPath,
  type LoopPmSession,
} from './loop-pm-session.js';

export interface LoopPmBridgeOptions {
  stateDir: string;
  goal: string;
  template: LoopTemplate;
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  isTestMode?: boolean;
  modelRouter?: RoleModelRouter;
  runId?: string;
}

/** Resolve PM mode — always lightweight after legacy removal. */
export function resolvePmTeamMode(
  _phase: Phase,
  _phaseConfig: PhaseConfig | undefined,
  _template: LoopTemplate,
): 'never' {
  return 'never';
}

export function shouldUsePmTeam(
  _goal: string,
  _mode: 'never' | 'auto' | 'always',
): { usePm: boolean; reason: string } {
  return { usePm: false, reason: 'Pure ClosedLoop lightweight path' };
}

/** Lightweight-only bridge kept for phase handler compatibility. */
export class LoopPmBridge {
  private readonly opts: LoopPmBridgeOptions;
  private readonly router: RoleModelRouter;

  constructor(opts: LoopPmBridgeOptions) {
    this.opts = opts;
    this.router = opts.modelRouter ?? RoleModelRouter.fromConfig();
  }

  private lightweightCtx() {
    return {
      stateDir: this.opts.stateDir,
      goal: this.opts.goal,
      template: this.opts.template,
      blackboard: this.opts.blackboard,
      commandBoard: this.opts.commandBoard,
      modelRouter: this.router,
      cwd:
        process.env.ROLAND_PROJECT_ROOT?.trim() ??
        process.env.ROLAND_ROOT?.trim() ??
        process.cwd(),
      isTestMode: this.opts.isTestMode,
      runId: this.opts.runId,
    };
  }

  async runPlanning(iteration: number, phaseConfig?: PhaseConfig): Promise<PhaseResult> {
    return runLightweightPlan(iteration, this.lightweightCtx(), { phaseConfig });
  }

  async runAct(iteration: number, phaseConfig?: PhaseConfig): Promise<PhaseResult> {
    return runLightweightAct(iteration, this.lightweightCtx(), { phaseConfig });
  }
}
