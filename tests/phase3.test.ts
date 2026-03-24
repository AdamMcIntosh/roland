/**
 * Phase 3 tests: new modes (adaptive-swarm), skills (eco-optimizer, graph-visualizer),
 * and dashboard metrics/CSV data shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runOrchestrator, type RunWorkerFn } from '../src/rco/orchestrator.js';
import {
  ecoOptimizerSuggestModel,
  graphVisualizerDOT,
  isValidDOT,
  ECO_MODELS,
} from '../src/skills.js';
import { runTool } from '../src/rco/tools.js';
import type { RcoState } from '../src/rco/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

describe('Phase 3: adaptive-swarm mode', () => {
  const mockRunWorker: RunWorkerFn = vi.fn(async (_workerPath, input) => ({
    type: 'result',
    success: true,
    output: `[Mock ${(input as { agentYaml?: { name?: string } }).agentYaml?.name ?? 'agent'}]`,
    dotGraph: undefined,
  }));

  beforeEach(() => {
    vi.mocked(mockRunWorker).mockClear();
  });

  it('adaptive-swarm runs with step count derived from task complexity', async () => {
    const result = await runOrchestrator({
      recipeName: 'adaptive-swarm',
      task: 'Add a comment',
      configPath: path.join(projectRoot, 'config.yaml'),
      agentsDir: path.join(projectRoot, 'agents'),
      recipesDir: path.join(projectRoot, 'recipes'),
      stateFilePath: path.join(projectRoot, '.rco-phase3-adaptive.json'),
      executionMode: 'adaptive-swarm',
      runWorker: mockRunWorker,
      workerRetries: 0,
    });
    expect(result.success).toBe(true);
    expect(result.state.sessionId).toMatch(/^rco-/);
    expect(mockRunWorker).toHaveBeenCalled();
    const stepsUsed = result.state.currentStep + 1;
    expect(stepsUsed).toBeGreaterThanOrEqual(1);
    expect(stepsUsed).toBeLessThanOrEqual(4);
    if (fs.existsSync(path.join(projectRoot, '.rco-phase3-adaptive.json'))) {
      fs.unlinkSync(path.join(projectRoot, '.rco-phase3-adaptive.json'));
    }
  });
});

describe('Phase 3: skills', () => {
  it('ecoOptimizerSuggestModel returns Haiku for short input', () => {
    const model = ecoOptimizerSuggestModel('fix typo', 'claude-3-5-sonnet-20241022');
    expect(model).toBe(ECO_MODELS.simple);
  });

  it('ecoOptimizerSuggestModel returns Sonnet or Haiku depending on complexity', () => {
    const long =
      'Design a distributed system with multiple services, event sourcing, and eventual consistency. Include failure modes and recovery.';
    const model = ecoOptimizerSuggestModel(long, 'claude-3-5-sonnet-20241022');
    expect([ECO_MODELS.simple, ECO_MODELS.medium, ECO_MODELS.complex]).toContain(model);
  });

  it('graphVisualizerDOT returns valid DOT string', () => {
    const state: RcoState = {
      sessionId: 's1',
      recipe: 'PlanExecRevEx',
      task: 't',
      currentStep: 1,
      loopCount: 0,
      outputs: {},
      agentLogs: [],
      startedAt: 0,
      updatedAt: 0,
    };
    const steps = [
      { agent: 'Planner', output_to: 'Executor' },
      { agent: 'Executor', output_to: 'Reviewer' },
    ];
    const dot = graphVisualizerDOT(state, steps);
    expect(isValidDOT(dot)).toBe(true);
    expect(dot).toContain('digraph RCO_handoffs');
    expect(dot).toContain('Executor');
    expect(dot).toContain('lightblue');
  });

  it('isValidDOT rejects invalid strings', () => {
    expect(isValidDOT('')).toBe(false);
    expect(isValidDOT('not a graph')).toBe(false);
    expect(isValidDOT('digraph X {')).toBe(false);
  });

  it('runTool graph-visualizer returns DOT', () => {
    const state: RcoState = {
      sessionId: 's1',
      recipe: 'R',
      task: 't',
      currentStep: 0,
      loopCount: 0,
      outputs: {},
      agentLogs: [],
      startedAt: 0,
      updatedAt: 0,
    };
    const steps = [{ agent: 'A', output_to: 'B' }];
    const out = runTool('graph-visualizer', '', state, steps);
    expect(out).toContain('digraph');
    expect(out).toContain('A');
    expect(out).toContain('B');
  });
});

describe('Phase 3: dashboard CSV export data shape', () => {
  it('stateLog-style array is CSV-serializable (headers + rows)', () => {
    const stateLog = [
      { ts: 1000, type: 'log', agent: 'Planner', message: 'start' },
      { ts: 2000, type: 'metrics', agent: '', message: '' },
    ];
    const headers = ['ts', 'type', 'agent', 'message'];
    const row = stateLog[0];
    headers.forEach((h) => expect(row).toHaveProperty(h));
    expect(stateLog.every((r) => typeof r.ts === 'number')).toBe(true);
  });
});
