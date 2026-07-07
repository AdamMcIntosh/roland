/**
 * Loop PM bridge — lightweight Plan/Act only (legacy PM Team removed v1.6.0).
 *
 * The LoopPmBridge always uses the lightweight path; resolvePmTeamMode and
 * shouldUsePmTeam are compatibility shims that permanently opt out.
 *
 * Scoped run: npm run test:run -- tests/unit/pm-integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LoopPmBridge,
  readLoopPmSession,
  resolvePmTeamMode,
  shouldUsePmTeam,
  Phase,
  type CommandRunner,
} from '../../src/loop-engine/index.js';
import { Blackboard } from '../../src/coordination/legacy-blackboard.js';
import { LoopTemplates } from '../../src/loop-engine/loop-templates.js';

const passRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'ok',
  stderr: '',
});

describe('PM integration routing (removed — always lightweight)', () => {
  it('resolvePmTeamMode always returns never, ignoring phase and template config', () => {
    const template = {
      name: 't',
      description: '',
      phases: [],
      pmPlan: 'always' as const,
      pmAct: 'always' as const,
      usePmTeam: true,
    };
    expect(resolvePmTeamMode(Phase.Plan, { phase: Phase.Plan, pmTeam: 'always' }, template)).toBe('never');
    expect(resolvePmTeamMode(Phase.Act, undefined, template)).toBe('never');
  });

  it('shouldUsePmTeam never opts in, regardless of goal complexity or mode', () => {
    const complex = shouldUsePmTeam(
      'Refactor the authentication module across multiple services with integration tests and architecture review',
      'always',
    );
    expect(complex.usePm).toBe(false);
    expect(complex.reason).toContain('lightweight');

    expect(shouldUsePmTeam('Fix typo in README', 'auto').usePm).toBe(false);
    expect(shouldUsePmTeam('Big refactor', 'never').usePm).toBe(false);
  });
});

describe('LoopPmBridge session', () => {
  let stateDir: string;
  let blackboard: Blackboard;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-pm-bridge-'));
    blackboard = new Blackboard(stateDir);
    process.env.ROLAND_LOOP_TEST_MODE = '1';
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    delete process.env.ROLAND_LOOP_PM;
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('uses lightweight path even for complex goals on legacy opt-in templates', async () => {
    const templates = new LoopTemplates();
    const base = templates.get('feature-implementation-loop')!;

    const template = { ...base, usePmTeam: true };
    const goal =
      'Implement user profile settings page with API integration, multi-file UI components, and full test coverage';
    const bridge = new LoopPmBridge({
      stateDir,
      goal,
      template,
      blackboard,
      isTestMode: true,
    });

    const planResult = await bridge.runPlanning(1, template.phases.find((p) => p.phase === Phase.Plan));
    expect(planResult.success).toBe(true);

    const session = readLoopPmSession(stateDir);
    expect(session?.executionPath).toBe('lightweight');

    const actResult = await bridge.runAct(1, template.phases.find((p) => p.phase === Phase.Act));
    expect(actResult.success).toBe(true);
  });

  it('uses lightweight path for simple goals on minimal template', async () => {
    const templates = new LoopTemplates();
    const template = templates.get('minimal-3-phase');
    expect(template).toBeDefined();

    const bridge = new LoopPmBridge({
      stateDir,
      goal: 'Add one test',
      template: template!,
      blackboard,
      isTestMode: true,
    });

    const planResult = await bridge.runPlanning(1);
    expect(planResult.success).toBe(true);

    const session = readLoopPmSession(stateDir);
    expect(session?.executionPath).toBe('lightweight');
  });
});

describe('ClosedLoop PM integration (always disabled)', () => {
  let stateDir: string;
  let blackboard: Blackboard;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-cl-pm-'));
    blackboard = new Blackboard(stateDir);
    process.env.ROLAND_LOOP_TEST_MODE = '1';
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('closed-loop-harness uses pure ClosedLoop by default', async () => {
    const { ClosedLoop } = await import('../../src/loop-engine/closed-loop.js');
    const loop = new ClosedLoop({
      stateDir,
      goal: 'Smoke test pure closed loop harness',
      template: 'closed-loop-harness',
      blackboard,
      runner: passRunner,
      isTestMode: true,
      skipBackoff: true,
    });

    expect(loop.getPmIntegration().enabled).toBe(false);
    const result = await loop.run();
    expect(result.status).toBe('completed');
    expect(result.pmIntegration.enabled).toBe(false);

    const session = readLoopPmSession(stateDir);
    expect(session?.executionPath).toBe('lightweight');
  });

  it('enablePmIntegration=true is ignored — mission still completes on the lightweight path', async () => {
    const { ClosedLoop } = await import('../../src/loop-engine/closed-loop.js');
    const goal =
      'Ship OAuth callback handling with integration tests across auth module and API routes';
    const loop = new ClosedLoop({
      stateDir,
      goal,
      template: 'feature-implementation-loop',
      blackboard,
      runner: passRunner,
      isTestMode: true,
      skipBackoff: true,
      enablePmIntegration: true,
    });

    expect(loop.getPmIntegration().enabled).toBe(false);
    const result = await loop.run();
    expect(result.status).toBe('completed');
    expect(result.pmIntegration.enabled).toBe(false);

    const session = readLoopPmSession(stateDir);
    expect(session?.executionPath).toBe('lightweight');
  });
});
