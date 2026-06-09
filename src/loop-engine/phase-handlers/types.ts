import type { Blackboard } from '../../rco/blackboard.js';
import type { CommandBlackboard } from '../../rco/command-blackboard.js';
import type { Phase, PhaseConfig } from '../loop-phases.js';
import type { LoopCritiqueSnapshot } from '../self-improvement/types.js';
import type { LoopRetrySnapshot, LoopState, LoopVerificationSnapshot } from '../loop-state.js';

export interface PhaseResult {
  success: boolean;
  summary: string;
  /** When true, loop should enter retry phase */
  shouldRetry?: boolean;
  /** When true, loop should escalate to operator */
  shouldEscalate?: boolean;
  /** Structured verification output when phase is verify */
  verification?: LoopVerificationSnapshot;
  /** Structured critique output when phase is critique */
  critique?: LoopCritiqueSnapshot;
  /** Structured retry output when phase is retry */
  retry?: LoopRetrySnapshot;
  /** Full EvaluationGate result when phase is verify */
  evaluation?: import('../evaluation-gate.js').EvaluationGateResult;
}

export interface PhaseHandlerContext {
  goal: string;
  state: LoopState;
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  iteration: number;
  waveNumber?: number;
  hadBlockers?: boolean;
  phaseConfig?: PhaseConfig;
  /** Max retry attempts before escalation (from loop template / config). */
  maxRetries?: number;
  /** Consecutive verify failures before HITL (from loop template / config). */
  escalationThreshold?: number;
}

export interface PhaseHandler {
  readonly phase: Phase;
  execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
