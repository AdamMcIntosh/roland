import { describe, it, expect } from 'vitest';
import {
  stripMissionNoise,
  inferCommitType,
  inferScope,
  formatCommitSubject,
  buildConventionalPrTitle,
  buildPrDescription,
  buildTaskCommitMessage,
  isLegacyPrTitle,
  migrateLegacyPrTitle,
  formatPrFromGoal,
  isLegacyPrBody,
  migrateLegacyPrBody,
  suggestPrCleanup,
  cleanPrDescription,
  extractShortSummary,
  isNoisyPrContent,
  rebuildPrBodyFromNoise,
  type PrFormatTaskInput,
  type PrFormatContext,
} from '../../src/rco/pr-format.js';

/** Factory — fresh task input per test (no shared mutable state). */
function makeTask(overrides: Partial<PrFormatTaskInput> = {}): PrFormatTaskInput {
  return {
    id: 'task-1',
    title: 'Implement feature',
    agent: 'executor',
    ...overrides,
  };
}

function makeContext(overrides: Partial<PrFormatContext> = {}): PrFormatContext {
  return {
    goal: 'Improve PR title quality',
    runId: 'run-abc123',
    ...overrides,
  };
}

describe('stripMissionNoise', () => {
  it('removes mission, task, and Roland prefixes', () => {
    expect(
      stripMissionNoise('Task task-1: [Mission: PR-cleanup] Implement clean PR title/description convention'),
    ).toBe('Implement clean PR title/description convention');
    expect(stripMissionNoise('Roland: Add rate limiting to the Express API')).toBe(
      'Add rate limiting to the Express API',
    );
    expect(stripMissionNoise('[Mission: mobile-first] Team Goal: Fix dashboard layout')).toBe(
      'Fix dashboard layout',
    );
  });

  it('removes priority and alternate task-id prefixes', () => {
    expect(stripMissionNoise('[P2 active] Add health check endpoint')).toBe('Add health check endpoint');
    expect(stripMissionNoise('Task-3: Wire git workflow')).toBe('Wire git workflow');
  });

  it('collapses whitespace and returns empty for blank input', () => {
    expect(stripMissionNoise('  multiple   spaces   here  ')).toBe('multiple spaces here');
    expect(stripMissionNoise('')).toBe('');
    expect(stripMissionNoise('   ')).toBe('');
  });
});

describe('inferCommitType', () => {
  it('selects fix, refactor, docs, test, and chore from keywords', () => {
    expect(inferCommitType('Fix crash in login flow')).toBe('fix');
    expect(inferCommitType('Refactor loop engine escalation')).toBe('refactor');
    expect(inferCommitType('Update readme documentation')).toBe('docs');
    expect(inferCommitType('Add vitest coverage for pr-format')).toBe('test');
    expect(inferCommitType('Bump deps and update ci config')).toBe('chore');
  });

  it('defaults to feat when no keyword matches', () => {
    expect(inferCommitType('Implement clean PR title convention')).toBe('feat');
  });

  it('does not infer refactor from mission noise before stripping', () => {
    const noisy = '[Mission: PR-cleanup] Implement clean PR title/description convention';
    expect(inferCommitType(noisy)).toBe('feat');
    expect(inferCommitType(stripMissionNoise(noisy))).toBe('feat');
  });
});

describe('inferScope', () => {
  it('maps area keywords to conventional scopes', () => {
    expect(inferScope('Fix mobile dashboard layout')).toBe('dashboard');
    expect(inferScope('Implement clean PR title and git branch workflow')).toBe('git');
    expect(inferScope('Tune loop-engine critique retry')).toBe('loop');
    expect(inferScope('Update PM team orchestration blackboard')).toBe('pm');
    expect(inferScope('Wire MCP cursor agent tools')).toBe('mcp');
    expect(inferScope('Add express API route middleware')).toBe('api');
    expect(inferScope('Fix JWT auth token session')).toBe('auth');
  });

  it('falls back to roland when no scope keyword matches', () => {
    expect(inferScope('Implement generic utility')).toBe('roland');
  });
});

