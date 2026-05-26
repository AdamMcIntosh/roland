/**
 * Integration test: the coordination MCP tools round-trip through the real
 * McpServer registration, and state lands in the project-scoped .roland/ dir
 * resolved from ROLAND_PROJECT_ROOT.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-coord-mcp-'));
  // Make the project root a real repo so paths.ts resolves predictably even
  // without the env override, then also set the override to be explicit.
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  process.env.ROLAND_PROJECT_ROOT = dir;
  const config = await loadConfig();
  server = new McpServer(config);
});

afterAll(() => {
  if (prevRoot === undefined) delete process.env.ROLAND_PROJECT_ROOT;
  else process.env.ROLAND_PROJECT_ROOT = prevRoot;
  fs.rmSync(dir, { recursive: true, force: true });
});

function call(tool: string, args: Record<string, unknown>): Promise<any> {
  const handler = server.getTool(tool);
  if (!handler) throw new Error(`tool not registered: ${tool}`);
  return handler(args) as Promise<any>;
}

describe('coordination MCP tools', () => {
  it('registers all five coordination tools', () => {
    const tools = server.getTools();
    for (const t of ['blackboard_post', 'blackboard_read', 'blackboard_patch', 'bus_send', 'bus_poll']) {
      expect(tools).toContain(t);
    }
  });

  it('blackboard_post + blackboard_read round-trip and persist under .roland/', async () => {
    const posted = await call('blackboard_post', {
      key: 'task:demo',
      type: 'task',
      value: { goal: 'ship phase 1' },
      author: 'lead-pm',
      status: 'open',
    });
    expect(posted.ok).toBe(true);
    expect(posted.entry.rev).toBe(1);

    const read = await call('blackboard_read', { type: 'task' });
    expect(read.count).toBe(1);
    expect(read.entries[0].key).toBe('task:demo');

    expect(fs.existsSync(path.join(dir, '.roland', 'blackboard.json'))).toBe(true);
  });

  it('blackboard_post returns a structured conflict on rev mismatch', async () => {
    await call('blackboard_post', { key: 'k:conflict', type: 'fact', value: 1, author: 'a' });
    const res = await call('blackboard_post', { key: 'k:conflict', type: 'fact', value: 2, author: 'b', expectedRev: 99 });
    expect(res.ok).toBe(false);
    expect(res.conflict.key).toBe('k:conflict');
    expect(res.conflict.actual).toBe(1);
  });

  it('blackboard_patch transitions a task and bumps rev', async () => {
    await call('blackboard_post', { key: 'task:p', type: 'task', value: {}, author: 'pm', status: 'open' });
    const res = await call('blackboard_patch', { key: 'task:p', author: 'exec', changes: { status: 'done' } });
    expect(res.ok).toBe(true);
    expect(res.entry.status).toBe('done');
    expect(res.entry.rev).toBe(2);
  });

  it('bus_send + bus_poll deliver exactly once and report nextSince', async () => {
    await call('bus_send', { from: 'lead-pm', to: 'executor', body: 'pick up task:demo' });
    const first = await call('bus_poll', { recipient: 'executor' });
    expect(first.count).toBe(1);
    expect(first.messages[0].body).toBe('pick up task:demo');
    expect(typeof first.nextSince).toBe('number');

    const second = await call('bus_poll', { recipient: 'executor' });
    expect(second.count).toBe(0);

    expect(fs.existsSync(path.join(dir, '.roland', 'bus.json'))).toBe(true);
  });
});
