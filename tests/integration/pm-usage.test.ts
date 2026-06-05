/**
 * Phase 3 integration test: Cursor usage attribution + team recipes over the
 * real MCP tool surface. Proves dispatch packets carry Cursor model ids,
 * report_usage / complete_task attribute tokens to the right engineer+task at
 * $0 cost, get_team_usage rolls them up, and start_team_recipe seeds a graph.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig } from '../../src/config/config-loader.js';
import { McpServer } from '../../src/server/mcp-server.js';
import { getGlobalTracker } from '../../src/orchestrator/advanced-cost-tracker.js';

let dir: string;
let server: McpServer;
const prevRoot = process.env.ROLAND_PROJECT_ROOT;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-pm-usage-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  process.env.ROLAND_PROJECT_ROOT = dir;
  getGlobalTracker().clear(); // isolate usage records for this run
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

describe('Phase 3 PM tools', () => {
  it('registers the new Phase 3 tools', () => {
    const tools = server.getTools();
    for (const t of ['list_team_recipes', 'start_team_recipe', 'report_usage', 'get_team_usage']) {
      expect(tools).toContain(t);
    }
  });

  it('dispatches engineers on Cursor models with a rationale', async () => {
    const spawned = await call('spawn_task', {
      slug: 'svc',
      title: 'Build the service',
      description: 'Implement the core service logic',
      assignee: 'executor',
    });
    expect(spawned.dispatch.recommendedModel).toBe('composer-2.5');
    expect(spawned.dispatch.routing.provider).toBe('cursor');
    expect(spawned.dispatch.routing.lane).toBe('coding');
    expect(spawned.dispatch.recommendedModel).not.toContain('/'); // not OpenRouter
  });

  it('attributes usage via complete_task and rolls it up at $0', async () => {
    await call('spawn_task', { slug: 'login', title: 'Login', description: 'login form', assignee: 'executor' });
    await call('assign_task', { taskKey: 'task:login', assignee: 'executor' });
    await call('complete_task', {
      taskKey: 'task:login',
      summary: 'done',
      author: 'executor',
      model: 'composer-2.5',
      input_tokens: 1000,
      output_tokens: 500,
    });

    const usage = await call('get_team_usage');
    expect(usage.byTask['task:login'].inputTokens).toBe(1000);
    expect(usage.byTask['task:login'].outputTokens).toBe(500);
    expect(usage.byEngineer['executor'].requests).toBeGreaterThanOrEqual(1);
    expect(usage.totalInputTokens).toBeGreaterThanOrEqual(1000);
    // $0 — Cursor models are not in the pricing table, so cost is never tracked.
    const summary = getGlobalTracker().getSummary();
    expect(summary.totalCost).toBe(0);
    expect(summary.providerCosts['cursor']).toBe(0);
  });

  it('report_usage attributes to the named task and engineer', async () => {
    await call('spawn_task', { slug: 'api', title: 'API', description: 'rest api', assignee: 'executor' });
    const res = await call('report_usage', {
      taskKey: 'task:api',
      engineer: 'architect',
      model: 'composer-2.5',
      input_tokens: 200,
      output_tokens: 100,
    });
    expect(res.taskUsage.inputTokens).toBe(200);
    expect(res.teamUsage.byEngineer['architect'].outputTokens).toBe(100);
    expect(res.teamUsage.byModel['composer-2.5'].requests).toBeGreaterThanOrEqual(1);
  });

  it('start_team_recipe seeds a graph and dispatches the ready tasks', async () => {
    const out = await call('start_team_recipe', {
      recipe: 'full-feature-team',
      goal: 'dark mode',
      namespace: 'dm',
    });
    expect(out.tasks.length).toBe(6);
    // Only the dependency-free "design" task is ready to dispatch immediately.
    expect(out.dispatches.length).toBe(1);
    expect(out.dispatches[0].taskKey).toBe('task:dm-design');
    expect(out.dispatches[0].recommendedModel).toBe('composer-2.5'); // architect → reasoning
    // The implement task depends on the namespaced design task.
    const implement = out.tasks.find((t: any) => t.key === 'task:dm-implement');
    expect(implement.value.dependsOn).toContain('task:dm-design');
  });
});