describe('formatCommitSubject', () => {
  it('lowercases imperative subject and strips trailing punctuation', () => {
    expect(formatCommitSubject('Implement Clean PR Title!')).toBe('implement Clean PR Title');
    expect(formatCommitSubject('Task task-1: Fix bug in handler.')).toBe('fix bug in handler');
  });

  it('returns safe default for empty input', () => {
    expect(formatCommitSubject('')).toBe('update roland task output');
    expect(formatCommitSubject('   ')).toBe('update roland task output');
  });
});

describe('buildConventionalPrTitle', () => {
  it('produces conventional-commit title without mission prefixes (Sparrow example)', () => {
    const task = makeTask({
      title: 'Task task-1: [Mission: PR-cleanup] Implement clean PR title/description convention',
    });
    expect(buildConventionalPrTitle(task)).toBe(
      'feat(git): implement clean PR title/description convention',
    );
  });

  it('infers fix type and dashboard scope from task wording', () => {
    const task = makeTask({
      title: 'Fix broken mobile dashboard layout on iPhone',
      description: 'Regression in responsive CSS',
    });
    expect(buildConventionalPrTitle(task)).toBe('fix(dashboard): fix broken mobile dashboard layout on iPhone');
  });

  it('enforces max 72 characters with ellipsis truncation', () => {
    const longTitle =
      'Implement comprehensive end-to-end validation for autogenerated titles and descriptions across all Roland missions';
    const task = makeTask({ title: longTitle });
    const result = buildConventionalPrTitle(task);
    expect(result.length).toBeLessThanOrEqual(72);
    expect(result).toMatch(/^feat\(roland\): /);
    expect(result.endsWith('…')).toBe(true);
  });

  it('handles empty title with safe fallback subject', () => {
    const task = makeTask({ title: '   ' });
    const result = buildConventionalPrTitle(task);
    expect(result).toMatch(/^feat\(roland\): update roland task output$/);
    expect(result.length).toBeLessThanOrEqual(72);
  });
});

describe('isLegacyPrTitle', () => {
  it('detects legacy Roland/mission/task prefixes', () => {
    expect(isLegacyPrTitle('Task task-1: [Mission: PR-cleanup] Improve titles')).toBe(true);
    expect(isLegacyPrTitle('Roland: Add rate limiting')).toBe(true);
    expect(isLegacyPrTitle('[Mission: PR-cleanup] Team Goal: Clean titles')).toBe(true);
    expect(isLegacyPrTitle('Task-2: Wire git workflow')).toBe(true);
  });

  it('returns false for conventional or empty titles', () => {
    expect(isLegacyPrTitle('feat(git): implement clean pr title convention')).toBe(false);
    expect(isLegacyPrTitle('fix(dashboard): restore mobile layout')).toBe(false);
    expect(isLegacyPrTitle('')).toBe(false);
    expect(isLegacyPrTitle('   ')).toBe(false);
  });
});

describe('migrateLegacyPrTitle', () => {
  it('migrates legacy titles to conventional format', () => {
    const legacy = 'Task task-1: [Mission: PR-cleanup] Implement clean PR title/description convention';
    expect(migrateLegacyPrTitle(legacy)).toBe(
      'feat(git): implement clean PR title/description convention',
    );
  });

  it('returns null for already-clean titles', () => {
    const clean = 'feat(git): implement clean pr title convention';
    expect(migrateLegacyPrTitle(clean)).toBeNull();
  });

  it('extracts seed from PR body Goal line when title strips to empty', () => {
    const body = [
      '## Summary',
      '**Goal:** [Mission: PR-cleanup] Implement clean PR title convention',
      '',
      '## Key changes',
      '- Formatter module',
    ].join('\n');
    expect(migrateLegacyPrTitle('[Mission: PR-cleanup]', body)).toBe(
      'feat(git): implement clean PR title convention',
    );
  });

  it('returns null when migration cannot derive a subject', () => {
    expect(migrateLegacyPrTitle('Roland:', '')).toBeNull();
    expect(migrateLegacyPrTitle('', '')).toBeNull();
  });
});

