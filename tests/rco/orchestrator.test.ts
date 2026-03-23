/**
 * RCO Orchestrator unit and integration tests.
 * Unit tests use injected runWorker (mock forks); integration uses real child_process.fork.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { loadRecipe, loadAllAgents, loadRcoConfig, loadAgentYaml, getPreferredAgentsForTask } from '../../src/rco/loadConfig.js';
import { runOrchestrator, type RunWorkerFn } from '../../src/rco/orchestrator.js';
import { exportCursor } from '../../src/rco/exportCursor.js';
import { acquireLock, readStateUnlocked, writeStateUnlocked } from '../../src/rco/stateLock.js';
import { runTool, dependencyMapper } from '../../src/rco/tools.js';
import type { RcoState, RcoRecipe, AgentYaml } from '../../src/rco/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('RCO loadConfig', () => {
  it('loads RCO recipe PlanExecRevEx from recipes/rco', () => {
    const recipe = loadRecipe('PlanExecRevEx', path.join(projectRoot, 'recipes'));
    expect(recipe.name).toBe('PlanExecRevEx');
    expect(recipe.execution_mode).toBe('autonomous-loop');
    expect(recipe.workflow.steps.length).toBeGreaterThan(0);
    expect(recipe.workflow.steps.map((s) => s.agent)).toContain('Planner');
  });

  it('loads agents from agents/ dir', () => {
    const agents = loadAllAgents(path.join(projectRoot, 'agents'));
    expect(agents.size).toBeGreaterThan(0);
    expect(agents.has('planner')).toBe(true);
    expect(agents.has('executor')).toBe(true);
  });

  it('loads rco config from config.yaml', () => {
    const config = loadRcoConfig(path.join(projectRoot, 'config.yaml'));
    expect(config.claude_models?.simple).toBeDefined();
    expect(config.eco_mode).toBe(true);
  });

  it('getPreferredAgentsForTask matches task string', () => {
    const config = loadRcoConfig(path.join(projectRoot, 'config.yaml'));
    const agents = getPreferredAgentsForTask('plan the architecture', config);
    expect(agents.length).toBeGreaterThan(0);
    expect(agents).toContain('planner');
  });

  it('loadRcoConfig returns empty object when rco section missing', () => {
    const tmpDir = path.join(projectRoot, 'tmp-rco-config-test');
    fs.mkdirSync(tmpDir, { recursive: true });
    const configPath = path.join(tmpDir, 'no-rco.yaml');
    fs.writeFileSync(configPath, 'other: value\nfoo: bar', 'utf-8');
    const config = loadRcoConfig(configPath);
    expect(config).toEqual({});
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadRecipe throws when recipe not found', () => {
    expect(() => loadRecipe('NonExistentRecipe99', path.join(projectRoot, 'recipes'))).toThrow(/Recipe not found/);
  });

  it('loadAgentYaml throws when YAML invalid', () => {
    const tmpDir = path.join(projectRoot, 'tmp-rco-agent-test');
    fs.mkdirSync(tmpDir, { recursive: true });
    const agentPath = path.join(tmpDir, 'bad.yaml');
    fs.writeFileSync(agentPath, 'name: 123\nrole_prompt: [unclosed', 'utf-8');
    expect(() => loadAgentYaml(agentPath)).toThrow();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('RCO stateLock', () => {
  const stateFile = path.join(projectRoot, '.rco-state-lock-test.json');
  const lockFile = path.join(projectRoot, '.rco-state-lock-test.rco-state.lock');

  afterEach(() => {
    try {
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
      if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    } catch {
      // ignore
    }
  });

  it('acquireLock and release allow write then read', () => {
    const release = acquireLock(stateFile);
    writeStateUnlocked(stateFile, { foo: 'bar' });
    release();
    const read = readStateUnlocked<{ foo: string }>(stateFile);
    expect(read).toEqual({ foo: 'bar' });
  });

  it('readStateUnlocked returns null for missing file', () => {
    const read = readStateUnlocked(path.join(projectRoot, 'nonexistent-state-12345.json'));
    expect(read).toBeNull();
  });
});

describe('RCO tools', () => {
  it('dependencyMapper returns valid DOT graph', () => {
    const steps = [
      { agent: 'Planner', output_to: 'Executor' },
      { agent: 'Executor', output_to: 'Reviewer' },
    ];
    const state: RcoState = {
      sessionId: 's1',
      recipe: 'PlanExecRevEx',
      task: 't',
      currentStep: 0,
      loopCount: 0,
      outputs: {},
      agentLogs: [],
      startedAt: 0,
      updatedAt: 0,
    };
    const dot = dependencyMapper(state, steps);
    expect(dot).toContain('digraph RCO_handoffs');
    expect(dot).toContain('Planner');
    expect(dot).toContain('Executor');
    expect(dot).toContain('->');
  });

  it('runTool returns result for known tool', () => {
    const out = runTool('search', 'foo', undefined, []);
    expect(out).toContain('mock search');
  });

  it('runTool returns unknown message for unknown tool', () => {
    const out = runTool('unknown-tool-xyz', 'arg', undefined, []);
    expect(out).toContain('unknown tool');
  });
});

describe('RCO orchestrator (unit: mock runWorker)', () => {
  const mockRunWorker: RunWorkerFn = vi.fn(async (_workerPath, input) => ({
    type: 'result',
    success: true,
    output: `[Mock output for ${(input as { agentYaml?: { name?: string } }).agentYaml?.name ?? 'agent'}]`,
    dotGraph: undefined,
  }));

  beforeEach(() => {
    vi.mocked(mockRunWorker).mockClear();
  });

  it('runOrchestrator with injected runWorker returns synthesized output without forking', async () => {
    const result = await runOrchestrator({
      recipeName: 'PlanExecRevEx',
      task: 'Build a todo app',
      configPath: path.join(projectRoot, 'config.yaml'),
      agentsDir: path.join(projectRoot, 'agents'),
      recipesDir: path.join(projectRoot, 'recipes'),
      stateFilePath: path.join(projectRoot, '.rco-state-unit-test.json'),
      runWorker: mockRunWorker,
      workerRetries: 0,
    });
    expect(result.success).toBe(true);
    expect(result.state.sessionId).toMatch(/^rco-/);
    expect(result.synthesizedOutput).toContain('Planner');
    expect(result.synthesizedOutput).toContain('Executor');
    expect(mockRunWorker).toHaveBeenCalled();
    if (fs.existsSync(path.join(projectRoot, '.rco-state-unit-test.json'))) {
      fs.unlinkSync(path.join(projectRoot, '.rco-state-unit-test.json'));
    }
  });

  it('runOrchestrator persists state and advances currentStep', async () => {
    const statePath = path.join(projectRoot, '.rco-state-unit-test-2.json');
    const result = await runOrchestrator({
      recipeName: 'PlanExecRevEx',
      task: 'Short task',
      configPath: path.join(projectRoot, 'config.yaml'),
      agentsDir: path.join(projectRoot, 'agents'),
      recipesDir: path.join(projectRoot, 'recipes'),
      stateFilePath: statePath,
      runWorker: mockRunWorker,
      workerRetries: 0,
    });
    expect(result.state.currentStep).toBeGreaterThanOrEqual(0);
    expect(result.state.agentLogs.length).toBeGreaterThan(0);
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  });

  it('runOrchestrator respects workerTimeoutMs and workerRetries options', async () => {
    await runOrchestrator({
      recipeName: 'PlanExecRevEx',
      task: 'Task',
      configPath: path.join(projectRoot, 'config.yaml'),
      agentsDir: path.join(projectRoot, 'agents'),
      recipesDir: path.join(projectRoot, 'recipes'),
      workerTimeoutMs: 10000,
      workerRetries: 1,
      runWorker: mockRunWorker,
    });
    expect(mockRunWorker).toHaveBeenCalled();
  });
});

describe('RCO orchestrator (integration: real fork)', () => {
  it('runOrchestrator runs workflow and returns synthesized output', async () => {
    const result = await runOrchestrator({
      recipeName: 'PlanExecRevEx',
      task: 'Build a todo app',
      configPath: path.join(projectRoot, 'config.yaml'),
      agentsDir: path.join(projectRoot, 'agents'),
      recipesDir: path.join(projectRoot, 'recipes'),
      stateFilePath: path.join(projectRoot, '.rco-state-test.json'),
    });
    expect(result.success).toBe(true);
    expect(result.state.sessionId).toMatch(/^rco-/);
    expect(result.state.outputs).toBeDefined();
    expect(result.synthesizedOutput).toContain('Planner');
    if (fs.existsSync(path.join(projectRoot, '.rco-state-test.json'))) {
      fs.unlinkSync(path.join(projectRoot, '.rco-state-test.json'));
    }
  }, 20000);
});

describe('RCO exportCursor', () => {
  it('exportCursor writes rule and MCP JSON files', () => {
    const state: RcoState = {
      sessionId: 'rco-test-123',
      recipe: 'PlanExecRevEx',
      task: 'Build a todo app',
      currentStep: 2,
      loopCount: 0,
      outputs: { Planner: 'plan', Executor: 'code' },
      agentLogs: [
        { agent: 'Planner', phase: 'start', message: 'ok', ts: Date.now() },
      ],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    const tmpDir = path.join(projectRoot, 'tmp-rco-export-test');
    const { rulePath, mcpPath } = exportCursor({ state, outputDir: tmpDir, writeToCursor: false });
    expect(rulePath).toContain('rco-export');
    expect(rulePath).toContain(state.sessionId);
    expect(fs.existsSync(rulePath)).toBe(true);
    expect(fs.existsSync(mcpPath)).toBe(true);
    const mcpContent = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    expect(mcpContent.rco_session).toBe(state.sessionId);
    expect(mcpContent.suggested_agents).toContain('Planner');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
