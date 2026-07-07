/**
 * Loop Engineering end-to-end readiness — ClosedLoop harness + dispatch verification.
 *
 * Scoped: npm run test:run -- tests/integration/loop-engine-readiness.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ClosedLoop,
  Phase,
  readLoopPmSession,
  runLoopReadinessCheck,
} from '../../src/loop-engine/index.js';
import { RoleModelRouter, resetRoleModelRouter } from '../../src/models/role-model-router.js';
import { Blackboard } from '../../src/coordination/legacy-blackboard.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';
import type { CommandRunner } from '../../src/loop-engine/verification/index.js';

const passRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'Tests  8 passed (8)\n',
  stderr: '',
});

describe('Loop Engineering E2E readiness', () => {
  let stateDir: string;
  let blackboard: Blackboard;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-loop-ready-'));
    blackboard = new Blackboard(stateDir);
    clearLoopEngineConfigCache();
    resetRoleModelRouter();
    process.env.ROLAND_LOOP_TEST_MODE = '1';
    process.env.CURSOR_API_KEY = 'test-readiness-key';
  });

  afterEach(() => {
    delete process.env.ROLAND_LOOP_TEST_MODE;
    delete process.env.CURSOR_API_KEY;
    clearLoopEngineConfigCache();
    resetRoleModelRouter();
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('readiness gate passes before harness run', () => {
    const report = runLoopReadinessCheck();
    expect(report.ready).toBe(true);
    expect(report.validation.ok).toBe(true);
    expect(report.dispatchSummary).toContain('pm=');
  });

  it('Pure ClosedLoop harness completes with SDK dispatch defaults', async () => {
    const loop = new ClosedLoop({
      stateDir,
      goal: 'Loop Engineering readiness smoke — verify PACVRE phases and dispatch',
      template: 'closed-loop-harness',
      blackboard,
      runner: passRunner,
      isTestMode: true,
      skipBackoff: true,
    });

    expect(loop.getPmIntegration().enabled).toBe(false);

    const router = RoleModelRouter.fromConfig();
    const planDispatch = router.resolveDispatchForPhase('plan', { log: false });
    const critiqueDispatch = router.resolveDispatchForPhase('critique', { log: false });
    expect(planDispatch.method).toBe('cursor_sdk');
    expect(critiqueDispatch.method).toBe('cursor_sdk');

    const result = await loop.run({ hadBlockers: false });
    expect(result.status).toBe('completed');
    expect(result.spawnCount).toBeGreaterThan(0);
    expect(result.pmIntegration.enabled).toBe(false);

    const session = readLoopPmSession(stateDir);
    expect(session?.executionPath).toBe('lightweight');

    const spawnPosts = blackboard.read({}).filter((e) => e.tags?.includes('spawn'));
    expect(spawnPosts.length).toBeGreaterThan(0);
    expect(spawnPosts.some((e) => String(e.content).includes('cursor_sdk') || String(e.content).includes('SDK'))).toBe(true);
  });

  it('feature template runs Pure ClosedLoop even when enablePmIntegration is requested (legacy PM removed)', async () => {
    const goal =
      'Implement OAuth integration across auth module with multi-file changes and integration tests';
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

    const phaseHistory = result.state.phaseHistory.map((p) => p.phase);
    expect(phaseHistory).toContain(Phase.Plan);
    expect(phaseHistory).toContain(Phase.Verify);
    expect(phaseHistory).toContain(Phase.Critique);
  });
});
