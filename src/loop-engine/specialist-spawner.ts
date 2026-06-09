/**
 * ## Assumptions
 * - Specialist agents are spawned by posting spawn intents to the blackboard for the Lead PM / team orchestrator.
 * - Phase config `agent` field overrides defaults when present.
 * - Multiple specialists may be spawned per phase (primary + optional reviewers).
 */

import type { Blackboard } from '../rco/blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import type { Phase, PhaseConfig } from './loop-phases.js';
import { Phase as P } from './loop-phases.js';

export interface SpawnRequest {
  phase: Phase;
  primaryAgent: string;
  supportingAgents: string[];
  reason: string;
  iteration: number;
  spawnedAt: number;
}

/** Default specialist roster per loop phase. */
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

export interface SpecialistSpawnerOptions {
  blackboard: Blackboard;
  commandBoard?: CommandBlackboard;
  goal: string;
}

function logSpawn(msg: string, detail?: Record<string, unknown>): void {
  const line = `[Loop][spawner] ${msg}`;
  if (detail && Object.keys(detail).length > 0) {
    console.error(line, detail);
  } else {
    console.error(line);
  }
}

/**
 * SpecialistSpawner — posts dynamic agent spawn intents for loop phases.
 */
export class SpecialistSpawner {
  private readonly opts: SpecialistSpawnerOptions;
  private readonly history: SpawnRequest[] = [];

  constructor(opts: SpecialistSpawnerOptions) {
    this.opts = opts;
  }

  /** Spawn specialists for a loop phase based on template config and defaults. */
  spawnForPhase(
    phase: Phase,
    iteration: number,
    phaseConfig?: PhaseConfig,
  ): SpawnRequest {
    const defaults = PHASE_SPECIALIST_DEFAULTS[phase] ?? ['executor'];
    const primary = phaseConfig?.agent ?? defaults[0]!;
    const supporting = defaults.filter((a) => a !== primary);

    const request: SpawnRequest = {
      phase,
      primaryAgent: primary,
      supportingAgents: supporting,
      reason: `Closed-loop ${phase} phase (iteration ${iteration})`,
      iteration,
      spawnedAt: Date.now(),
    };

    this.recordSpawn(request);
    return request;
  }

  /** Spawn an on-demand specialist when evaluation or critique triggers it. */
  spawnOnDemand(
    trigger: keyof typeof ON_DEMAND_SPECIALISTS | string,
    iteration: number,
    detail?: string,
  ): SpawnRequest | null {
    const agent = ON_DEMAND_SPECIALISTS[trigger];
    if (!agent) {
      logSpawn('unknown on-demand trigger — skipped', { trigger });
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

    logSpawn('spawn intent recorded', {
      phase: request.phase,
      agents,
      iteration: request.iteration,
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
  }
}

/**
 * ## Component Complete
 * SpecialistSpawner records spawn intents on the blackboard and command board so the
 * team orchestrator can dispatch Critic, Researcher, Verifier, Test-Author, and other specialists on demand.
 */
