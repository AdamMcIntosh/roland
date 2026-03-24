/**
 * Unit Tests: New Modules
 *
 * Tests for goose-runner, migration-context, diff-engine, git-tools,
 * screenshot, permission-gate, and session-context utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';

// ============================================================================
// 1. goose-runner — normaliseGooseModel
// ============================================================================

import { normaliseGooseModel } from '../../src/utils/goose-runner.js';

describe('goose-runner: normaliseGooseModel', () => {
  it('maps claude-sonnet-4 to anthropic/ prefix on openrouter', () => {
    const result = normaliseGooseModel('claude-sonnet-4');
    expect(result).toEqual({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4' });
  });

  it('maps gpt-4o to openai/ prefix on openrouter', () => {
    const result = normaliseGooseModel('gpt-4o');
    expect(result).toEqual({ provider: 'openrouter', model: 'openai/gpt-4o' });
  });

  it('passes through a model that already contains a slash', () => {
    const result = normaliseGooseModel('anthropic/claude-sonnet-4');
    expect(result).toEqual({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4' });
  });

  it('maps deepseek-chat to deepseek/ prefix on openrouter', () => {
    const result = normaliseGooseModel('deepseek-chat');
    expect(result).toEqual({ provider: 'openrouter', model: 'deepseek/deepseek-chat' });
  });
});

// ============================================================================
// 2. migration-context
// ============================================================================

import {
  readContext,
  appendRule,
  appendDecision,
  buildContextBlock,
} from '../../src/utils/migration-context.js';

describe('migration-context', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-test-'));
    originalEnv = process.env['ROLAND_PROJECT_ROOT'];
    // Clear the env var so readContext uses the explicit projectRoot arg
    delete process.env['ROLAND_PROJECT_ROOT'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['ROLAND_PROJECT_ROOT'] = originalEnv;
    } else {
      delete process.env['ROLAND_PROJECT_ROOT'];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a default structure when no context file exists', () => {
    const ctx = readContext(tmpDir);
    expect(ctx.schemaVersion).toBe('1.0');
    expect(Array.isArray(ctx.rules)).toBe(true);
    expect(ctx.rules.length).toBe(0);
    expect(Array.isArray(ctx.decisions)).toBe(true);
    expect(ctx.decisions.length).toBe(0);
    expect(ctx.project).toHaveProperty('name');
  });

  it('appendRule adds a rule and assigns an auto-incremented ID', () => {
    const rule = appendRule('OldPattern', 'NewPattern', 'some notes', tmpDir);
    expect(rule.id).toBe('001');
    expect(rule.pattern).toBe('OldPattern');
    expect(rule.replacement).toBe('NewPattern');
    expect(rule.notes).toBe('some notes');

    const rule2 = appendRule('AnotherOld', 'AnotherNew', undefined, tmpDir);
    expect(rule2.id).toBe('002');

    const ctx = readContext(tmpDir);
    expect(ctx.rules.length).toBe(2);
  });

  it('appendDecision adds a decision with ID and rationale', () => {
    const decision = appendDecision('Use async/await', 'Cleaner error handling', tmpDir);
    expect(decision.id).toBe('001');
    expect(decision.description).toBe('Use async/await');
    expect(decision.rationale).toBe('Cleaner error handling');

    const ctx = readContext(tmpDir);
    expect(ctx.decisions.length).toBe(1);
  });

  it('buildContextBlock returns a formatted string containing rules and decisions', () => {
    appendRule('Dim x As Integer', 'int x = 0;', undefined, tmpDir);
    appendDecision('Use properties instead of public fields', 'Encapsulation', tmpDir);

    const block = buildContextBlock(tmpDir);
    expect(typeof block).toBe('string');
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('Dim x As Integer');
    expect(block).toContain('Use properties instead of public fields');
    expect(block).toContain('Roland Migration Context');
  });

  it('readContext returns a deep copy — mutating result does not affect next call', () => {
    const ctx1 = readContext(tmpDir);
    ctx1.rules.push({
      id: '999',
      pattern: 'mutated',
      replacement: 'value',
      addedAt: new Date().toISOString(),
    });

    const ctx2 = readContext(tmpDir);
    expect(ctx2.rules.length).toBe(0);
  });
});

// ============================================================================
// 3. diff-engine — generateDiff
// ============================================================================

import { generateDiff } from '../../src/utils/diff-engine.js';

describe('diff-engine: generateDiff', () => {
  it('detects a changed line and reports correct addition/deletion counts', () => {
    const result = generateDiff('hello\nworld', 'hello\nearth');
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.hunks.length).toBeGreaterThan(0);
  });

  it('returns empty hunks when both inputs are identical', () => {
    const result = generateDiff('same content\nno diff', 'same content\nno diff');
    expect(result.hunks.length).toBe(0);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('markdownDiff contains + and - prefixed lines for a real change', () => {
    const result = generateDiff('hello\nworld', 'hello\nearth');
    expect(result.markdownDiff).toContain('+earth');
    expect(result.markdownDiff).toContain('-world');
  });

  it('markdownDiff indicates no changes for identical inputs', () => {
    const result = generateDiff('abc', 'abc');
    expect(result.markdownDiff).toContain('no changes');
  });
});

// ============================================================================
// 4. git-tools — export presence
// ============================================================================

import { gitStatus, gitDiff, gitLog, gitCommit } from '../../src/utils/git-tools.js';

describe('git-tools: exports', () => {
  it('gitStatus is exported as a function', () => {
    expect(typeof gitStatus).toBe('function');
  });

  it('gitDiff is exported as a function', () => {
    expect(typeof gitDiff).toBe('function');
  });

  it('gitLog is exported as a function', () => {
    expect(typeof gitLog).toBe('function');
  });

  it('gitCommit is exported as a function', () => {
    expect(typeof gitCommit).toBe('function');
  });
});

// ============================================================================
// 5. screenshot — analyzeScreenshot export
// ============================================================================

import { analyzeScreenshot } from '../../src/utils/screenshot.js';

describe('screenshot: exports', () => {
  it('analyzeScreenshot is exported as a function', () => {
    expect(typeof analyzeScreenshot).toBe('function');
  });
});

// ============================================================================
// 6. permission-gate
// ============================================================================

import {
  readPermissions,
  getPermissionBlock,
  buildPermissionBlock,
  DEFAULT_PERMISSIONS,
} from '../../src/utils/permission-gate.js';

describe('permission-gate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-perm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readPermissions returns default policy when no file exists in the directory', () => {
    const policy = readPermissions(tmpDir);
    expect(policy).toEqual(DEFAULT_PERMISSIONS);
    expect(policy.allow_shell).toBe(true);
    expect(policy.allow_write).toBe(true);
    expect(policy.allow_read).toBe(true);
  });

  it('buildPermissionBlock returns empty string for a fully permissive policy with no deny lists', () => {
    const permissivePolicy = {
      allow_shell: true,
      allow_write: true,
      allow_read: true,
      deny_commands: [],
      deny_paths: [],
      extra_instructions: '',
    };
    const block = buildPermissionBlock(permissivePolicy);
    expect(block).toBe('');
  });

  it('getPermissionBlock returns non-empty string when deny lists are populated', () => {
    const policy = {
      allow_shell: true,
      allow_write: true,
      allow_read: true,
      deny_commands: ['rm -rf /'],
      deny_paths: ['.env'],
      extra_instructions: '',
    };
    const policyFile = path.join(tmpDir, '.roland-permissions.json');
    fs.writeFileSync(policyFile, JSON.stringify(policy), 'utf-8');

    const block = getPermissionBlock(tmpDir);
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('rm -rf /');
  });
});

// ============================================================================
// 7. session-context — SessionContextManager
// ============================================================================

import { SessionContextManager } from '../../src/server/session-context.js';

describe('session-context: SessionContextManager', () => {
  let manager: SessionContextManager;
  let sessionId: string;

  beforeEach(() => {
    manager = new SessionContextManager();
    const session = manager.start('test task for unit tests');
    sessionId = session.id;
  });

  afterEach(() => {
    manager.delete(sessionId);
  });

  it('start() returns a session with an id and the given task', () => {
    const session = manager.start('another task');
    expect(session.id).toBeTruthy();
    expect(session.task).toBe('another task');
    manager.delete(session.id);
  });

  it('get() returns the session by id', () => {
    const session = manager.get(sessionId);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(sessionId);
    expect(session!.task).toBe('test task for unit tests');
  });

  it('update() with note appends the note to the session', () => {
    const updated = manager.update(sessionId, { note: 'test note content' });
    expect(updated).not.toBeNull();
    expect(updated!.notes).toContain('test note content');
  });

  it('formatForSubagent() returns a non-empty string for an existing session', () => {
    const output = manager.formatForSubagent(sessionId);
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('test task for unit tests');
  });

  it('delete() removes the session so get() returns null', () => {
    const extraSession = manager.start('ephemeral task');
    const deleted = manager.delete(extraSession.id);
    expect(deleted).toBe(true);
    expect(manager.get(extraSession.id)).toBeNull();
  });
});
