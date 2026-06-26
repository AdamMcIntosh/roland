/**
 * Template verification + between-iterations hook resolution tests.
 *
 * Scoped: npm run test:run -- tests/unit/loop-template-resolution.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveVerificationStrategies,
  resolveBetweenIterationsHook,
  resolveBetweenIterationsCommand,
  summarizeVerificationConfig,
  summarizeBetweenIterationsConfig,
  normalizeBetweenIterationsHook,
  resolveMinConfidence,
} from '../../src/loop-engine/loop-template-resolution.js';
import type { LoopTemplate } from '../../src/loop-engine/loop-phases.js';
import { Phase } from '../../src/loop-engine/loop-phases.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';
import { runBetweenIterations } from '../../src/loop-engine/between-iterations.js';
import { LoopMemory } from '../../src/loop-engine/loop-memory.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('loop-template-resolution', () => {
  beforeEach(() => {
    clearLoopEngineConfigCache();
  });

  afterEach(() => {
    clearLoopEngineConfigCache();
  });

  it('resolves shorthand verification type filter from config', () => {
    const template: LoopTemplate = {
      name: 'test',
      description: '',
      phases: [{
        phase: Phase.Verify,
        verification: ['unit', 'lint'],
      }],
    };
    const strategies = resolveVerificationStrategies(template, template.phases[0]);
    expect(strategies.map((s) => s.type)).toEqual(['unit', 'lint']);
  });

  it('merges full verification objects with config defaults by type', () => {
    const template: LoopTemplate = {
      name: 'test',
      description: '',
      phases: [{
        phase: Phase.Verify,
        verification: [
          { type: 'unit', weight: 0.95, successThreshold: 1 },
          { type: 'smoke', optional: true, dryRun: true, weight: 0.6 },
        ],
      }],
    };
    const strategies = resolveVerificationStrategies(template, template.phases[0]);
    expect(strategies).toHaveLength(2);
    expect(strategies[0]!.type).toBe('unit');
    expect(strategies[0]!.weight).toBe(0.95);
    expect(strategies[0]!.command.length).toBeGreaterThan(0);
    expect(strategies[1]!.optional).toBe(true);
    expect(strategies[1]!.dryRun).toBe(true);
    expect(strategies[1]!.weight).toBe(0.6);
  });

  it('resolves git-commit hook with dry_run default true', () => {
    const template: LoopTemplate = {
      name: 'test',
      description: '',
      phases: [],
      betweenIterations: {
        action: 'git-commit',
        messageTemplate: 'loop({iteration}): {goal}',
      },
    };
    const hook = resolveBetweenIterationsHook(template);
    expect(hook?.action).toBe('git-commit');
    expect(hook?.dryRun).toBe(true);
    expect(hook?.gitCommit?.messageTemplate).toContain('{iteration}');
  });

  it('resolveMinConfidence prefers template over config default', () => {
    const template: LoopTemplate = {
      name: 't',
      description: '',
      phases: [],
      minConfidence: 0.9,
    };
    expect(resolveMinConfidence(template)).toBe(0.9);
  });

  it('resolves between_iterations hook priority template over config', () => {
    process.env.ROLAND_LOOP_TEST_MODE = '1';
    const template: LoopTemplate = {
      name: 'test',
      description: '',
      phases: [],
      betweenIterations: { action: 'run-tests', optional: true },
    };
    const hook = resolveBetweenIterationsHook(template);
    expect(hook?.label).toBe('run-tests');
    expect(hook?.optional).toBe(true);
    delete process.env.ROLAND_LOOP_TEST_MODE;
  });

  it('resolves phase.after hook over template between_iterations', () => {
    const template: LoopTemplate = {
      name: 'test',
      description: '',
      phases: [{
        phase: Phase.Observe,
        after: { action: 'critique-only' },
      }],
      betweenIterations: { action: 'run-tests' },
    };
    const phaseHook = resolveBetweenIterationsHook(template, { phaseConfig: template.phases[0] });
    expect(phaseHook?.noOp).toBe(true);
    expect(phaseHook?.label).toBe('critique-only');

    const templateHook = resolveBetweenIterationsHook(template);
    expect(templateHook?.label).toBe('run-tests');
  });

  it('normalizeBetweenIterationsHook accepts legacy strings', () => {
    expect(normalizeBetweenIterationsHook('npm test')).toEqual({ command: 'npm test' });
  });

  it('resolveBetweenIterationsCommand returns command for legacy callers', () => {
    const template: LoopTemplate = {
      name: 't',
      description: '',
      phases: [],
      betweenIterations: 'npm run test:run',
    };
    expect(resolveBetweenIterationsCommand(template)).toBe('npm run test:run');
  });

  it('summarize helpers produce dashboard-friendly strings', () => {
    const template: LoopTemplate = {
      name: 'feature',
      description: '',
      phases: [{
        phase: Phase.Verify,
        verification: [{ type: 'unit' }, { type: 'smoke', optional: true }],
      }],
      betweenIterations: { action: 'run-tests', optional: true },
    };
    expect(summarizeVerificationConfig(template)).toContain('unit');
    expect(summarizeBetweenIterationsConfig(template)).toContain('run-tests');
  });

  it('runBetweenIterations dry-run does not invoke runner', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-hook-'));
    const memory = new LoopMemory({ stateDir, goal: 'test', templateId: 't' });
    let ran = false;
    const result = await runBetweenIterations({
      hook: {
        command: 'npm test',
        label: 'dry',
        timeoutMs: 1000,
        optional: false,
        dryRun: true,
        exitOnFailure: false,
        noOp: false,
        source: 'template',
      },
      iteration: 1,
      memory,
      runner: async () => {
        ran = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(result.success).toBe(true);
    expect(ran).toBe(false);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('runBetweenIterations exit_on_failure marks fatal', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-hook-'));
    const memory = new LoopMemory({ stateDir, goal: 'test', templateId: 't' });
    const result = await runBetweenIterations({
      hook: {
        command: 'false',
        label: 'fail',
        timeoutMs: 1000,
        optional: false,
        dryRun: false,
        exitOnFailure: true,
        noOp: false,
        source: 'template',
      },
      iteration: 1,
      memory,
      runner: async () => ({ exitCode: 1, stdout: '', stderr: 'fail' }),
    });
    expect(result.fatal).toBe(true);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
});