describe('buildPrDescription', () => {
  it('includes required sections in order: Summary, Key Changes, Testing, Related', () => {
    const task = makeTask({
      id: 'task-2',
      agent: 'executor',
      title: 'Implement clean PR title/description convention',
      description: 'Add formatter module\nWire into task git workflow',
    });
    const ctx = makeContext({
      goal: '[Mission: PR-cleanup] Improve PR Title & Description Quality',
      runId: 'run-xyz',
      missionUrl: 'http://127.0.0.1:8081',
    });

    const body = buildPrDescription(task, ctx);

    const summaryIdx = body.indexOf('**Summary**');
    const keyIdx = body.indexOf('**Key Changes**');
    const testingIdx = body.indexOf('**Testing**');
    const relatedIdx = body.indexOf('**Related**');

    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(summaryIdx);
    expect(testingIdx).toBeGreaterThan(keyIdx);
    expect(relatedIdx).toBeGreaterThan(testingIdx);

    expect(body).toContain('Add formatter module');
    expect(body).toContain('- Add formatter module');
    expect(body).toContain('- Wire into task git workflow');
    expect(body).toContain('Roland PM team workflow');
    expect(body).toContain('Task `task-2` (executor)');
    expect(body).toContain('Improve PR Title & Description Quality');
    expect(body).toContain('Run `run-xyz`');
    expect(body).toContain('http://127.0.0.1:8081');
    expect(body).not.toContain('## Roland Run');
    expect(body).not.toContain('PRODUCTION HARDENING');
  });

  it('strips PM production hardening checklist from task description', () => {
    const noisyDescription = [
      'Implement rate limiting middleware for the Express API.',
      '',
      '⚠️ PRODUCTION HARDENING — MANDATORY: Before marking this task done, verify each item that applies:',
      '- [ ] EF Core migrations: any schema change has a migration file',
      '- [ ] Input validation: all request inputs validated with FluentValidation',
      '- [ ] Error responses: all error paths return RFC 7807 ProblemDetails',
    ].join('\n');
    const task = makeTask({ description: noisyDescription });
    const body = buildPrDescription(task, makeContext());

    expect(body).toContain('rate limiting middleware');
    expect(body).not.toContain('EF Core');
    expect(body).not.toContain('FluentValidation');
    expect(body).not.toContain('ProblemDetails');
    expect(body).not.toContain('PRODUCTION HARDENING');
  });

  it('strips Sparrow agent completion report from task description', () => {
    const noisyDescription = [
      'Add structured logging to auth routes.',
      '',
      '## Sparrow — Task Complete',
      '**Objective:** Wire pino logger',
      '**Changes:** Updated auth.ts',
      '**Wiring:** Mounted middleware in index.ts',
    ].join('\n');
    const task = makeTask({ description: noisyDescription });
    const body = buildPrDescription(task, makeContext());

    expect(body).toContain('structured logging');
    expect(body).not.toContain('Sparrow — Task Complete');
    expect(body).not.toContain('**Wiring:**');
  });

  it('uses custom testingNotes when provided', () => {
    const task = makeTask({ description: 'Formatter only' });
    const ctx = makeContext({ testingNotes: '- npx vitest run tests/unit/pr-format.test.ts — 12/12 pass' });
    const body = buildPrDescription(task, ctx);
    expect(body).toContain('npx vitest run tests/unit/pr-format.test.ts');
    expect(body).not.toContain('Manual review recommended');
  });

  it('applies safe defaults for empty task description', () => {
    const task = makeTask({ title: 'Task task-9: Chore bump', description: '' });
    const body = buildPrDescription(task, makeContext());
    expect(body).toContain('**Summary**');
    expect(body).toContain('Chore bump');
    expect(body).toContain('**Key Changes**');
    expect(body).not.toContain('Task task-9:');
  });
});

describe('buildTaskCommitMessage', () => {
  it('combines conventional title with task closure footer', () => {
    const task = makeTask({
      id: 'task-1',
      title: 'Task task-1: [Mission: PR-cleanup] Implement clean PR title/description convention',
    });
    const message = buildTaskCommitMessage(task);
    expect(message).toBe(
      [
        'feat(git): implement clean PR title/description convention',
        '',
        'Closes task task-1',
        '',
        'Generated by Roland',
      ].join('\n'),
    );
  });
});

