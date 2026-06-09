import type { Phase } from '../loop-phases.js';
import type { PhaseHandler } from './types.js';
import { PlanPhaseHandler } from './plan.js';
import { ActPhaseHandler } from './act.js';
import { VerifyPhaseHandler } from './verify-phase.js';
import { CritiquePhaseHandler } from './critique-phase.js';
import { RetryPhaseHandler } from './retry-phase.js';
import { EscalatePhaseHandler } from './escalate-phase.js';
import { ObservePhaseHandler } from './observe.js';
import { ReflectionPhaseHandler } from './reflection-phase.js';

export type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';

const DEFAULT_HANDLERS: PhaseHandler[] = [
  new PlanPhaseHandler(),
  new ActPhaseHandler(),
  new VerifyPhaseHandler(),
  new CritiquePhaseHandler(),
  new RetryPhaseHandler(),
  new EscalatePhaseHandler(),
  new ObservePhaseHandler(),
  new ReflectionPhaseHandler(),
];

export function createDefaultHandlers(): Map<Phase, PhaseHandler> {
  return new Map(DEFAULT_HANDLERS.map((h) => [h.phase, h]));
}

export {
  PlanPhaseHandler,
  ActPhaseHandler,
  VerifyPhaseHandler,
  CritiquePhaseHandler,
  RetryPhaseHandler,
  EscalatePhaseHandler,
  ObservePhaseHandler,
  ReflectionPhaseHandler,
};
export type { VerifyPhaseHandlerOptions } from './verify-phase.js';
export type { RetryPhaseHandlerOptions } from './retry-phase.js';
