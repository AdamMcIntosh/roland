/**
 * ## Assumptions
 * - Verification commands are project-defined in config.yaml loop_engine.verification.strategies.
 * - Generic fallbacks use common npm test/lint patterns; override per project.
 * - Types not configured (smoke, integration, e2e) use optional generic fallbacks.
 */
/** Default relative weights for confidence scoring. */
export const DEFAULT_STRATEGY_WEIGHTS = {
    unit: 0.9,
    integration: 0.8,
    smoke: 0.6,
    e2e: 0.85,
    lint: 0.65,
    typecheck: 0.7,
};
/** Default success confidence when a strategy passes (optional strategies contribute less). */
export const DEFAULT_SUCCESS_THRESHOLDS = {
    unit: 1,
    integration: 0.9,
    smoke: 0.6,
    e2e: 0.85,
    lint: 0.75,
    typecheck: 0.8,
};
export function getStrategyWeight(type, override) {
    return override ?? DEFAULT_STRATEGY_WEIGHTS[type] ?? 1;
}
export function getStrategySuccessThreshold(type, optional, override) {
    if (override !== undefined)
        return override;
    const base = DEFAULT_SUCCESS_THRESHOLDS[type] ?? 1;
    return optional ? Math.min(base, 0.75) : base;
}
/** Generic defaults when config.yaml omits loop_engine.verification.strategies. */
export const DEFAULT_VERIFICATION_STRATEGIES = [
    {
        type: 'unit',
        command: 'npm test',
        timeoutMs: 180_000,
        weight: DEFAULT_STRATEGY_WEIGHTS.unit,
        successThreshold: DEFAULT_SUCCESS_THRESHOLDS.unit,
    },
    {
        type: 'lint',
        command: 'npm run lint',
        timeoutMs: 120_000,
        optional: true,
        weight: DEFAULT_STRATEGY_WEIGHTS.lint,
        successThreshold: DEFAULT_SUCCESS_THRESHOLDS.lint,
    },
    {
        type: 'typecheck',
        command: 'npm run build',
        timeoutMs: 180_000,
        optional: true,
        weight: DEFAULT_STRATEGY_WEIGHTS.typecheck,
        successThreshold: DEFAULT_SUCCESS_THRESHOLDS.typecheck,
    },
];
export const SMOKE_STRATEGY = {
    type: 'smoke',
    command: 'npm test',
    timeoutMs: 60_000,
    optional: true,
    weight: DEFAULT_STRATEGY_WEIGHTS.smoke,
    successThreshold: DEFAULT_SUCCESS_THRESHOLDS.smoke,
};
export const INTEGRATION_STRATEGY = {
    type: 'integration',
    command: 'npm test',
    timeoutMs: 180_000,
    optional: true,
    weight: DEFAULT_STRATEGY_WEIGHTS.integration,
    successThreshold: DEFAULT_SUCCESS_THRESHOLDS.integration,
};
export const E2E_STRATEGY = {
    type: 'e2e',
    command: 'npm test',
    timeoutMs: 300_000,
    optional: true,
    weight: DEFAULT_STRATEGY_WEIGHTS.e2e,
    successThreshold: DEFAULT_SUCCESS_THRESHOLDS.e2e,
};
const BUILTIN_BY_TYPE = {
    unit: DEFAULT_VERIFICATION_STRATEGIES[0],
    lint: DEFAULT_VERIFICATION_STRATEGIES[1],
    typecheck: DEFAULT_VERIFICATION_STRATEGIES[2],
    smoke: SMOKE_STRATEGY,
    integration: INTEGRATION_STRATEGY,
    e2e: E2E_STRATEGY,
};
export function getBuiltinStrategy(type) {
    return BUILTIN_BY_TYPE[type];
}
export function coerceVerificationStrategies(configured) {
    if (!configured?.length)
        return DEFAULT_VERIFICATION_STRATEGIES;
    return configured.map((s) => {
        const type = s.type;
        const builtin = getBuiltinStrategy(type);
        const optional = s.optional ?? builtin.optional;
        return {
            type,
            command: s.command ?? builtin.command,
            timeoutMs: s.timeoutMs ?? builtin.timeoutMs,
            optional,
            weight: s.weight ?? builtin.weight ?? getStrategyWeight(type),
            successThreshold: getStrategySuccessThreshold(type, optional, s.successThreshold ?? builtin.successThreshold),
            minConfidence: s.minConfidence ?? builtin.minConfidence,
            dryRun: s.dryRun,
        };
    });
}
export function resolveStrategies(configured, templateFilter) {
    const base = configured && configured.length > 0 ? configured : DEFAULT_VERIFICATION_STRATEGIES;
    if (!templateFilter || templateFilter.length === 0)
        return base;
    const byType = new Map(base.map((s) => [s.type, s]));
    const resolved = [];
    for (const type of templateFilter) {
        const hit = byType.get(type) ?? BUILTIN_BY_TYPE[type];
        if (hit)
            resolved.push(hit);
    }
    return resolved.length > 0 ? resolved : base;
}
export function isVerificationStrategyType(value) {
    return value in BUILTIN_BY_TYPE;
}
//# sourceMappingURL=verification-strategies.js.map