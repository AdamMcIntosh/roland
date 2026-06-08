/**
 * Phase 3 unit tests: Cursor-native lane routing.
 * Proves each persona maps to the right Cursor model (PM→gpt-5.4-nano,
 * all engineers→composer-2.5), that there are NO OpenRouter slugs, and that
 * policy + lane overrides take effect.
 */

import { describe, it, expect } from 'vitest';
import { TaskRouter } from '../../src/pm/router.js';
import { laneForEngineer, modelForLane, DEFAULT_MODEL_POLICY } from '../../src/pm/model-policy.js';

describe('lane assignment', () => {
  it('maps personas to the expected lanes', () => {
    expect(laneForEngineer('lead-pm')).toBe('pm');
    expect(laneForEngineer('architect')).toBe('reasoning');
    expect(laneForEngineer('code-reviewer')).toBe('reasoning');
    expect(laneForEngineer('security-reviewer')).toBe('reasoning');
    expect(laneForEngineer('executor')).toBe('coding');
    expect(laneForEngineer('build-fixer')).toBe('coding');
    expect(laneForEngineer('qa-tester')).toBe('light');
    expect(laneForEngineer('doc-writer')).toBe('light');
  });

  it('honors lane overrides', () => {
    expect(laneForEngineer('designer', { designer: 'reasoning' })).toBe('reasoning');
  });
});

describe('modelForLane', () => {
  it('maps lanes to Cursor models under the default policy', () => {
    expect(DEFAULT_MODEL_POLICY.pm).toBe('gpt-5.4-nano');
    expect(modelForLane('pm').model).toBe('gpt-5.4-nano');
    expect(modelForLane('reasoning').model).toBe('composer-2.5');
    expect(modelForLane('coding').model).toBe('composer-2.5');
    expect(modelForLane('light').model).toBe('composer-2.5');
  });
});

describe('TaskRouter', () => {
  const router = new TaskRouter();

  it('routes the Lead PM to gpt-5.4-nano', () => {
    const d = router.route('orchestrate', 'lead-pm');
    expect(d.model).toBe('gpt-5.4-nano');
    expect(d.lane).toBe('pm');
    expect(d.provider).toBe('cursor');
  });

  it('routes reasoning roles to composer-2.5 (interactive)', () => {
    const d = router.route('review the implementation', 'code-reviewer');
    expect(d.model).toBe('composer-2.5');
    expect(d.interactive).toBe(true);
    expect(d.rationale).toContain('reasoning lane');
  });

  it('routes execution roles to composer-2.5 (background)', () => {
    const d = router.route('implement the feature', 'executor');
    expect(d.model).toBe('composer-2.5');
    expect(d.interactive).toBe(false);
    expect(d.rationale).toMatch(/background/);
  });

  it('never emits an OpenRouter slug or a free-tier model', () => {
    for (const name of ['lead-pm', 'architect', 'executor', 'qa-tester', 'code-reviewer', 'writer']) {
      const d = router.route('x', name);
      expect(d.model).not.toContain('/');
      expect(d.model).not.toContain(':free');
      expect(d.provider).toBe('cursor');
    }
  });

  it('respects a custom policy and lane overrides', () => {
    const custom = new TaskRouter({
      policy: { ...DEFAULT_MODEL_POLICY, fast: 'composer-3-fast' },
      laneOverrides: { designer: 'reasoning' },
    });
    expect(custom.route('design', 'designer').model).toBe('composer-3-fast');
  });
});
