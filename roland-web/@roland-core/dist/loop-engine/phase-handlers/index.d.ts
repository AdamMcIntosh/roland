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
/** Handlers without PM bridge — used when pm integration is wired externally. */
export declare function createDefaultHandlersWithoutPm(): Map<Phase, PhaseHandler>;
export declare function createDefaultHandlers(): Map<Phase, PhaseHandler>;
export { PlanPhaseHandler, ActPhaseHandler, VerifyPhaseHandler, CritiquePhaseHandler, RetryPhaseHandler, EscalatePhaseHandler, ObservePhaseHandler, ReflectionPhaseHandler, };
export type { VerifyPhaseHandlerOptions } from './verify-phase.js';
export type { RetryPhaseHandlerOptions } from './retry-phase.js';
export type { PlanPhaseHandlerOptions } from './plan.js';
export type { ActPhaseHandlerOptions } from './act.js';
//# sourceMappingURL=index.d.ts.map