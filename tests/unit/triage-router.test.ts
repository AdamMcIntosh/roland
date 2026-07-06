import { describe, expect, it } from 'vitest';
import {
  recommendLoopTemplate,
  buildRolandTeamCommand,
  TRIAGE_ROUTER_PROMPT,
} from '../../src/rco/triage-router.js';

describe('triage-router', () => {
  it('exports hybrid-architecture prompt with Pure ClosedLoop default', () => {
    expect(TRIAGE_ROUTER_PROMPT).toContain('Roland Triage Router');
    expect(TRIAGE_ROUTER_PROMPT).toContain('no separate Hermes');
    expect(TRIAGE_ROUTER_PROMPT).toContain('use_pm_team: false');
    expect(TRIAGE_ROUTER_PROMPT).toContain('small-fix-loop');
    expect(TRIAGE_ROUTER_PROMPT).toContain('standard-code-loop');
    expect(TRIAGE_ROUTER_PROMPT).toContain('research-and-plan-loop');
    expect(TRIAGE_ROUTER_PROMPT).toContain('[DEPRECATED]');
  });

  it('recommends small-fix-loop for typo and minor fix goals', () => {
    const rec = recommendLoopTemplate('Fix small typo in README');
    expect(rec.template).toBe('small-fix-loop');
    const hotfix = recommendLoopTemplate('Hotfix null check in login handler');
    expect(hotfix.template).toBe('small-fix-loop');
  });

  it('recommends refactor template for refactor goals', () => {
    const rec = recommendLoopTemplate('Refactor the payment service to use cleaner types');
    expect(rec.template).toBe('refactor-and-modernize-loop');
  });

  it('recommends feature template for implementation goals', () => {
    const rec = recommendLoopTemplate('Implement structured request logging with pino');
    expect(rec.template).toBe('feature-implementation-loop');
  });

  it('recommends research template for research-only goals', () => {
    const rec = recommendLoopTemplate('Research OAuth provider options and produce a spec');
    expect(rec.template).toBe('research-and-plan-loop');
  });

  it('defaults to standard-code-loop for general work', () => {
    const rec = recommendLoopTemplate('Harden loop checkpoint recovery semantics');
    expect(rec.template).toBe('standard-code-loop');
  });

  it('buildRolandTeamCommand includes loop template flag', () => {
    const cmd = buildRolandTeamCommand('Ship feature X', 'full-cycle-verified-loop');
    expect(cmd).toBe('roland team "Ship feature X" --loop-template full-cycle-verified-loop');
  });
});
