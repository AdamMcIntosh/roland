/**
 * P0: roland team defaults to Pure ClosedLoop with auto-selected loop template.
 *
 * Run: npx vitest run tests/unit/team-cli-default-loop.test.ts
 */

import { describe, expect, it } from 'vitest';
import { parseTeamArgs, resolveTeamLoopTemplate } from '../../src/rco/team-cli.js';

describe('team-cli Pure ClosedLoop defaults', () => {
  it('parseTeamArgs recognizes --legacy-pm and --use-pm-team', () => {
    expect(parseTeamArgs(['team', 'goal', '--legacy-pm']).legacyPm).toBe(true);
    expect(parseTeamArgs(['team', 'goal', '--use-pm-team']).legacyPm).toBe(true);
  });

  it('resolveTeamLoopTemplate auto-selects small-fix-loop for typo goals', () => {
    const tpl = resolveTeamLoopTemplate({ goal: 'Fix typo in README header' });
    expect(tpl).toBe('small-fix-loop');
  });

  it('resolveTeamLoopTemplate returns undefined for legacy PM opt-in', () => {
    expect(resolveTeamLoopTemplate({ goal: 'Fix typo', legacyPm: true })).toBeUndefined();
  });

  it('resolveTeamLoopTemplate honors explicit --loop-template', () => {
    expect(
      resolveTeamLoopTemplate({
        goal: 'Fix typo',
        loopTemplate: 'full-cycle-verified-loop',
      }),
    ).toBe('full-cycle-verified-loop');
  });

  it('parseTeamArgs without --loop-template leaves loopTemplate undefined for resolver', () => {
    const parsed = parseTeamArgs(['team', 'Fix typo in error message']);
    expect(parsed.loopTemplate).toBeUndefined();
    expect(parsed.legacyPm).toBe(false);
    expect(resolveTeamLoopTemplate(parsed)).toBe('small-fix-loop');
  });
});
