import type { Phase } from '../loop-phases.js';
import type { PhaseHandler } from './types.js';
import { PlanPhaseHandler } from './plan.js';
import { ActPhaseHandler } from './act.js';
import { VerifyPhaseHandler } from './verify-phase.js';
import { CritiquePhaseHandler } from './critique.js';
import { RetryPhaseHandler } from './retry.js';
import { ObservePhaseHandler } from './observe.js';

export type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';

const DEFAULT_HANDLERS: PhaseHandler[] = [
  new PlanPhaseHandler(),
  new ActPhaseHandler(),
  new VerifyPhaseHandler(),
  new CritiquePhaseHandler(),
  new RetryPhaseHandler(),
  new ObservePhaseHandler(),
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
  ObservePhaseHandler,
};
export type { VerifyPhaseHandlerOptions } from './verify-phase.js';
