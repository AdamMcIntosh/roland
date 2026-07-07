/**
 * Regression tests for the Commander CLI program (src/cli/program.ts).
 *
 * Guards two fatal-error regressions:
 *  1. Multi-short-flag option definitions ('--background, --detach, -b') crash
 *     Commander at option-construction time — buildProgram() must not throw.
 *  2. parseAsync was called with a ['node', 'roland', ...] prefix while using
 *     { from: 'user' }, making Commander treat 'node' as an unknown command.
 *
 * Scoped: npm run test:run -- tests/unit/cli-program.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/cli/dispatch.js', () => ({
  dispatchCommand: vi.fn(async () => undefined),
  printHelp: vi.fn(),
  KNOWN_CMDS: new Set(['team', 'mission', 'mission-audit', 'status', 'live']),
}));

import { buildProgram, runProgram } from '../../src/cli/program.js';
import { dispatchCommand } from '../../src/cli/dispatch.js';

const dispatchMock = vi.mocked(dispatchCommand);

describe('CLI program', () => {
  beforeEach(() => {
    dispatchMock.mockClear();
  });

  it('buildProgram constructs without throwing (option flag definitions are valid)', () => {
    expect(() => buildProgram()).not.toThrow();
  });

  it('routes "mission <goal> --loop-template" to dispatchCommand team with goal and flags', async () => {
    await runProgram(['mission', 'Add a templates command', '--loop-template', 'feature-implementation-loop']);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const [cmd, rest] = dispatchMock.mock.calls[0];
    expect(cmd).toBe('team');
    expect(rest).toContain('Add a templates command');
    expect(rest).toContain('--loop-template');
    expect(rest).toContain('feature-implementation-loop');
  });

  it('maps -b / --detach to --background for team-cli compatibility', async () => {
    await runProgram(['team', 'goal', '-b']);
    expect(dispatchMock.mock.calls[0][1]).toContain('--background');

    dispatchMock.mockClear();
    await runProgram(['team', 'goal', '--detach']);
    expect(dispatchMock.mock.calls[0][1]).toContain('--background');
  });

  it('maps --use-pm-team to --legacy-pm', async () => {
    await runProgram(['team', 'goal', '--use-pm-team']);
    expect(dispatchMock.mock.calls[0][1]).toContain('--legacy-pm');
  });

  it('treats a bare goal as a team mission', async () => {
    await runProgram(['fix the login bug']);
    const [cmd, rest] = dispatchMock.mock.calls[0];
    expect(cmd).toBe('team');
    expect(rest).toContain('fix the login bug');
  });
});
