/**
 * team-cli — worktree guard flag parsing.
 *
 * Scoped: npm run test:run -- tests/unit/team-cli-guard.test.ts
 */

import { describe, it, expect } from 'vitest';
import { parseTeamArgs } from '../../src/rco/team-cli.js';

describe('team-cli worktree flags', () => {
  it('parses --force and --auto-stash', () => {
    const args = parseTeamArgs(['team', 'fix bug', '--force', '--auto-stash']);
    expect(args.goal).toBe('fix bug');
    expect(args.forceWorktree).toBe(true);
    expect(args.autoStash).toBe(true);
  });

  it('defaults force and autoStash to false', () => {
    const args = parseTeamArgs(['team', 'hello']);
    expect(args.forceWorktree).toBe(false);
    expect(args.autoStash).toBe(false);
  });
});
