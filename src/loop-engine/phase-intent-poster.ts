/**

 * ## P1 Honesty & Consolidation

 *

 * ## Assumptions

 * - Specialist agents are spawned by posting spawn intents to the blackboard for the Lead PM / team orchestrator.

 * - Phase config `agent` field overrides defaults when present (unless YAML specialist_spawns defines primary).

 * - YAML `specialist_spawns` on a phase replaces PHASE_SPECIALIST_DEFAULTS when non-empty.

 * - Multiple specialists may be spawned per phase (primary + supporting or multiple YAML entries).

 */



import type { Blackboard } from '../coordination/legacy-blackboard.js';

import type { CommandBlackboard } from '../rco/command-blackboard.js';

import type { Phase, PhaseConfig, SpawnConditions, SpecialistSpawnDefinition } from './loop-phases.js';

import { Phase as P } from './loop-phases.js';

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

export const PHASE_SPECIALIST_DEFAULTS: Record<Phase, string[]> = {

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

export const ON_DEMAND_SPECIALISTS: Record<string, string> = {

  verification_failed: 'test-author',

  security_concern: 'security-reviewer',

  architecture_review: 'architect',

  research_needed: 'researcher',

  ui_review: 'designer',

};



export interface PhaseIntentPosterOptions {

  blackboard: Blackboard;

  commandBoard?: CommandBlackboard;

  goal: string;

  modelRouter?: ModelRouter;

  /** Emit liveActivity spawn pulses to loop state / dashboard. */

  onSpawnPulse?: (pulse: LoopSpawnPulse) => void;

}



function logIntentPost(msg: string, detail?: Record<string, unknown>): void {

  const line = `[Loop][intent-poster] ${msg}`;

  if (detail && Object.keys(detail).length > 0) {

    console.error(line, detail);

  } else {

    console.error(line);

  }

}



/** Evaluate YAML spawn conditions against the current loop context. */

export function evaluateSpawnConditions(

  conditions: SpawnConditions | undefined,

  ctx: SpawnContext,

): boolean {

  if (!conditions) return true;

  if (conditions.firstIterationOnly && ctx.iteration !== 1) return false;

  if (conditions.afterFirstIteration && ctx.iteration <= 1) return false;

  if (conditions.iterationMin !== undefined && ctx.iteration < conditions.iterationMin) return false;

  if (conditions.iterationMax !== undefined && ctx.iteration > conditions.iterationMax) return false;

  if (conditions.retryMin !== undefined && ctx.retryCount < conditions.retryMin) return false;

  return true;

}



/** Interpolate {goal}, {iteration}, {phase}, {retry} in prompt templates. */

export function interpolateSpawnPrompt(

  template: string | undefined,

  phase: Phase,

  ctx: SpawnContext,

): string {

  if (!template) {

    return `Closed-loop ${phase} phase (iteration ${ctx.iteration})`;

  }

  return template

    .replace(/\{goal\}/g, ctx.goal)

    .replace(/\{iteration\}/g, String(ctx.iteration))

    .replace(/\{phase\}/g, phase)

    .replace(/\{retry\}/g, String(ctx.retryCount));

}



interface ResolvedSpawn {

  role: string;

  primary: boolean;

  reason: string;

  fromTemplate: boolean;

}



/** Resolve spawn roster for a phase from YAML config or built-in defaults. */

export function resolvePhaseSpawns(

  phase: Phase,

  phaseConfig: PhaseConfig | undefined,

  ctx: SpawnContext,

): ResolvedSpawn[] {

  const yamlSpawns = phaseConfig?.specialistSpawns;

  if (yamlSpawns?.length) {

    return resolveYamlSpawns(phase, phaseConfig, yamlSpawns, ctx);

  }

  return resolveDefaultSpawns(phase, phaseConfig, ctx);

}



function resolveDefaultSpawns(

  phase: Phase,

  phaseConfig: PhaseConfig | undefined,

  ctx: SpawnContext,

): ResolvedSpawn[] {

  const defaults = PHASE_SPECIALIST_DEFAULTS[phase] ?? ['executor'];

  const primary = phaseConfig?.agent ?? defaults[0]!;

  const supporting = defaults.filter((a) => a !== primary);

  const reason = interpolateSpawnPrompt(undefined, phase, ctx);

  return [

    { role: primary, primary: true, reason, fromTemplate: false },

    ...supporting.map((role) => ({ role, primary: false, reason, fromTemplate: false })),

  ];

}



function resolveYamlSpawns(

  phase: Phase,

  phaseConfig: PhaseConfig | undefined,

  yamlSpawns: SpecialistSpawnDefinition[],

  ctx: SpawnContext,

): ResolvedSpawn[] {

  const resolved: ResolvedSpawn[] = [];

  let explicitPrimary: string | undefined;



  for (const def of yamlSpawns) {

    if (!evaluateSpawnConditions(def.conditions, ctx)) continue;

    const count = def.count ?? 1;

    for (let i = 0; i < count; i++) {

      if (def.primary) explicitPrimary = def.role;

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

      if (spawn.primary) foundPrimary = true;

    }

  } else if (phaseConfig?.agent) {

    const agent = phaseConfig.agent;

    const match = resolved.find((s) => s.role === agent);

    if (match) {

      for (const spawn of resolved) spawn.primary = false;

      match.primary = true;

    } else {

      resolved.unshift({

        role: agent,

        primary: true,

        reason: interpolateSpawnPrompt(undefined, phase, ctx),

        fromTemplate: true,

      });

    }

  } else if (!resolved.some((s) => s.primary)) {

    resolved[0]!.primary = true;

  }



  return resolved;

}



/** Collapse resolved spawns into primary + supporting for blackboard posts. */

export function collapseToSpawnRequest(

  phase: Phase,

  resolved: ResolvedSpawn[],

  iteration: number,

): SpawnRequest {

  const primaryEntry = resolved.find((s) => s.primary) ?? resolved[0]!;

  const supporting = resolved

    .filter((s) => s !== primaryEntry && s.role !== primaryEntry.role)

    .map((s) => s.role);

  const extraSameRole = resolved.filter(

    (s) => s !== primaryEntry && s.role === primaryEntry.role,

  ).length;

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

 * PhaseIntentPoster — posts dynamic agent spawn intents for loop phases.

 */

export class PhaseIntentPoster {

  private readonly opts: PhaseIntentPosterOptions;

  private readonly history: SpawnRequest[] = [];

  private readonly router: ModelRouter;



  constructor(opts: PhaseIntentPosterOptions) {

    this.opts = opts;

    this.router = opts.modelRouter ?? ModelRouter.fromConfig();

  }



  /** Post specialist intents for a loop phase based on template config and defaults. */

  spawnForPhase(

    phase: Phase,

    iteration: number,

    phaseConfig?: PhaseConfig,

    ctx?: Partial<SpawnContext>,

  ): SpawnRequest[] {

    const spawnCtx: SpawnContext = {

      iteration,

      retryCount: ctx?.retryCount ?? 0,

      goal: ctx?.goal ?? this.opts.goal,

    };

    const resolved = resolvePhaseSpawns(phase, phaseConfig, spawnCtx);

    const fromTemplate = resolved.some((s) => s.fromTemplate);

    const requests: SpawnRequest[] = [];



    if (fromTemplate && resolved.length > 1) {

      for (const entry of resolved) {

        const request: SpawnRequest = {

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

      logIntentPost('multi-spawn phase complete', {

        phase,

        iteration,

        agents: requests.map((r) => r.primaryAgent).join(', '),

        fromTemplate: true,

      });

    } else {

      const request = collapseToSpawnRequest(phase, resolved, iteration);

      request.fromTemplate = fromTemplate;

      this.recordSpawn(request);

      requests.push(request);

    }



    return requests;

  }



  /** Post an on-demand specialist intent when evaluation or critique triggers it. */

  spawnOnDemand(

    trigger: keyof typeof ON_DEMAND_SPECIALISTS | string,

    iteration: number,

    detail?: string,

  ): SpawnRequest | null {

    const agent = ON_DEMAND_SPECIALISTS[trigger];

    if (!agent) {

      logIntentPost('unknown on-demand trigger — skipped', { trigger });

      return null;

    }



    const request: SpawnRequest = {

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



  getHistory(): readonly SpawnRequest[] {

    return [...this.history];

  }



  private recordSpawn(request: SpawnRequest): void {

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



    logIntentPost('intent posted to blackboard', {

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



    this.opts.commandBoard?.appendBullet(

      'Agent Status',

      `[SPAWN] ${request.primaryAgent} → ${request.phase} (iter ${request.iteration})`,

    );



    const supportingCount = request.supportingAgents.length;

    const totalCount = 1 + supportingCount;

    this.opts.onSpawnPulse?.({

      role: request.primaryAgent,

      phase: request.phase,

      count: totalCount,

      label:

        supportingCount > 0

          ? `${request.primaryAgent} + ${supportingCount} supporting`

          : `intent posted to blackboard: ${request.primaryAgent}`,

      at: request.spawnedAt,

    });

  }

}



/**

 * PhaseIntentPoster reads phases.<phase>.specialist_spawns from loaded loop templates.

 * Templates without the section keep PHASE_SPECIALIST_DEFAULTS behavior.

 */