describe('formatPrFromGoal', () => {
  it('produces clean title and structured body from a mission goal', () => {
    const goal = 'Task task-1: [Mission: PR-cleanup] Implement clean PR title convention';
    const { title, body } = formatPrFromGoal(goal, { runId: 'run-web-1' });
    expect(title).toBe('feat(git): implement clean PR title convention');
    expect(isLegacyPrTitle(title)).toBe(false);
    expect(body).toContain('**Summary**');
    expect(body).toContain('**Key Changes**');
    expect(body).toContain('run-web-1');
    expect(body).not.toContain('[Mission:');
    expect(body).not.toContain('Task task-1:');
  });

  it('includes optional Impact section', () => {
    const { body } = formatPrFromGoal('Add health check', {
      impactNote: 'Improves deploy smoke-test reliability.',
    });
    expect(body).toContain('**Impact**');
    expect(body).toContain('deploy smoke-test');
  });
});

describe('cleanPrDescription', () => {
  it('removes .NET production hardening checklist blocks', () => {
    const raw = [
      'Add JWT auth middleware.',
      '',
      '⚠️ PRODUCTION HARDENING — MANDATORY: Before marking this task done, verify each item that applies:',
      '- [ ] EF Core migrations: any schema change has a migration file',
      '- [ ] Input validation: FluentValidation or DataAnnotations at the API boundary',
      '- [ ] Error responses: RFC 7807 ProblemDetails',
      '- [ ] CancellationToken: every async method accepts CancellationToken',
    ].join('\n');
    const cleaned = cleanPrDescription(raw);
    expect(cleaned).toContain('JWT auth middleware');
    expect(cleaned).not.toMatch(/EF Core|FluentValidation|ProblemDetails|CancellationToken/i);
  });

  it('removes Sparrow constraints and agent completion sections', () => {
    const raw = [
      'Wire CORS middleware.',
      '',
      '## Sparrow Handoff Protocol (Roland → You)',
      'Read peer files first.',
      '',
      '## Sparrow — Task Complete',
      '**Defensive:** Added null checks',
    ].join('\n');
    const cleaned = cleanPrDescription(raw);
    expect(cleaned).toContain('CORS middleware');
    expect(cleaned).not.toContain('Sparrow Handoff');
    expect(cleaned).not.toContain('Task Complete');
  });

  it('strips mission and task prefixes from raw text', () => {
    const raw = 'Task task-1: [Mission: auth-hardening] Add rate limiting to login endpoint';
    expect(cleanPrDescription(raw)).toBe('Add rate limiting to login endpoint');
  });

  it('falls back to generic summary when cleaning removes all useful content', () => {
    const raw = '⚠️ PRODUCTION HARDENING — MANDATORY: verify EF Core migrations and ProblemDetails';
    const cleaned = cleanPrDescription(raw);
    expect(cleaned).toBe('Implements the scoped deliverable for this change.');
    expect(cleaned).not.toContain('EF Core');
  });

  it('detects noisy PR content', () => {
    expect(isNoisyPrContent('## Roland Run\n**Goal:** Fix auth')).toBe(true);
    expect(isNoisyPrContent('**Summary**\nClean PR.\n**Key Changes**\n- x')).toBe(false);
  });
});

describe('extractShortSummary', () => {
  it('returns first one or two sentences without mission noise', () => {
    const text = 'Task task-2: [Mission: x] Implement dashboard mobile layout. Refactor CSS grid.';
    const summary = extractShortSummary(text);
    expect(summary).toContain('Implement dashboard mobile layout');
    expect(summary).not.toContain('[Mission:');
    expect(summary).not.toContain('Task task-2');
  });
});

