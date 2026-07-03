/**
 * ## Assumptions
 * - Specialist agents are spawned by posting spawn intents to the blackboard for the Lead PM / team orchestrator.
 * - Phase config `agent` field overrides defaults when present (unless YAML specialist_spawns defines primary).
 * - YAML `specialist_spawns` on a phase replaces PHASE_SPECIALIST_DEFAULTS when non-empty.
 * - Multiple specialists may be spawned per phase (primary + supporting or multiple YAML entries).
 */
import { Phase as P } from './loop-phases.js';
import { ModelRouter } from '../models/model-router.js';
/** Default specialist roster per loop phase (used when YAML omits specialist_spawns). */
export const PHASE_SPECIALIST_DEFAULTS = {
    [P.Plan]: ['lead-pm', 'planner'],
    [P.Act]: ['executor', 'sparrow'],
    [P.Verify]: ['test-executor', 'test-author'],
    [P.Critique]: ['critic', 'sentinel', 'code-reviewer'],
    [P.Retry]: ['executor', 'build-fixer'],
    [P.Escalate]: ['lead-pm'],
    [P.Observe]: ['researcher', 'writer'],
    [P.Reflect]: ['researcher', 'writer'],
};
/** On-demand specialists spawned when gates fail or critique requests deep review. */
export const ON_DEMAND_SPECIALISTS = {
    verification_failed: 'test-author',
    security_concern: 'security-reviewer',
    architecture_review: 'architect',
    research_needed: 'researcher',
    ui_review: 'designer',
};
function logSpawn(msg, detail) {
    const line = `[Loop][spawner] ${msg}`;
    if (detail && Object.keys(detail).length > 0) {
        console.error(line, detail);
    }
    else {
        console.error(line);
    }
}
/** Evaluate YAML spawn conditions against the current loop context. */
export function evaluateSpawnConditions(conditions, ctx) {
    if (!conditions)
        return true;
    if (conditions.firstIterationOnly && ctx.iteration !== 1)
        return false;
    if (conditions.afterFirstIteration && ctx.iteration <= 1)
        return false;
    if (conditions.iterationMin !== undefined && ctx.iteration < conditions.iterationMin)
        return false;
    if (conditions.iterationMax !== undefined && ctx.iteration > conditions.iterationMax)
        return false;
    if (conditions.retryMin !== undefined && ctx.retryCount < conditions.retryMin)
        return false;
    return true;
}
/** Interpolate {goal}, {iteration}, {phase}, {retry} in prompt templates. */
export function interpolateSpawnPrompt(template, phase, ctx) {
    if (!template) {
        return `Closed-loop ${phase} phase (iteration ${ctx.iteration})`;
    }
    return template
        .replace(/\{goal\}/g, ctx.goal)
        .replace(/\{iteration\}/g, String(ctx.iteration))
        .replace(/\{phase\}/g, phase)
        .replace(/\{retry\}/g, String(ctx.retryCount));
}
/** Resolve spawn roster for a phase from YAML config or built-in defaults. */
export function resolvePhaseSpawns(phase, phaseConfig, ctx) {
    const yamlSpawns = phaseConfig?.specialistSpawns;
    if (yamlSpawns?.length) {
        return resolveYamlSpawns(phase, phaseConfig, yamlSpawns, ctx);
    }
    return resolveDefaultSpawns(phase, phaseConfig, ctx);
}
function resolveDefaultSpawns(phase, phaseConfig, ctx) {
    const defaults = PHASE_SPECIALIST_DEFAULTS[phase] ?? ['executor'];
    const primary = phaseConfig?.agent ?? defaults[0];
    const supporting = defaults.filter((a) => a !== primary);
    const reason = interpolateSpawnPrompt(undefined, phase, ctx);
    return [
        { role: primary, primary: true, reason, fromTemplate: false },
        ...supporting.map((role) => ({ role, primary: false, reason, fromTemplate: false })),
    ];
}
function resolveYamlSpawns(phase, phaseConfig, yamlSpawns, ctx) {
    const resolved = [];
    let explicitPrimary;
    for (const def of yamlSpawns) {
        if (!evaluateSpawnConditions(def.conditions, ctx))
            continue;
        const count = def.count ?? 1;
        for (let i = 0; i < count; i++) {
            if (def.primary)
                explicitPrimary = def.role;
            resolved.push({
                role: def.role,
                primary: def.primary === true,
                reason: interpolateSpawnPrompt(def.promptTemplate, phase, ctx),
                fromTemplate: true,
            });
        }
    }
    if (resolved.length === 0) {
        return resolveDefaultSpawns(phase, phaseConfig, ctx);
    }
    if (explicitPrimary) {
        let foundPrimary = false;
        for (const spawn of resolved) {
            spawn.primary = spawn.role === explicitPrimary && !foundPrimary;
            if (spawn.primary)
                foundPrimary = true;
        }
    }
    else if (phaseConfig?.agent) {
        const agent = phaseConfig.agent;
        const match = resolved.find((s) => s.role === agent);
        if (match) {
            for (const spawn of resolved)
                spawn.primary = false;
            match.primary = true;
        }
        else {
            resolved.unshift({
                role: agent,
                primary: true,
                reason: interpolateSpawnPrompt(undefined, phase, ctx),
                fromTemplate: true,
            });
        }
    }
    else if (!resolved.some((s) => s.primary)) {
        resolved[0].primary = true;
    }
    return resolved;
}
/** Collapse resolved spawns into primary + supporting for blackboard posts. */
export function collapseToSpawnRequest(phase, resolved, iteration) {
    const primaryEntry = resolved.find((s) => s.primary) ?? resolved[0];
    const supporting = resolved
        .filter((s) => s !== primaryEntry && s.role !== primaryEntry.role)
        .map((s) => s.role);
    const extraSameRole = resolved.filter((s) => s !== primaryEntry && s.role === primaryEntry.role).length;
    const supportingAgents = [
        ...supporting,
        ...Array(extraSameRole).fill(primaryEntry.role),
    ];
    return {
        phase,
        primaryAgent: primaryEntry.role,
        supportingAgents,
        reason: primaryEntry.reason,
        iteration,
        spawnedAt: Date.now(),
        fromTemplate: resolved.some((s) => s.fromTemplate),
    };
}
/**
 * SpecialistSpawner — posts dynamic agent spawn intents for loop phases.
 */
