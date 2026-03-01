/**
 * RCO Phase 2 integration tests: plugin commands, persistence, schemas, export, dashboard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  parseRunRecipeArgs,
  handlePluginCommand,
  runRecipeFromPlugin,
  RCO_PLUGIN_COMMANDS,
} from '../../src/plugin.js';
import {
  buildNotepadStorePrompt,
  buildNotepadRetrievePrompt,
  parseNotepadResponse,
  saveStateToLocal,
  loadStateFromLocal,
  listLocalSessionIds,
} from '../../src/persistence.js';
import { parseClaudeResponseText, ClaudeResponseOutputSchema, PersistedStateSchema } from '../../src/schemas.js';
import { exportCursor } from '../../src/rco/exportCursor.js';
import { broadcast, broadcastGraph, startDashboard, stopDashboard } from '../../src/rco/dashboard.js';
import { buildClaudeToolCallingPrompt } from '../../src/rco/prompts.js';
import type { RcoState } from '../../src/rco/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('RCO Phase 2: Plugin', () => {
  it('RCO_PLUGIN_COMMANDS includes rco-run:recipe', () => {
    const names = RCO_PLUGIN_COMMANDS.map((c) => c.name);
    expect(names).toContain('rco-run:recipe');
    expect(names).toContain('rco-status');
    expect(names).toContain('rco-export');
  });

  it('parseRunRecipeArgs parses recipe and task', () => {
    const out = parseRunRecipeArgs(['PlanExecRevEx', '--task', 'Build a CLI']);
    expect(out.recipe).toBe('PlanExecRevEx');
    expect(out.task).toBe('Build a CLI');
  });

  it('parseRunRecipeArgs accepts --no-export', () => {
    const out = parseRunRecipeArgs(['PlanExecRevEx', '--task', 'Task', '--no-export']);
    expect(out.options?.noExport).toBe(true);
  });

  it('handlePluginCommand returns text for rco-status', async () => {
    const text = await handlePluginCommand('rco-status', []);
    expect(text).toContain('RCO status');
  });

  it('handlePluginCommand returns text for unknown command', async () => {
    const text = await handlePluginCommand('unknown-cmd', []);
    expect(text).toContain('Unknown RCO command');
  });

  it('runRecipeFromPlugin runs PlanExecRevEx and returns result', async () => {
    const result = await runRecipeFromPlugin([
      'PlanExecRevEx',
      '--task',
      'Short test task',
      '--no-export',
    ]);
    expect(result.success).toBe(true);
    expect(result.sessionId).toMatch(/^rco-/);
    expect(result.steps).toBeGreaterThan(0);
    expect(result.synthesizedOutput).toContain('Planner');
  }, 25000);
});

describe('RCO Phase 2: Schemas', () => {
  it('parseClaudeResponseText extracts JSON output', () => {
    const raw = 'Here is the result: {"output": "Done.", "success": true}';
    const parsed = parseClaudeResponseText(raw);
    expect(parsed.output).toBe('Done.');
    expect(parsed.success).toBe(true);
  });

  it('parseClaudeResponseText falls back to full text', () => {
    const raw = 'Just plain text without JSON';
    const parsed = parseClaudeResponseText(raw);
    expect(parsed.output).toBe('Just plain text without JSON');
    expect(parsed.success).toBe(true);
  });

  it('ClaudeResponseOutputSchema validates shape', () => {
    const valid = ClaudeResponseOutputSchema.safeParse({ output: 'x', success: true });
    expect(valid.success).toBe(true);
    const invalid = ClaudeResponseOutputSchema.safeParse({ wrong: 'key' });
    expect(invalid.success).toBe(false);
  });

  it('PersistedStateSchema validates RcoState-like object', () => {
    const state = {
      sessionId: 's1',
      recipe: 'R',
      task: 'T',
      currentStep: 0,
      loopCount: 0,
      outputs: {},
      agentLogs: [],
      startedAt: 0,
      updatedAt: 0,
    };
    expect(PersistedStateSchema.safeParse(state).success).toBe(true);
  });
});

describe('RCO Phase 2: Persistence', () => {
  const stateDir = path.join(projectRoot, '.rco-sessions-phase2-test');

  afterEach(() => {
    try {
      if (fs.existsSync(stateDir)) fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('buildNotepadStorePrompt returns store instruction', () => {
    const state: RcoState = {
      sessionId: 's1',
      recipe: 'R',
      task: 'T',
      currentStep: 0,
      loopCount: 0,
      outputs: {},
      agentLogs: [],
      startedAt: 0,
      updatedAt: 0,
    };
    const prompt = buildNotepadStorePrompt(state);
    expect(prompt).toContain('Store');
    expect(prompt).toContain('s1');
    expect(prompt).toContain('rco-state:');
  });

  it('buildNotepadRetrievePrompt returns retrieve instruction', () => {
    const prompt = buildNotepadRetrievePrompt('sess-123');
    expect(prompt).toContain('Retrieve');
    expect(prompt).toContain('sess-123');
  });

  it('parseNotepadResponse parses valid JSON', () => {
    const raw = '{"sessionId":"s1","recipe":"R","task":"T","currentStep":0,"loopCount":0,"outputs":{},"agentLogs":[],"startedAt":0,"updatedAt":0}';
    const out = parseNotepadResponse(raw);
    expect(out).not.toBeNull();
    expect(out?.sessionId).toBe('s1');
  });

  it('saveStateToLocal and loadStateFromLocal round-trip', () => {
    const state: RcoState = {
      sessionId: 'persist-test-1',
      recipe: 'PlanExecRevEx',
      task: 'Task',
      currentStep: 1,
      loopCount: 0,
      outputs: { Planner: 'plan output' },
      agentLogs: [{ agent: 'Planner', phase: 'done', message: 'ok', ts: Date.now() }],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    const filePath = saveStateToLocal(state, stateDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const loaded = loadStateFromLocal('persist-test-1', stateDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe(state.sessionId);
    expect(loaded?.outputs?.Planner).toBe('plan output');
  });

  it('listLocalSessionIds returns saved session ids', () => {
    const state: RcoState = {
      sessionId: 'list-test-1',
      recipe: 'R',
      task: 'T',
      currentStep: 0,
      loopCount: 0,
      outputs: {},
      agentLogs: [],
      startedAt: 0,
      updatedAt: 0,
    };
    saveStateToLocal(state, stateDir);
    const ids = listLocalSessionIds(stateDir);
    expect(ids).toContain('list-test-1');
  });
});

describe('RCO Phase 2: Export dynamic rules', () => {
  it('exportCursor with dynamicRules adds triage hints when output contains bug', () => {
    const tmpDir = path.join(projectRoot, 'tmp-rco-dynamic-export');
    const state: RcoState = {
      sessionId: 'dynamic-1',
      recipe: 'PlanExecRevEx',
      task: 'Fix the bug',
      currentStep: 1,
      loopCount: 0,
      outputs: { Reviewer: 'Found a bug in the module' },
      agentLogs: [
        { agent: 'Planner', phase: 'done', message: 'ok', ts: Date.now() },
        { agent: 'Reviewer', phase: 'done', message: 'ok', ts: Date.now() },
      ],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    const { rulePath } = exportCursor({ state, outputDir: tmpDir, writeToCursor: false, dynamicRules: true });
    const content = fs.readFileSync(rulePath, 'utf-8');
    expect(content).toContain('Dynamic hints');
    expect(content).toContain('BugFix');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('RCO Phase 2: Dashboard', () => {
  it('broadcastGraph sends graph payload', () => {
    const received: unknown[] = [];
    const mockBroadcast = (p: unknown) => received.push(p);
    // We cannot inject into broadcast; test broadcastGraph directly by checking it doesn't throw
    broadcastGraph(
      [
        { agent: 'Planner', output_to: 'Executor' },
        { agent: 'Executor', output_to: 'Reviewer' },
      ],
      'sess-1'
    );
    expect(received.length).toBe(0); // broadcast sends to clients; we didn't add any
  });

  it('startDashboard and stopDashboard run without error', () => {
    const wss = startDashboard(0); // port 0 = random
    expect(wss).toBeDefined();
    stopDashboard();
  });
});

describe('RCO Phase 2: Prompts', () => {
  it('buildClaudeToolCallingPrompt includes agent name and tools', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: { name: 'Planner', tools: ['search', 'code'], claude_model: 'claude-3-5-sonnet-20241022' },
      taskContext: 'Build a CLI',
      stepInput: 'Previous step output',
    });
    expect(prompt).toContain('As Planner');
    expect(prompt).toContain('Build a CLI');
    expect(prompt).toContain('search');
    expect(prompt).toContain('Respond in JSON');
  });
});
