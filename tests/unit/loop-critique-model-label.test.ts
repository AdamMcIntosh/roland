/**
 * ## P1 Honesty & Consolidation
 *
 * Critique phase mode label — blackboard display must show rule-based critique,
 * not misleading LLM model dispatch labels.
 *
 * Scoped run: npx vitest run tests/unit/loop-critique-model-label.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  CritiquePhaseHandler,
  critiqueModelLabel,
} from '../../src/loop-engine/phase-handlers/critique-phase.js';
import { createInitialLoopState } from '../../src/loop-engine/loop-state.js';
import { Phase } from '../../src/loop-engine/loop-phases.js';
import { Blackboard } from '../../src/coordination/legacy-blackboard.js';
import { RoleModelRouter } from '../../src/models/role-model-router.js';
import type { BlackboardEntry } from '../../src/coordination/legacy-blackboard.js';

function findCritiqueResultEntry(entries: BlackboardEntry[]): BlackboardEntry | undefined {
  return entries.find(
    (e) =>
      e.type === 'result' &&
      e.tags.includes('loop') &&
      e.tags.includes('critique') &&
      e.tags.includes('retry-decision'),
  );
}

function decisionLineFromContent(content: string): string | undefined {
  return content.split('\n').find((line) => line.startsWith('Decision:') && line.includes('rule-based'));
}

describe('CritiquePhaseHandler — honest mode label rendering', () => {
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

  it('renders rule-based label on blackboard for high-level lane', async () => {
    const state = createInitialLoopState('minimal-3-phase', 'mode label test', Phase.Critique);
    state.retryCount = 0;
    state.lastVerification = {
      pass: true,
      summary: 'All checks passed',
      at: Date.now(),
      strategies: [{ type: 'unit', pass: true, durationMs: 12 }],
    };

    await handler.execute({
      goal: 'mode label test',
      state,
      blackboard,
      iteration: 1,
      hadBlockers: false,
      maxRetries: 3,
    });

    const entry = findCritiqueResultEntry(blackboard.read());
    expect(entry).toBeDefined();

    const decisionLine = decisionLineFromContent(entry!.content);
    expect(decisionLine).toBeDefined();
    expect(decisionLine).toContain('rule-based structured critique (no LLM)');
    expect(decisionLine).toContain('lane=critic (high-level)');
    expect(entry!.content).not.toMatch(/@openrouter|@cursor_sdk/i);
  });

  it('renders rule-based label when blockers force high-level lane', async () => {
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

    const decisionLine = decisionLineFromContent(entry!.content);
    expect(decisionLine).toContain('rule-based structured critique (no LLM)');
    expect(decisionLine).toContain('lane=critic (high-level)');
  });

  it('renders rule-based label for code-specific lane', async () => {
    const state = createInitialLoopState('minimal-3-phase', 'coding label test', Phase.Critique);
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
      goal: 'coding label test',
      state,
      blackboard,
      iteration: 1,
      hadBlockers: false,
      maxRetries: 3,
    });

    const entry = findCritiqueResultEntry(blackboard.read());
    expect(entry).toBeDefined();

    const decisionLine = decisionLineFromContent(entry!.content);
    expect(decisionLine).toContain('rule-based structured critique (no LLM)');
    expect(decisionLine).toContain('lane=coding (code-specific)');
  });

  it('keeps canonical lane key in structured JSON while display is rule-based', async () => {
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
    expect(snapshot.model).toBe('critic');

    const result = findCritiqueResultEntry(blackboard.read());
    const decisionLine = decisionLineFromContent(result!.content);
    expect(decisionLine).toContain('rule-based structured critique (no LLM)');
    expect(decisionLine).not.toMatch(/deepseek|grok|qwen/i);
  });
});

describe('critiqueModelLabel', () => {
  it('returns rule-based label with lane metadata', () => {
    expect(critiqueModelLabel('critic')).toBe(
      'rule-based structured critique (no LLM) · lane=critic (high-level)',
    );
    expect(critiqueModelLabel('coding')).toBe(
      'rule-based structured critique (no LLM) · lane=coding (code-specific)',
    );
  });

  it('does not include LLM provider or model IDs', () => {
    const router = new RoleModelRouter({
      critic: { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
      coding: { provider: 'openrouter', model: 'qwen/qwen3-coder-next' },
    });
    void router;
    expect(critiqueModelLabel('critic')).not.toMatch(/deepseek|openrouter/i);
    expect(critiqueModelLabel('coding')).not.toMatch(/qwen|openrouter/i);
  });
});
