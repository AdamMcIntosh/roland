import { PlanPhaseHandler } from './plan.js';
import { ActPhaseHandler } from './act.js';
import { VerifyPhaseHandler } from './verify-phase.js';
import { CritiquePhaseHandler } from './critique-phase.js';
import { RetryPhaseHandler } from './retry-phase.js';
import { EscalatePhaseHandler } from './escalate-phase.js';
import { ObservePhaseHandler } from './observe.js';
import { ReflectionPhaseHandler } from './reflection-phase.js';
const DEFAULT_HANDLERS = [
    new PlanPhaseHandler(),
    new ActPhaseHandler(),
    new VerifyPhaseHandler(),
    new CritiquePhaseHandler(),
    new RetryPhaseHandler(),
    new EscalatePhaseHandler(),
    new ObservePhaseHandler(),
    new ReflectionPhaseHandler(),
];
/** Handlers without PM bridge — used when pm integration is wired externally. */
export function createDefaultHandlersWithoutPm() {
    return new Map(DEFAULT_HANDLERS.map((h) => [h.phase, h]));
}
export function createDefaultHandlers() {
    return createDefaultHandlersWithoutPm();
}
export { PlanPhaseHandler, ActPhaseHandler, VerifyPhaseHandler, CritiquePhaseHandler, RetryPhaseHandler, EscalatePhaseHandler, ObservePhaseHandler, ReflectionPhaseHandler, };
//# sourceMappingURL=index.js.map