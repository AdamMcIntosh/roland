/**
 * ## P1 Honesty & Consolidation
 *
 * YAML-configurable specialist spawns — unit tests.
 *
 * Scoped: npm run test:run -- tests/unit/specialist-spawner.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  evaluateSpawnConditions,
  interpolateSpawnPrompt,
  resolvePhaseSpawns,
  PHASE_SPECIALIST_DEFAULTS,
  PhaseIntentPoster,
} from '../../src/loop-engine/phase-intent-poster.js';
import { Phase } from '../../src/loop-engine/loop-phases.js';
import type { PhaseConfig } from '../../src/loop-engine/loop-phases.js';
import { LoopTemplates, summarizeTemplateSpawns } from '../../src/loop-engine/loop-templates.js';
import { Blackboard } from '../../src/coordination/legacy-blackboard.js';

describe('PhaseIntentPoster YAML resolution', () => {
  const baseCtx = { iteration: 2, retryCount: 1, goal: 'Ship OAuth flow' };

  it('evaluateSpawnConditions respects iteration and retry gates', () => {
    expect(evaluateSpawnConditions({ firstIterationOnly: true }, baseCtx)).toBe(false);
    expect(evaluateSpawnConditions({ afterFirstIteration: true }, baseCtx)).toBe(true);
    expect(evaluateSpawnConditions({ iterationMin: 3 }, baseCtx)).toBe(false);
    expect(evaluateSpawnConditions({ retryMin: 1 }, baseCtx)).toBe(true);
    expect(evaluateSpawnConditions({ retryMin: 2 }, baseCtx)).toBe(false);
  });

  it('interpolateSpawnPrompt substitutes tokens', () => {
    const msg = interpolateSpawnPrompt(
      'Research {goal} during {phase} iter {iteration} retry {retry}',
      Phase.Act,
      baseCtx,
    );
    expect(msg).toContain('Ship OAuth flow');
    expect(msg).toContain('act');
    expect(msg).toContain('2');
    expect(msg).toContain('1');
  });

  it('falls back to PHASE_SPECIALIST_DEFAULTS when YAML omits specialist_spawns', () => {
    const phaseConfig: PhaseConfig = { phase: Phase.Verify, agent: 'verifier' };
    const resolved = resolvePhaseSpawns(Phase.Verify, phaseConfig, baseCtx);
    expect(resolved.some((r) => r.primary && r.role === 'verifier')).toBe(true);
    expect(resolved.some((r) => r.role === 'test-executor')).toBe(true);
    expect(resolved.every((r) => !r.fromTemplate)).toBe(true);
  });

  it('applies YAML specialist_spawns with primary and supporting roles', () => {
    const phaseConfig: PhaseConfig = {
      phase: Phase.Act,
      agent: 'coding',
      specialistSpawns: [
        { role: 'coding', primary: true },
        { role: 'test-author', promptTemplate: 'Tests for {goal}' },
      ],
    };
    const resolved = resolvePhaseSpawns(Phase.Act, phaseConfig, baseCtx);
    expect(resolved.filter((r) => r.fromTemplate).length).toBe(2);
    expect(resolved.find((r) => r.primary)?.role).toBe('coding');
    expect(resolved.some((r) => r.role === 'test-author')).toBe(true);
  });

  it('skips spawns when conditions fail and falls back to defaults', () => {
    const phaseConfig: PhaseConfig = {
      phase: Phase.Plan,
      specialistSpawns: [
        {
          role: 'architect',
          conditions: { firstIterationOnly: true },
        },
      ],
    };
    const resolved = resolvePhaseSpawns(Phase.Plan, phaseConfig, baseCtx);
    expect(resolved.some((r) => r.role === 'architect')).toBe(false);
    expect(resolved.some((r) => r.role === PHASE_SPECIALIST_DEFAULTS[Phase.Plan][0])).toBe(true);
  });
});

describe('Loop template YAML spawns', () => {
  const templates = new LoopTemplates();

  it('feature-implementation-loop defines act-phase test-author spawn', () => {
    const tpl = templates.get('feature-implementation-loop')!;
    const act = tpl.phases.find((p) => p.phase === 'act');
    expect(act?.specialistSpawns?.some((s) => s.role === 'test-author')).toBe(true);
    const summary = summarizeTemplateSpawns(tpl);
    expect(summary).toContain('act:');
    expect(summary).toContain('test-author');
  });

  it('research-and-plan-loop (via alias) defines researcher and oracle spawns', () => {
    const tpl = templates.get('research-and-spec-loop')!;
    const act = tpl.phases.find((p) => p.phase === 'act');
    expect(act?.specialistSpawns?.map((s) => s.role)).toEqual(
      expect.arrayContaining(['researcher', 'oracle']),
    );
  });

  it('listDetailed exposes spawn metadata for dashboard', () => {
    const feature = templates.listDetailed().find((t) => t.name === 'feature-implementation-loop');
    expect(feature?.hasCustomSpawns).toBe(true);
    expect(feature?.spawnSummary).toContain('test-author');
    expect(feature?.executionModes.usePmTeam).toBe(false);
  });

  it('emits onSpawnPulse with intent posted to blackboard label', () => {
    const pulses: Array<{ role: string; phase: string; label: string }> = [];
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-spawn-'));
    const poster = new PhaseIntentPoster({
      blackboard: new Blackboard(stateDir),
      goal: 'Test spawn pulse',
      onSpawnPulse: (pulse) => {
        pulses.push({ role: pulse.role, phase: pulse.phase, label: pulse.label });
      },
    });
    poster.spawnOnDemand('verification_failed', 1, 'unit tests failed');
    expect(pulses.length).toBe(1);
    expect(pulses[0]?.label).toContain('intent posted to blackboard');
    expect(pulses[0]?.label).toContain('test-author');
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
});
