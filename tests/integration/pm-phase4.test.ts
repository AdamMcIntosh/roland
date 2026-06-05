/**
 * Phase 4 integration test: cursorLaunch on dispatch packets, the pm_standup /
 * markdown views, and the pm-events audit timeline — over the real MCP surface.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-pm-p4-'));
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

describe('Phase 4 tools', () => {
  it('registers the new Phase 4 tools', () => {
    const tools = server.getTools();
    for (const t of ['pm_standup', 'get_pm_events']) {
      expect(tools).toContain(t);
    }
  });

  it('puts a cursorLaunch block on dispatch packets', async () => {
    const spawned = await call('spawn_task', {
      slug: 'p4',
      title: 'Build it',
      description: 'core logic',
      assignee: 'executor',
    });
    expect(spawned.dispatch.cursorLaunch).toContain('Launch in Cursor');
    expect(spawned.dispatch.cursorLaunch).toContain('composer-2.5');
    expect(spawned.dispatch.cursorLaunch).toContain('--- BRIEF ---');
  });

  it('pm_standup leads with blockers in markdown', async () => {
    await call('assign_task', { taskKey: 'task:p4', assignee: 'executor' });
    await call('mark_blocked', { taskKey: 'task:p4', need: 'which provider?', raisedBy: 'executor' });

    const standup = await call('pm_standup');
    expect(standup.markdown).toContain('🔴 Unblock first');
    expect(standup.markdown).toContain('unblock_task');
    expect(standup.context.summary.blocked).toBe(1);

    // get_team_context with format:markdown returns the same shape.
    const ctxMd = await call('get_team_context', { format: 'markdown' });
    expect(typeof ctxMd.markdown).toBe('string');
    expect(ctxMd.markdown).toContain('Unblock first');
  });

  it('records a lifecycle timeline in pm-events', async () => {
    const res = await call('get_pm_events', { limit: 50 });
    const actions = res.events.map((e: any) => e.action);
    expect(actions).toContain('spawn');
    expect(actions).toContain('assign');
    expect(actions).toContain('block');

    // markdown timeline + the on-disk log both exist.
    const md = await call('get_pm_events', { format: 'markdown' });
    expect(md.markdown).toContain('Timeline');
    expect(fs.existsSync(path.join(dir, '.roland', 'pm-events.log'))).toBe(true);
  });
});
