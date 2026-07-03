/**
 * ## Assumptions
 * - Specialist agents are spawned by posting spawn intents to the blackboard for the Lead PM / team orchestrator.
 * - Phase config `agent` field overrides defaults when present (unless YAML specialist_spawns defines primary).
 * - YAML `specialist_spawns` on a phase replaces PHASE_SPECIALIST_DEFAULTS when non-empty.
 * - Multiple specialists may be spawned per phase (primary + supporting or multiple YAML entries).
 */
import type { Blackboard } from '../rco/blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { Phase, PhaseConfig, SpawnConditions } from './loop-phases.js';
import { ModelRouter } from '../models/model-router.js';
import type { LoopSpawnPulse } from './loop-state.js';
export interface SpawnRequest {
    phase: Phase;
    primaryAgent: string;
    supportingAgents: string[];
    reason: string;
    iteration: number;
    spawnedAt: number;
    /** True when spawn came from template YAML rather than built-in defaults. */
    fromTemplate?: boolean;
}
/** Context for evaluating spawn conditions and prompt templates. */
export interface SpawnContext {
    iteration: number;
    retryCount: number;
    goal: string;
}
/** Default specialist roster per loop phase (used when YAML omits specialist_spawns). */
export declare const PHASE_SPECIALIST_DEFAULTS: Record<Phase, string[]>;
/** On-demand specialists spawned when gates fail or critique requests deep review. */
export declare const ON_DEMAND_SPECIALISTS: Record<string, string>;
export interface SpecialistSpawnerOptions {
    blackboard: Blackboard;
    commandBoard?: CommandBlackboard;
    goal: string;
    modelRouter?: ModelRouter;
    /** Emit liveActivity spawn pulses to loop state / dashboard. */
    onSpawnPulse?: (pulse: LoopSpawnPulse) => void;
}
/** Evaluate YAML spawn conditions against the current loop context. */
export declare function evaluateSpawnConditions(conditions: SpawnConditions | undefined, ctx: SpawnContext): boolean;
/** Interpolate {goal}, {iteration}, {phase}, {retry} in prompt templates. */
export declare function interpolateSpawnPrompt(template: string | undefined, phase: Phase, ctx: SpawnContext): string;
interface ResolvedSpawn {
    role: string;
    primary: boolean;
    reason: string;
    fromTemplate: boolean;
}
/** Resolve spawn roster for a phase from YAML config or built-in defaults. */
export declare function resolvePhaseSpawns(phase: Phase, phaseConfig: PhaseConfig | undefined, ctx: SpawnContext): ResolvedSpawn[];
/** Collapse resolved spawns into primary + supporting for blackboard posts. */
export declare function collapseToSpawnRequest(phase: Phase, resolved: ResolvedSpawn[], iteration: number): SpawnRequest;
/**
 * SpecialistSpawner — posts dynamic agent spawn intents for loop phases.
 */
export declare class SpecialistSpawner {
    private readonly opts;
    private readonly history;
    private readonly router;
    constructor(opts: SpecialistSpawnerOptions);
    /** Spawn specialists for a loop phase based on template config and defaults. */
    spawnForPhase(phase: Phase, iteration: number, phaseConfig?: PhaseConfig, ctx?: Partial<SpawnContext>): SpawnRequest[];
    /** Spawn an on-demand specialist when evaluation or critique triggers it. */
    spawnOnDemand(trigger: keyof typeof ON_DEMAND_SPECIALISTS | string, iteration: number, detail?: string): SpawnRequest | null;
    getHistory(): readonly SpawnRequest[];
    private recordSpawn;
}
export {};
/**
 * ## YAML Specialist Spawns + Dashboard Templates Exposure Complete
 *
 * SpecialistSpawner reads phases.<phase>.specialist_spawns from loaded loop templates.
 * Templates without the section keep PHASE_SPECIALIST_DEFAULTS behavior.
 */
//# sourceMappingURL=specialist-spawner.d.ts.map