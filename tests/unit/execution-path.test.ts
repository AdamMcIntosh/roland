import { describe, expect, it } from 'vitest';
import {
  classifyExecutionPath,
  detectForceTeam,
  EXECUTION_PATH_FRAMEWORK,
  stripForceTeamTriggers,
} from '../../src/rco/execution-path.js';

describe('classifyExecutionPath', () => {
  it('routes single-file comment edits to direct', () => {
    const decision = classifyExecutionPath('Add a comment to src/index.js');
    expect(decision.path).toBe('direct');
    expect(decision.estimatedMinutes).toBeLessThan(30);
    expect(decision.teamOffer).toBeNull();
    expect(decision.forced).toBeUndefined();
    expect(decision.reasons.some((r) => r.includes('comment'))).toBe(true);
  });

  it('forces team path when --force-team is present', () => {
    const decision = classifyExecutionPath('Add a comment to src/index.js --force-team');
    expect(decision.path).toBe('team');
    expect(decision.forced).toBe(true);
    expect(decision.cleanedGoal).toBe('Add a comment to src/index.js');
    expect(decision.teamOffer).toMatch(/forcing full team mission/i);
    expect(decision.teamOffer).toContain('Add a comment to src/index.js');
    expect(decision.teamOffer).toMatch(/no confirmation needed/i);
    expect(decision.summary).toContain('force-team override');
    expect(decision.reasons.some((r) => r.includes('Force-team override'))).toBe(true);
  });

  it('forces team path for "full team" phrasing', () => {
    const decision = classifyExecutionPath('Just do the full team run: improve the logger');
    expect(decision.path).toBe('team');
    expect(decision.forced).toBe(true);
    expect(detectForceTeam('Just do the full team run: improve the logger')).toBe(true);
  });

  it('stripForceTeamTriggers removes all accepted triggers', () => {
    expect(stripForceTeamTriggers('Add a comment to src/index.js --force-team')).toBe(
      'Add a comment to src/index.js',
    );
    expect(stripForceTeamTriggers('force team: fix the auth bug')).toBe('fix the auth bug');
    expect(stripForceTeamTriggers('run as team on the payment module')).toBe('on the payment module');
  });

  it('routes structured logging implementation to team', () => {
    const decision = classifyExecutionPath('Implement structured request logging with pino');
    expect(decision.path).toBe('team');
    expect(decision.estimatedMinutes).toBeGreaterThanOrEqual(45);
    expect(decision.teamOffer).toContain('roland team');
    expect(decision.teamOffer).toContain('Implement structured request logging with pino');
    expect(decision.reasons.some((r) => r.startsWith('Team:'))).toBe(true);
  });

  it('routes payment service refactor with blackboard to team', () => {
    const decision = classifyExecutionPath(
      'Refactor the payment service to use Command Blackboard',
    );
    expect(decision.path).toBe('team');
    expect(decision.teamOffer).toMatch(/full team mission/i);
    expect(decision.reasons.some((r) => r.includes('refactor'))).toBe(true);
    expect(decision.reasons.some((r) => r.includes('Blackboard'))).toBe(true);
  });

  it('routes simple questions to direct', () => {
    const decision = classifyExecutionPath('Why is the login endpoint returning 401?');
    expect(decision.path).toBe('direct');
    expect(decision.summary).toContain('Direct');
  });

  it('exposes framework text for orchestrator prompts', () => {
    expect(EXECUTION_PATH_FRAMEWORK).toContain('Execution Path Triage');
    expect(EXECUTION_PATH_FRAMEWORK).toContain('roland team');
    expect(EXECUTION_PATH_FRAMEWORK).toContain('Force-team override');
    expect(EXECUTION_PATH_FRAMEWORK).toContain('--force-team');
  });
});
