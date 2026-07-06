/**
 * Generic loop template lint and alias resolution.
 *
 * Scoped: npm run test:run -- tests/unit/loop-template-lint.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  LoopTemplates,
  lintLoopTemplate,
  lintAllLoopTemplates,
  CORE_GENERIC_TEMPLATES,
  TEMPLATE_ALIASES,
} from '../../src/loop-engine/loop-templates.js';
import { summarizeBetweenIterationsConfig } from '../../src/loop-engine/loop-template-resolution.js';
import type { LoopTemplate } from '../../src/loop-engine/loop-phases.js';

describe('Generic loop templates', () => {
  const templates = new LoopTemplates();

  it('loads all seven core generic templates', () => {
    expect(CORE_GENERIC_TEMPLATES).toHaveLength(7);
    for (const name of CORE_GENERIC_TEMPLATES) {
      const tpl = templates.get(name);
      expect(tpl, `missing ${name}`).toBeDefined();
      expect(tpl!.phases.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses generic role agents on core templates', () => {
    const feature = templates.get('feature-implementation-loop')!;
    const plan = feature.phases.find((p) => p.phase === 'plan');
    expect(plan?.agent).toBe('pm');
  });

  it('resolves deprecated aliases to canonical names', () => {
    expect(templates.resolveName('closed-loop-harness')).toBe('full-cycle-verified-loop');
    expect(templates.resolveName('code-quality-loop')).toBe('refactor-and-modernize-loop');
    expect(templates.resolveName('research-synthesis-loop')).toBe('research-and-plan-loop');
    expect(templates.resolveName('research-and-spec-loop')).toBe('research-and-plan-loop');
    expect(templates.resolveName('mcp-extension-loop')).toBe('feature-implementation-loop');
    expect(templates.resolveName('standard-code-loop')).toBe('standard-code-loop');
  });

  it('keeps deprecated YAML entries loadable for in-flight runs', () => {
    const legacy = templates.get('closed-loop-harness');
    expect(legacy?.name).toBe('closed-loop-harness');
    expect(legacy?.deprecated).toBe(true);
    expect(legacy?.aliasOf).toBe('full-cycle-verified-loop');
  });

  it('TEMPLATE_ALIASES covers deprecated names', () => {
    expect(TEMPLATE_ALIASES['closed-loop-harness']).toBe('full-cycle-verified-loop');
  });

  it('template lint passes with no errors on shipped templates', () => {
    const issues = lintAllLoopTemplates(templates);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('flags project-specific content in lint', () => {
    const bad: LoopTemplate = {
      name: 'bad-project-loop',
      description: 'Implement Lumina Echoes gameplay',
      phases: [{ phase: 'plan', label: 'Plan' }],
    };
    const issues = lintLoopTemplate(bad);
    expect(issues.some((i) => i.code === 'project_specific')).toBe(true);
  });

  it('small-fix-loop is Pure ClosedLoop with optional unit gate', () => {
    const tpl = templates.get('small-fix-loop')!;
    expect(tpl.usePmTeam).toBe(false);
    expect(tpl.maxIterations).toBe(3);
    expect(tpl.minConfidence).toBe(0.65);
    const verify = tpl.phases.find((p) => p.phase === 'verify');
    const unitEntry = verify?.verification?.find(
      (v) => typeof v === 'object' && v.type === 'unit',
    );
    expect(unitEntry && typeof unitEntry === 'object' && unitEntry.optional).toBe(true);
    expect(summarizeBetweenIterationsConfig(tpl)).toContain('git-commit');
    const act = tpl.phases.find((p) => p.phase === 'act');
    expect(act?.specialistSpawns?.some((s) => s.role === 'coding')).toBe(true);
  });

  it('feature-implementation-loop defaults to Pure ClosedLoop (use_pm_team false)', () => {
    const tpl = templates.get('feature-implementation-loop')!;
    expect(tpl.usePmTeam).toBe(false);
    const verify = tpl.phases.find((p) => p.phase === 'verify');
    expect(verify?.verification?.length).toBeGreaterThanOrEqual(3);
    expect(tpl.betweenIterations).toBeDefined();
    expect(summarizeBetweenIterationsConfig(tpl)).toContain('git-commit');
    const unitEntry = verify?.verification?.find(
      (v) => typeof v === 'object' && v.type === 'unit',
    );
    expect(unitEntry && typeof unitEntry === 'object' && unitEntry.weight).toBe(0.9);
  });

  it('full-cycle-verified-loop has reflection and exit conditions', () => {
    const tpl = templates.get('full-cycle-verified-loop')!;
    expect(tpl.reflection).toBe(true);
    expect(tpl.exitConditions?.length).toBeGreaterThanOrEqual(2);
  });

  it('mcp-extension-loop resolves to feature-implementation-loop', () => {
    expect(templates.resolveName('mcp-extension-loop')).toBe('feature-implementation-loop');
    const legacy = templates.get('mcp-extension-loop');
    expect(legacy?.deprecated).toBe(true);
  });

  it('maintenance-loop has lint and typecheck gates', () => {
    const tpl = templates.get('maintenance-loop')!;
    const verify = tpl.phases.find((p) => p.phase === 'verify');
    expect(verify?.verification?.length).toBeGreaterThanOrEqual(2);
  });

  it('flags invalid spawn conditions in lint', () => {
    const bad: LoopTemplate = {
      name: 'bad-spawn-loop',
      description: 'test',
      phases: [{
        phase: 'plan',
        specialistSpawns: [{
          role: 'planner',
          conditions: { iterationMin: 5, iterationMax: 2 },
        }],
      }],
    };
    const issues = lintLoopTemplate(bad);
    expect(issues.some((i) => i.code === 'spawn_invalid_conditions')).toBe(true);
  });

  it('buildLoopTemplateCatalog includes core templates', async () => {
    const { buildLoopTemplateCatalog } = await import('../../src/loop-engine/loop-templates.js');
    const catalog = buildLoopTemplateCatalog();
    expect(catalog.templates.length).toBeGreaterThan(0);
    expect(catalog.coreGeneric).toContain('standard-code-loop');
    expect(catalog.templates.some((t) => t.isCoreGeneric && t.hasCustomSpawns)).toBe(true);
  });
});
