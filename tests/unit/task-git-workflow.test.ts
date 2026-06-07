import { describe, it, expect } from 'vitest';
import {
  buildTaskBranchName,
  isExecutorAgent,
  slugifyTitle,
  shortTaskId,
  loadGitWorkflowConfig,
} from '../../src/rco/task-git-workflow.js';

describe('task-git-workflow', () => {
  it('slugifyTitle produces kebab-case slugs', () => {
    expect(slugifyTitle('Add Input Validation!')).toBe('add-input-validation');
    expect(slugifyTitle('')).toBe('task');
  });

  it('shortTaskId strips task prefix', () => {
    expect(shortTaskId('task-3')).toBe('3');
    expect(shortTaskId('task-12-fix-auth')).toBe('12-fix-auth');
  });

  it('buildTaskBranchName follows task-{id}-{slug} pattern', () => {
    const name = buildTaskBranchName('task-2', 'Add Git Workflow');
    expect(name).toMatch(/^task-2-add-git-workflow/);
    expect(name.length).toBeLessThanOrEqual(120);
  });

  it('isExecutorAgent identifies coding-lane implementers', () => {
    expect(isExecutorAgent('executor')).toBe(true);
    expect(isExecutorAgent('build-fixer')).toBe(true);
    expect(isExecutorAgent('test-author')).toBe(false);
    expect(isExecutorAgent('test-executor')).toBe(false);
    expect(isExecutorAgent('architect')).toBe(false);
    expect(isExecutorAgent('Lead-PM')).toBe(false);
  });

  it('loadGitWorkflowConfig respects env disable', () => {
    const prev = process.env.ROLAND_GIT_ENABLED;
    process.env.ROLAND_GIT_ENABLED = '0';
    const cfg = loadGitWorkflowConfig('/tmp/nonexistent-roland-state');
    expect(cfg.enabled).toBe(false);
    if (prev === undefined) delete process.env.ROLAND_GIT_ENABLED;
    else process.env.ROLAND_GIT_ENABLED = prev;
  });
});
