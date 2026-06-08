/**
 * Critique phase model label — blackboard display must show routed Cursor model IDs,
 * not a hardcoded "Grok" brand string. Internal lane name `grok` maps to DEFAULT_PM_MODEL.
 *
 * Scoped run: npx vitest run tests/unit/loop-critique-model-label.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CritiquePhaseHandler } from '../../src/loop-engine/phase-handlers/critique-phase.js';
import { createInitialLoopState } from '../../src/loop-engine/loop-state.js';
import { Phase } from '../../src/loop-engine/loop-phases.js';
import { Blackboard } from '../../src/rco/blackboard.js';
import { DEFAULT_PM_MODEL, DEFAULT_ENGINEER_MODEL } from '../../src/rco/cursor-models.js';
import type { BlackboardEntry } from '../../src/rco/blackboard.js';

function findCritiqueResultEntry(entries: BlackboardEntry[]): BlackboardEntry | undefined {
  return entries.find(
    (e) =>
      e.type === 'result' &&
      e.tags.includes('loop') &&
      e.tags.includes('critique') &&
      e.tags.includes('retry-decision'),
  );
}

function modelLineFromContent(content: string): string | undefined {
  return content.split('\n').find((line) => line.startsWith('Decision:') && line.includes('Model:'));
}

describe('CritiquePhaseHandler — model label rendering', () => {
  let tmpDir: string;
  let blackboard: Blackboard;
  let handler: CritiquePhaseHandler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-critique-label-'));
    blackboard = new Blackboard(tmpDir);
    handler = new CritiquePhaseHandler();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders DEFAULT_PM_MODEL for high-level lane (internal grok) on blackboard', async () => {
    const state = createInitialLoopState('minimal-3-phase', 'model label test', Phase.Critique);
    state.retryCount = 0;
    state.lastVerification = {
      pass: true,
      summary: 'All checks passed',
      at: Date.now(),
      strategies: [{ type: 'unit', pass: true, durationMs: 12 }],
    };

    await handler.execute({
      goal: 'model label test',
      state,
      blackboard,
      iteration: 1,
      hadBlockers: false,
      maxRetries: 3,
    });

    const entry = findCritiqueResultEntry(blackboard.read());
    expect(entry).toBeDefined();

    const modelLine = modelLineFromContent(entry!.content);
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain(`Model: ${DEFAULT_PM_MODEL} (high-level)`);
    expect(modelLine).not.toMatch(/Grok/i);
    expect(entry!.content).not.toMatch(/Grok/i);
  });

  it('renders DEFAULT_PM_MODEL when blockers force high-level lane', async () => {
    const state = createInitialLoopState('minimal-3-phase', 'blocker label test', Phase.Critique);
    state.retryCount = 1;
    state.lastVerification = {
      pass: false,
      summary: 'unit failed',
      at: Date.now(),
      strategies: [
        { type: 'unit', pass: false, durationMs: 40, failures: ['expected true to be false'] },
        { type: 'lint', pass: false, durationMs: 20, failures: ['no-unused-vars'] },
        { type: 'typecheck', pass: false, durationMs: 30, failures: ['TS2322'] },
      ],
    };

    await handler.execute({
      goal: 'blocker label test',
      state,
      blackboard,
      iteration: 2,
      hadBlockers: true,
      maxRetries: 3,
    });

    const entry = findCritiqueResultEntry(blackboard.read());
    expect(entry).toBeDefined();

    const modelLine = modelLineFromContent(entry!.content);
    expect(modelLine).toContain(`Model: ${DEFAULT_PM_MODEL} (high-level)`);
    expect(modelLine).not.toMatch(/Grok/i);
  });

  it('renders DEFAULT_ENGINEER_MODEL for code-specific lane without Grok branding', async () => {
    const state = createInitialLoopState('minimal-3-phase', 'composer label test', Phase.Critique);
    state.retryCount = 0;
    state.lastVerification = {
      pass: false,
      summary: 'unit failed',
      at: Date.now(),
      strategies: [
        { type: 'unit', pass: false, durationMs: 55, failures: ['AssertionError: expected 1 to be 2'] },
      ],
    };

    await handler.execute({
      goal: 'composer label test',
      state,
      blackboard,
      iteration: 1,
      hadBlockers: false,
      maxRetries: 3,
    });

    const entry = findCritiqueResultEntry(blackboard.read());
    expect(entry).toBeDefined();

    const modelLine = modelLineFromContent(entry!.content);
    expect(modelLine).toContain(`Model: ${DEFAULT_ENGINEER_MODEL} (code-specific)`);
    expect(modelLine).not.toMatch(/Grok/i);
    expect(entry!.content).not.toMatch(/Grok/i);
  });

  it('keeps internal lane key in structured JSON while display label uses routed PM model', async () => {
    const state = createInitialLoopState('minimal-3-phase', 'structured label test', Phase.Critique);
    state.lastVerification = {
      pass: true,
      summary: 'ok',
      at: Date.now(),
      strategies: [],
    };

    await handler.execute({
      goal: 'structured label test',
      state,
      blackboard,
      iteration: 1,
      maxRetries: 3,
    });

    const detail = blackboard
      .read()
      .find((e) => e.tags.includes('critique-detail') && e.type === 'decision');
    expect(detail).toBeDefined();

    const snapshot = JSON.parse(detail!.content) as { model: string };
    expect(snapshot.model).toBe('grok');

    const result = findCritiqueResultEntry(blackboard.read());
    const modelLine = modelLineFromContent(result!.content);
    expect(modelLine).toContain(DEFAULT_PM_MODEL);
    expect(modelLine).not.toMatch(/Grok/i);
  });
});
