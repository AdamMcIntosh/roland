/**
 * Reflection phase unit tests — structured format generation and parsing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildStructuredReflection,
  formatStructuredReflection,
  parseStructuredReflection,
} from '../../src/loop-engine/phase-handlers/reflection-phase.js';
import type { PhaseHandlerContext } from '../../src/loop-engine/phase-handlers/types.js';
import { createInitialLoopState } from '../../src/loop-engine/loop-state.js';
import { Blackboard } from '../../src/rco/blackboard.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('reflection-phase structured format', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-reflect-'));
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  function makeCtx(overrides: Partial<PhaseHandlerContext> = {}): PhaseHandlerContext {
    const state = createInitialLoopState('test-loop', 'Ship feature', 'plan');
    state.lastVerification = {
      pass: true,
      accepted: true,
      summary: 'All gates passed',
      confidence: 0.92,
      at: Date.now(),
      durationMs: 100,
      strategies: [{ type: 'unit', pass: true, durationMs: 50 }],
    };
    state.lastCritique = {
      strengths: ['Clean implementation'],
      issues: [],
      suggestions: ['Add edge case test'],
      retryDecision: 'proceed',
      model: 'composer',
      summary: 'Ready to ship',
      at: Date.now(),
      iteration: 1,
      proposalCount: 0,
    };

    return {
      goal: 'Ship feature',
      state,
      blackboard: new Blackboard(stateDir),
      iteration: 1,
      ...overrides,
    };
  }

  it('generates consistent structured reflection markdown', () => {
    const structured = buildStructuredReflection(makeCtx());
    const content = formatStructuredReflection(2, structured);

    expect(content).toContain('## Iteration 2 Reflection');
    expect(content).toContain('**What worked well:**');
    expect(content).toContain('**What failed / needs improvement:**');
    expect(content).toContain('**Key learnings:**');
    expect(content).toContain('**Next iteration strategy:**');
    expect(content).toContain('**Confidence in current approach (0-100):**');
    expect(structured.confidenceScore).toBeGreaterThanOrEqual(75);
  });

  it('includes spec progress in reflection when present', () => {
    const structured = buildStructuredReflection(
      makeCtx({
        specProgress: {
          specPath: 'spec.md',
          total: 3,
          completed: 1,
          percentComplete: 33.3,
          items: [
            { line: 1, text: 'Done', complete: true },
            { line: 2, text: 'Open', complete: false },
            { line: 3, text: 'Open 2', complete: false },
          ],
          allComplete: false,
          updatedAt: Date.now(),
        },
      }),
    );

    expect(structured.keyLearnings.some((l) => l.includes('33.3%'))).toBe(true);
    expect(structured.nextStrategy.some((s) => s.includes('Complete spec items'))).toBe(true);
  });

  it('round-trips structured reflection via parseStructuredReflection', () => {
    const structured = buildStructuredReflection(makeCtx());
    const content = formatStructuredReflection(1, structured);
    const parsed = parseStructuredReflection(content);

    expect(parsed).not.toBeNull();
    expect(parsed!.whatWorkedWell.length).toBeGreaterThan(0);
    expect(parsed!.confidenceScore).toBe(structured.confidenceScore);
  });
});
