/**
 * Integration test: the full PM loop over the real MCP tool surface.
 * spawn → assign → block → unblock → complete → review → synthesize,
 * checking that get_team_context reflects each step and surfaces blockers first.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig } from '../../src/config/config-loader.js';
import { McpServer } from '../../src/server/mcp-server.js';

let dir: string;
let server: McpServer;
const prevRoot = process.env.ROLAND_PROJECT_ROOT;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-pm-mcp-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  process.env.ROLAND_PROJECT_ROOT = dir;
  server = new McpServer(await loadConfig());
});

afterAll(() => {
  if (prevRoot === undefined) delete process.env.ROLAND_PROJECT_ROOT;
  else process.env.ROLAND_PROJECT_ROOT = prevRoot;
  fs.rmSync(dir, { recursive: true, force: true });
});

function call(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  const handler = server.getTool(tool);
  if (!handler) throw new Error(`tool not registered: ${tool}`);
  return handler(args) as Promise<any>;
}

describe('PM tools', () => {
  it('registers all ten PM tools', () => {
    const tools = server.getTools();
    for (const t of [
      'get_pm_playbook', 'get_team_context', 'list_team', 'spawn_task', 'assign_task',
      'mark_blocked', 'unblock_task', 'complete_task', 'review_task', 'synthesize_deliverable',
    ]) {
      expect(tools).toContain(t);
    }
  });

  it('serves the EM playbook', async () => {
    const res = await call('get_pm_playbook');
    expect(res.playbook).toContain('PRIME DIRECTIVE');
    expect(res.playbook).toContain('UNBLOCK FIRST');
  });

  it('runs the full loop and reflects state in get_team_context', async () => {
    // spawn
    const spawned = await call('spawn_task', {
      slug: 'login-ui',
      title: 'Build login UI',
      description: 'Implement the login form with validation',
      acceptanceCriteria: 'Handles 401 with an error state',
    });
    expect(spawned.task.status).toBe('open');
    expect(typeof spawned.dispatch.recommendedModel).toBe('string');
    expect(spawned.dispatch.brief).toContain('task:login-ui');

    // assign
    const assigned = await call('assign_task', { taskKey: 'task:login-ui', assignee: 'executor' });
    expect(assigned.task.status).toBe('in_progress');

    // block → get_team_context surfaces the blocker FIRST and directs to unblock
    const blocked = await call('mark_blocked', {
      taskKey: 'task:login-ui',
      need: 'Which auth provider?',
      raisedBy: 'executor',
    });
    expect(blocked.task.status).toBe('blocked');

    let ctx = await call('get_team_context');
    expect(ctx.summary.blocked).toBe(1);
    expect(ctx.directive).toMatch(/UNBLOCK/i);
    expect(ctx.needsAttention[0].kind).toBe('blocker');
    expect(ctx.nextActions[0]).toMatch(/unblock_task/);

    // unblock
    const unblocked = await call('unblock_task', {
      taskKey: 'task:login-ui',
      blockerKey: blocked.blocker.key,
      resolution: 'Use the existing OAuth provider.',
    });
    expect(unblocked.task.status).toBe('in_progress');

    // complete → in_review
    const completed = await call('complete_task', {
      taskKey: 'task:login-ui',
      summary: 'Login form with 401 handling',
      content: '<diff>',
      author: 'executor',
    });
    expect(completed.task.status).toBe('in_review');

    ctx = await call('get_team_context');
    expect(ctx.summary.in_review).toBe(1);
    expect(ctx.needsAttention.some((a: any) => a.kind === 'review')).toBe(true);

    // review accept → done
    const reviewed = await call('review_task', { taskKey: 'task:login-ui', decision: 'accept' });
    expect(reviewed.task.status).toBe('done');

    // synthesize
    const deliverable = await call('synthesize_deliverable');
    expect(deliverable.summary).toContain('Build login UI');
  });
});