export class SpecialistSpawner {
    opts;
    history = [];
    router;
    constructor(opts) {
        this.opts = opts;
        this.router = opts.modelRouter ?? ModelRouter.fromConfig();
    }
    /** Spawn specialists for a loop phase based on template config and defaults. */
    spawnForPhase(phase, iteration, phaseConfig, ctx) {
        const spawnCtx = {
            iteration,
            retryCount: ctx?.retryCount ?? 0,
            goal: ctx?.goal ?? this.opts.goal,
        };
        const resolved = resolvePhaseSpawns(phase, phaseConfig, spawnCtx);
        const fromTemplate = resolved.some((s) => s.fromTemplate);
        const requests = [];
        if (fromTemplate && resolved.length > 1) {
            for (const entry of resolved) {
                const request = {
                    phase,
                    primaryAgent: entry.role,
                    supportingAgents: [],
                    reason: entry.reason,
                    iteration,
                    spawnedAt: Date.now(),
                    fromTemplate: true,
                };
                this.recordSpawn(request);
                requests.push(request);
            }
            logSpawn('multi-spawn phase complete', {
                phase,
                iteration,
                agents: requests.map((r) => r.primaryAgent).join(', '),
                fromTemplate: true,
            });
        }
        else {
            const request = collapseToSpawnRequest(phase, resolved, iteration);
            request.fromTemplate = fromTemplate;
            this.recordSpawn(request);
            requests.push(request);
        }
        return requests;
    }
    /** Spawn an on-demand specialist when evaluation or critique triggers it. */
    spawnOnDemand(trigger, iteration, detail) {
        const agent = ON_DEMAND_SPECIALISTS[trigger];
        if (!agent) {
            logSpawn('unknown on-demand trigger — skipped', { trigger });
            return null;
        }
        const request = {
            phase: P.Act,
            primaryAgent: agent,
            supportingAgents: [],
            reason: detail ?? `On-demand spawn: ${trigger}`,
            iteration,
            spawnedAt: Date.now(),
        };
        this.recordSpawn(request);
        return request;
    }
    getHistory() {
        return [...this.history];
    }
    recordSpawn(request) {
        this.history.push(request);
        const agents = [request.primaryAgent, ...request.supportingAgents].join(', ');
        const phaseRole = ModelRouter.roleForPhase(request.phase);
        const phaseDispatch = this.router.resolveDispatch(phaseRole, {
            phase: request.phase,
            agentName: request.primaryAgent,
        });
        const agentDispatch = this.router.resolveDispatch(request.primaryAgent, {
            phase: request.phase,
            log: false,
        });
        logSpawn('spawn intent recorded', {
            phase: request.phase,
            agents,
            iteration: request.iteration,
            role: phaseRole,
            dispatch: phaseDispatch.method,
            model: phaseDispatch.displayLabel,
            agentDispatch: agentDispatch.method,
            agentModel: agentDispatch.displayLabel,
            fromTemplate: request.fromTemplate ?? false,
        });
        this.opts.blackboard.post({
            type: 'task',
            title: `Spawn: ${request.primaryAgent} (${request.phase})`,
            content: [
                `Phase: ${request.phase}`,
                `Primary: ${request.primaryAgent}`,
                request.supportingAgents.length > 0
                    ? `Supporting: ${request.supportingAgents.join(', ')}`
                    : '',
                `Reason: ${request.reason}`,
                `Model routing: ${phaseDispatch.displayLabel} (${phaseDispatch.method}) · ${agentDispatch.displayLabel} (agent)`,
                request.fromTemplate ? 'Source: template specialist_spawns' : '',
                `Goal: ${this.opts.goal}`,
            ]
                .filter(Boolean)
                .join('\n'),
            status: 'pending',
            author: 'loop-engine',
            priority: 'high',
            tags: ['loop', 'spawn', request.phase, request.primaryAgent],
            relatedIds: [],
        });
        this.opts.commandBoard?.appendBullet('Agent Status', `[SPAWN] ${request.primaryAgent} → ${request.phase} (iter ${request.iteration})`);
        const supportingCount = request.supportingAgents.length;
        const totalCount = 1 + supportingCount;
        this.opts.onSpawnPulse?.({
            role: request.primaryAgent,
            phase: request.phase,
            count: totalCount,
            label: supportingCount > 0
                ? `${request.primaryAgent} + ${supportingCount} supporting`
                : `spawn dispatched: ${request.primaryAgent}`,
            at: request.spawnedAt,
        });
    }
}
/**
 * ## YAML Specialist Spawns + Dashboard Templates Exposure Complete
 *
 * SpecialistSpawner reads phases.<phase>.specialist_spawns from loaded loop templates.
 * Templates without the section keep PHASE_SPECIALIST_DEFAULTS behavior.
 */
//# sourceMappingURL=specialist-spawner.js.map