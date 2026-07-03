/**
 * Loop Phase Model — canonical phases for Loop Engineering missions.
 *
 * Standard loop: Plan → Act → Verify → Critique → Retry → Escalate → Observe
 */
export const Phase = {
    Plan: 'plan',
    Act: 'act',
    Verify: 'verify',
    Critique: 'critique',
    Retry: 'retry',
    Escalate: 'escalate',
    Observe: 'observe',
    Reflect: 'reflect',
};
export const ALL_PHASES = [
    Phase.Plan,
    Phase.Act,
    Phase.Verify,
    Phase.Critique,
    Phase.Retry,
    Phase.Escalate,
    Phase.Observe,
    Phase.Reflect,
];
export function isPhase(value) {
    return ALL_PHASES.includes(value);
}
export function phaseLabel(config) {
    return config.label ?? config.phase;
}
//# sourceMappingURL=loop-phases.js.map