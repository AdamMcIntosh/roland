/**
 * roland templates — loop template catalog CLI.
 *
 * Scoped: npm run test:run -- tests/unit/templates-cli.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTemplatesCatalog,
  parseTemplatesArgs,
  printTemplatesCatalog,
  runTemplatesCli,
} from '../../src/rco/templates-cli.js';
import { CORE_GENERIC_TEMPLATES } from '../../src/loop-engine/loop-templates.js';

describe('roland templates', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('parseTemplatesArgs detects --json', () => {
    expect(parseTemplatesArgs(['templates'])).toEqual({ json: false });
    expect(parseTemplatesArgs(['templates', '--json'])).toEqual({ json: true });
  });

  it('buildTemplatesCatalog loads core templates with required fields', () => {
    const catalog = buildTemplatesCatalog();

    expect(catalog.coreGeneric).toEqual(CORE_GENERIC_TEMPLATES);
    expect(catalog.defaultTemplate).toBeTruthy();
    expect(catalog.templates.length).toBeGreaterThanOrEqual(CORE_GENERIC_TEMPLATES.length);

    for (const name of CORE_GENERIC_TEMPLATES) {
      const tpl = catalog.templates.find((t) => t.name === name);
      expect(tpl, `missing ${name}`).toBeDefined();
      expect(tpl!.description.length).toBeGreaterThan(0);
      expect(Array.isArray(tpl!.verificationGates)).toBe(true);
      expect(tpl!.exitConditions.length).toBeGreaterThan(0);
    }
  });

  it('feature-implementation-loop exposes verification gates and exit conditions', () => {
    const tpl = buildTemplatesCatalog().templates.find(
      (t) => t.name === 'feature-implementation-loop',
    );
    expect(tpl).toBeDefined();
    expect(tpl!.maxIterations).toBe(8);
    expect(tpl!.verificationGates.some((g) => g.type === 'unit')).toBe(true);
    expect(tpl!.verificationGates.some((g) => g.type === 'integration' && g.optional)).toBe(true);
    expect(tpl!.exitConditions.some((e) => e.type === 'all_gates_pass')).toBe(true);
  });

  it('full-cycle-verified-loop includes confidence_streak exit condition', () => {
    const tpl = buildTemplatesCatalog().templates.find(
      (t) => t.name === 'full-cycle-verified-loop',
    );
    expect(tpl).toBeDefined();
    expect(tpl!.maxIterations).toBe(10);
    expect(tpl!.exitConditions.some((e) => e.type === 'confidence_streak')).toBe(true);
    expect(tpl!.verificationGates.some((g) => g.type === 'lint')).toBe(true);
  });

  it('templates without explicit exit_conditions get a default all_gates_pass rule', () => {
    const tpl = buildTemplatesCatalog().templates.find((t) => t.name === 'standard-code-loop');
    expect(tpl).toBeDefined();
    expect(tpl!.exitConditions).toEqual([
      expect.objectContaining({
        type: 'all_gates_pass',
        description: expect.stringContaining('default'),
      }),
    ]);
  });

  it('printTemplatesCatalog --json emits valid JSON catalog', () => {
    printTemplatesCatalog({ json: true });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(payload.templates).toBeInstanceOf(Array);
    expect(payload.defaultTemplate).toBeTruthy();
    expect(payload.coreGeneric).toEqual(CORE_GENERIC_TEMPLATES);
  });

  it('printTemplatesCatalog human mode lists template names', () => {
    printTemplatesCatalog({ json: false });
    const output = String(logSpy.mock.calls[0][0]);
    expect(output).toContain('feature-implementation-loop');
    expect(output).toContain('Max iterations:');
    expect(output).toContain('Verification gates:');
    expect(output).toContain('Exit conditions:');
  });

  it('runTemplatesCli returns exit code 0', () => {
    expect(runTemplatesCli(['templates', '--json'])).toBe(0);
  });
});