describe('legacy PR body migration', () => {
  it('detects legacy Roland Run bodies', () => {
    expect(isLegacyPrBody('## Roland Run\n\n**Goal:** Fix auth\n')).toBe(true);
    expect(isLegacyPrBody('**Summary**\n\nDone\n\n**Key Changes**\n- x\n')).toBe(false);
  });

  it('detects noisy PM checklist bodies as legacy', () => {
    const noisy = 'Implement API\n\n⚠️ PRODUCTION HARDENING — MANDATORY:\n- [ ] EF Core migrations';
    expect(isLegacyPrBody(noisy)).toBe(true);
  });

  it('migrates legacy body to structured sections', () => {
    const legacyBody = '## Roland Run\n\n**Goal:** Implement rate limiting\n\nGenerated automatically by Roland.';
    const migrated = migrateLegacyPrBody('Roland: Implement rate limiting', legacyBody);
    expect(migrated).toContain('**Summary**');
    expect(migrated).toContain('rate limiting');
    expect(migrated).not.toContain('## Roland Run');
    expect(migrated).not.toContain('Generated automatically');
  });

  it('rebuilds noisy task output into clean template', () => {
    const noisyBody = [
      'Task task-1: [Mission: x] Add health check endpoint.',
      '',
      '⚠️ PRODUCTION HARDENING — MANDATORY:',
      '- [ ] FluentValidation at API boundary',
      '## Sparrow — Task Complete',
      '**Changes:** Added /health route',
    ].join('\n');
    const rebuilt = rebuildPrBodyFromNoise('feat(api): add health check', noisyBody);
    expect(rebuilt).toContain('**Summary**');
    expect(rebuilt).toContain('health check');
    expect(rebuilt).not.toContain('FluentValidation');
    expect(rebuilt).not.toContain('Sparrow');
  });
});

describe('suggestPrCleanup', () => {
  it('suggests title and body fixes for legacy PRs', () => {
    const suggestion = suggestPrCleanup(
      'Task task-1: [Mission: PR-cleanup] Implement clean PR titles',
      '## Roland Run\n\n**Goal:** Implement clean PR titles\n',
    );
    expect(suggestion.titleChanged).toBe(true);
    expect(suggestion.title).toBe('feat(git): implement clean PR titles');
    expect(suggestion.bodyChanged).toBe(true);
    expect(suggestion.body).toContain('**Summary**');
  });

  it('cleans noisy PM bodies even when title is already conventional', () => {
    const noisyBody = [
      'Add structured logging.',
      '⚠️ PRODUCTION HARDENING — MANDATORY:',
      '- [ ] ILogger<T> structured logging',
      '- [ ] ProblemDetails error responses',
    ].join('\n');
    const suggestion = suggestPrCleanup('feat(api): add structured logging', noisyBody);
    expect(suggestion.bodyChanged).toBe(true);
    expect(suggestion.body).toContain('**Summary**');
    expect(suggestion.body).not.toContain('ILogger');
    expect(suggestion.body).not.toContain('ProblemDetails');
  });

  it('returns no changes for already-clean PRs', () => {
    const suggestion = suggestPrCleanup(
      'feat(git): implement clean pr titles',
      '**Summary**\n\nDone\n\n**Key Changes**\n- x\n\n**Testing**\n- vitest\n\n**Related**\n- task',
    );
    expect(suggestion.titleChanged).toBe(false);
    expect(suggestion.bodyChanged).toBe(false);
  });
});

describe('task-git-workflow wired path', () => {
  it('mirrors onTaskComplete PR title/body assembly from task-git-workflow.ts', () => {
    const task = makeTask({
      id: 'task-1',
      title: 'Task task-1: [Mission: PR-cleanup] Implement clean PR title/description convention',
      description: 'Standardize autogenerated PR titles and descriptions.',
      agent: 'executor',
    });
    const ctx: PrFormatContext = {
      goal: '[Mission: PR-cleanup] Team Goal: Improve PR Title & Description Quality',
      runId: 'run-mission-pr-cleanup',
      missionUrl: 'http://127.0.0.1:8081',
    };

    const prTitle = buildConventionalPrTitle(task);
    const prBody = buildPrDescription(task, ctx);

    expect(prTitle).toBe('feat(git): implement clean PR title/description convention');
    expect(isLegacyPrTitle(prTitle)).toBe(false);
    expect(prBody).toContain('**Summary**');
    expect(prBody).toContain('**Key Changes**');
    expect(prBody).toContain('**Testing**');
    expect(prBody).toContain('**Related**');
    expect(prBody).toContain('task-1');
    expect(prBody).toContain('run-mission-pr-cleanup');
    expect(prBody).not.toContain('PRODUCTION HARDENING');
  });
});
