/**
 * PM Integration into ClosedLoop — routing and session persistence.
 *
 * Scoped run: npm run test:run -- tests/unit/pm-integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LoopPmBridge,
  LOOP_PM_SESSION_FILE,
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

describe('PM integration routing', () => {
  it('resolvePmTeamMode prefers phase override over template default', () => {
    const template = {
      name: 't',
      description: '',
      phases: [],
      pmPlan: 'never' as const,
      pmAct: 'auto' as const,
    };
    expect(resolvePmTeamMode(Phase.Plan, { phase: Phase.Plan, pmTeam: 'always' }, template)).toBe('always');
    expect(resolvePmTeamMode(Phase.Act, undefined, template)).toBe('auto');
  });

  it('shouldUsePmTeam routes complex goals to PM Team when pmOptIn is true', () => {
    const complex = shouldUsePmTeam(
      'Refactor the authentication module across multiple services with integration tests and architecture review',
      'auto',
      { pmOptIn: true },
    );
    expect(complex.usePm).toBe(true);

    const simple = shouldUsePmTeam('Fix typo in README', 'auto', { pmOptIn: true });
    expect(simple.usePm).toBe(false);
  });

  it('shouldUsePmTeam auto without pmOptIn stays lightweight', () => {
    const complex = shouldUsePmTeam(
      'Refactor the authentication module across multiple services',
      'auto',
      { pmOptIn: false },
    );
    expect(complex.usePm).toBe(false);
  });

  it('shouldUsePmTeam respects always and never modes', () => {
    expect(shouldUsePmTeam('Fix typo', 'always').usePm).toBe(true);
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

  it('uses PM Team for complex goals when template has use_pm_team opt-in', async () => {
    const templates = new LoopTemplates();
    const base = templates.get('feature-implementation-loop')!;
    expect(base.usePmTeam).toBe(false);

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

    const planResult = await bridge.runPlanning(1, template!.phases.find((p) => p.phase === Phase.Plan));
    expect(planResult.success).toBe(true);
    expect(planResult.summary).toContain('PM Team');

    const session = readLoopPmSession(stateDir);
    expect(session?.executionPath).toBe('pm_team');
    expect(session?.plan?.tasks.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(stateDir, LOOP_PM_SESSION_FILE))).toBe(true);

    const actResult = await bridge.runAct(1, template!.phases.find((p) => p.phase === Phase.Act));
    expect(actResult.success).toBe(true);
    expect(actResult.summary).toContain('PM Team act');

    const afterAct = readLoopPmSession(stateDir);
    expect(afterAct?.wavesRun).toBeGreaterThan(0);
  });

  it('uses lightweight path for simple goals on minimal template', async () => {
    process.env.ROLAND_LOOP_PM = 'never';
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

describe('ClosedLoop with PM integration', () => {
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

  it('feature-implementation-loop completes with PM session when enablePmIntegration is true', async () => {
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

    const result = await loop.run();
    expect(result.status).toBe('completed');

    const session = readLoopPmSession(stateDir);
    expect(session?.executionPath).toBe('pm_team');
    expect(session?.wavesRun).toBeGreaterThan(0);
  });
});
