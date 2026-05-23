/**
 * Phase 4 unit tests: the pure Markdown renderers.
 * They take structures and return strings, so we assert on the rendered text:
 * blockers lead, the exact unblock call is embedded, usage is token-centric,
 * and the launch block names the model.
 */

import { describe, it, expect } from 'vitest';
import {
  renderStandup,
  renderUsage,
  renderCursorLaunch,
  renderBoard,
  renderTimeline,
} from '../../src/pm/render.js';
import type { TeamContext, TeamUsage, TaskView } from '../../src/pm/types.js';

const emptyUsage: TeamUsage = {
  byEngineer: {},
  byModel: {},
  byTask: {},
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalRequests: 0,
  note: 'Cursor subscription',
};

function ctx(partial: Partial<TeamContext>): TeamContext {
  return {
    directive: 'test',
    summary: { open: 0, in_progress: 0, blocked: 0, in_review: 0, done: 0 },
    needsAttention: [],
    blockers: [],
    activeTasks: [],
    readyToStart: [],
    inbox: [],
    recentDecisions: [],
    nextActions: [],
    usage: emptyUsage,
    ...partial,
  };
}

describe('renderStandup', () => {
  it('shows an idle state when the board is empty', () => {
    const md = renderStandup(ctx({}));
    expect(md).toContain('Nothing on the board yet');
  });

  it('leads with blockers and embeds the exact unblock call', () => {
    const md = renderStandup(
      ctx({
        directive: '⚠ 1 blocked task(s). UNBLOCK before starting new work.',
        summary: { open: 0, in_progress: 0, blocked: 1, in_review: 0, done: 0 },
        blockers: [{ key: 'blocker:x', status: 'open', value: { taskKey: 'task:a', need: 'which db?', raisedBy: 'executor' }, createdAt: Date.now() }],
        needsAttention: [
          {
            kind: 'blocker',
            priority: 100,
            taskKey: 'task:a',
            blockerKey: 'blocker:x',
            reason: '"A" blocked — needs: which db?',
            action: 'unblock_task { taskKey: "task:a", blockerKey: "blocker:x", resolution: "<your decision>" }',
          },
        ],
        nextActions: ['unblock_task { taskKey: "task:a", blockerKey: "blocker:x", resolution: "<your decision>" }'],
      })
    );
    expect(md).toContain('🔴 Unblock first (1)');
    expect(md).toContain('unblock_task { taskKey: "task:a", blockerKey: "blocker:x"');
    // Blocker section must appear before the board summary.
    expect(md.indexOf('Unblock first')).toBeLessThan(md.indexOf('**Board:**'));
  });
});

describe('renderUsage', () => {
  it('renders token-centric attribution', () => {
    const usage: TeamUsage = {
      ...emptyUsage,
      byEngineer: { executor: { inputTokens: 1000, outputTokens: 500, requests: 1, model: 'composer-2.5-standard' } },
      byTask: { 'task:a': { inputTokens: 1000, outputTokens: 500, requests: 1 } },
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalRequests: 1,
    };
    const md = renderUsage(usage);
    expect(md).toContain('By engineer');
    expect(md).toContain('executor');
    expect(md).toContain('composer-2.5-standard');
    expect(md).not.toContain('$'); // usage, not dollars
  });
});

describe('renderCursorLaunch', () => {
  it('names the model and includes the brief', () => {
    const md = renderCursorLaunch({
      taskKey: 'task:a',
      engineer: 'executor',
      model: 'composer-2.5-standard',
      brief: 'do the thing',
      contextFiles: ['src/a.ts'],
    });
    expect(md).toContain('Launch in Cursor');
    expect(md).toContain('composer-2.5-standard');
    expect(md).toContain('src/a.ts');
    expect(md).toContain('do the thing');
  });
});

describe('renderBoard / renderTimeline', () => {
  it('groups tasks by status', () => {
    const tasks: TaskView[] = [
      { key: 'task:a', status: 'open', rev: 1, updatedAt: Date.now(), value: { title: 'A', description: '', dependsOn: [], priority: 'normal', artifactKeys: [], blockerKeys: [], usage: { inputTokens: 0, outputTokens: 0, requests: 0 } } },
    ];
    expect(renderBoard(tasks)).toContain('**task:a** A');
  });

  it('renders an empty timeline gracefully', () => {
    expect(renderTimeline([])).toContain('no events yet');
  });
});
