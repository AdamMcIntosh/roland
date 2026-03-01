/**
 * RCO Central Orchestrator
 * Loads YAMLs, parses recipes, spawns agent workers via child_process.fork,
 * persists state (JSON), synthesizes outputs. Supports autonomous-loop and parallel-swarm.
 * Verbose logging, configurable timeouts and retries, profiling (console.time).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import { loadRcoConfig, loadAllAgents, loadRecipe } from './loadConfig.js';
import { acquireLock, writeStateUnlocked } from './stateLock.js';
import type { RcoState, RcoRecipe, AgentYaml, WorkerInput, WorkerOutput } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RCO_VERBOSE = process.env.RCO_VERBOSE !== '0' && process.env.RCO_VERBOSE !== 'false';

function logVerbose(msg: string): void {
  if (RCO_VERBOSE) console.error(`[RCO orchestrator] ${msg}`);
}

/** Resolve agentWorker path: use dist/rco/agentWorker.js when running from src (e.g. Vitest). */
function resolveWorkerPath(): string {
  const here = path.join(__dirname, 'agentWorker.js');
  if (fs.existsSync(here)) return here;
  const distPath = path.join(__dirname, '..', '..', 'dist', 'rco', 'agentWorker.js');
  if (fs.existsSync(distPath)) return distPath;
  return here;
}

export type RunWorkerFn = (workerPath: string, input: WorkerInput) => Promise<WorkerOutput>;

export interface OrchestratorOptions {
  recipeName: string;
  task: string;
  configPath?: string;
  agentsDir?: string;
  recipesDir?: string;
  stateFilePath?: string;
  ecoMode?: boolean;
  maxLoops?: number;
  /** Optional: broadcast agent status/logs for dashboard */
  onLog?: (payload: { agent: string; phase: string; message: string }) => void;
  /** Optional: run in parallel-swarm (concurrent forks + file lock) */
  executionMode?: 'autonomous-loop' | 'parallel-swarm' | 'linear';
  /** Optional: worker step timeout in ms (default 60000) */
  workerTimeoutMs?: number;
  /** Optional: max retries per worker step on failure (default 2) */
  workerRetries?: number;
  /** Optional: inject runWorker for tests (default: real fork) */
  runWorker?: RunWorkerFn;
}

export interface OrchestratorResult {
  success: boolean;
  state: RcoState;
  synthesizedOutput: string;
  dotGraph?: string;
}

function pickAgentForStep(recipe: RcoRecipe, stepAgentName: string, agents: Map<string, AgentYaml>): AgentYaml {
  const sub = recipe.subagents?.find((s) => s.name === stepAgentName);
  const ref = sub?.agentRef ?? stepAgentName;
  const key = ref.toLowerCase().replace(/\s+/g, '');
  const byName = agents.get(ref.toLowerCase()) ?? agents.get(key);
  if (!byName) throw new Error(`Agent not found: ${stepAgentName} (ref: ${ref})`);
  const merged: AgentYaml = { ...byName, name: stepAgentName };
  if (sub?.claude_model) merged.claude_model = sub.claude_model;
  return merged;
}

/** Default runWorker: fork child process with timeout. Used when options.runWorker not provided. */
function defaultRunWorker(
  workerPath: string,
  input: WorkerInput,
  timeoutMs: number
): Promise<WorkerOutput> {
  return new Promise((resolve, reject) => {
    const child = fork(workerPath, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], execArgv: [] });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Worker timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    child.on('message', (msg: unknown) => {
      const m = msg as { type: string; success?: boolean; output?: string; error?: string; dotGraph?: string };
      if (m.type === 'result') {
        clearTimeout(timeout);
        resolve({
          type: 'result',
          success: m.success ?? false,
          output: m.output ?? '',
          error: m.error,
          dotGraph: m.dotGraph,
        });
        return;
      }
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
    child.send(input);
  });
}

/** Run worker with optional retries. */
async function runWorkerWithRetry(
  runWorkerFn: RunWorkerFn,
  workerPath: string,
  input: WorkerInput,
  timeoutMs: number,
  retries: number
): Promise<WorkerOutput> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) logVerbose(`Retry ${attempt}/${retries} for agent ${(input as WorkerInput).agentYaml?.name ?? 'unknown'}`);
      const out = await runWorkerFn(workerPath, input);
      return out;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === retries) break;
    }
  }
  throw lastErr ?? new Error('Worker failed after retries');
}

export async function runOrchestrator(options: OrchestratorOptions): Promise<OrchestratorResult> {
  const profileKey = `rco-${options.recipeName}-${Date.now()}`;
  if (RCO_VERBOSE) console.time(profileKey);

  const {
    recipeName,
    task,
    configPath = 'config.yaml',
    agentsDir = 'agents',
    recipesDir = 'recipes',
    stateFilePath: optStatePath,
    ecoMode,
    maxLoops: optMaxLoops,
    onLog,
    executionMode: optMode,
    workerTimeoutMs = 60000,
    workerRetries = 2,
    runWorker: injectedRunWorker,
  } = options;

  const rcoConfig = loadRcoConfig(configPath);
  const stateFile = optStatePath ?? rcoConfig.state_file ?? '.rco-state.json';
  const agents = loadAllAgents(agentsDir);
  const recipe = loadRecipe(recipeName, recipesDir);
  const executionMode = optMode ?? recipe.execution_mode ?? 'autonomous-loop';
  const maxLoops = optMaxLoops ?? recipe.max_loops ?? 5;
  const eco = ecoMode ?? recipe.options?.eco_mode ?? rcoConfig.eco_mode ?? false;

  const runWorkerFn: RunWorkerFn =
    injectedRunWorker ??
    ((workerPath, input) => defaultRunWorker(workerPath, input, workerTimeoutMs));

  const workerPath = resolveWorkerPath();
  logVerbose(`workerTimeoutMs=${workerTimeoutMs} workerRetries=${workerRetries} workerPath=${workerPath}`);

  const sessionId = `rco-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const state: RcoState = {
    sessionId,
    recipe: recipeName,
    task,
    currentStep: 0,
    loopCount: 0,
    outputs: {},
    agentLogs: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  const workflowSteps = recipe.workflow.steps;
  const steps = workflowSteps;

  function persist(): void {
    state.updatedAt = Date.now();
    const release = executionMode === 'parallel-swarm' ? acquireLock(stateFile) : () => {};
    try {
      writeStateUnlocked(stateFile, state);
    } finally {
      release();
    }
  }

  function log(agent: string, phase: string, message: string): void {
    state.agentLogs.push({ agent, phase, message, ts: Date.now() });
    onLog?.({ agent, phase, message });
  }

  if (executionMode === 'parallel-swarm') {
    const release = acquireLock(stateFile);
    try {
      writeStateUnlocked(stateFile, state);
    } finally {
      release();
    }
    const promises = steps.map(async (step, i) => {
      const agentYaml = pickAgentForStep(recipe, step.agent, agents);
      log(step.agent, 'start', `parallel step ${i + 1}`);
      const input: WorkerInput = {
        type: 'run',
        agentYaml,
        state: state as unknown as Record<string, unknown>,
        taskContext: task,
        stepInput: undefined,
        tools: agentYaml.tools,
        workflowSteps: steps.map((s) => ({ agent: s.agent, output_to: s.output_to })),
      };
      const result = await runWorkerWithRetry(runWorkerFn, workerPath, input, workerTimeoutMs, workerRetries);
      state.outputs[step.agent] = result.output;
      if (result.dotGraph) (state as { dotGraph?: string }).dotGraph = result.dotGraph;
      log(step.agent, 'done', result.success ? 'ok' : (result.error ?? 'fail'));
      return result;
    });
    await Promise.all(promises);
    persist();
    const synthesizedOutput = steps.map((s) => `## ${s.agent}\n${(state.outputs[s.agent] as string) ?? ''}`).join('\n\n');
    if (RCO_VERBOSE) console.timeEnd(profileKey);
    return {
      success: true,
      state,
      synthesizedOutput,
      dotGraph: (state as { dotGraph?: string }).dotGraph,
    };
  }

  // autonomous-loop or linear
  let stepIndex = 0;
  let loopCount = 0;
  let lastDotGraph: string | undefined;

  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    state.currentStep = stepIndex;
    const agentYaml = pickAgentForStep(recipe, step.agent, agents);
    const stepInput = step.input === '{{user_task}}' ? task : (state.outputs[steps[stepIndex - 1]?.agent] as string | undefined);

    log(step.agent, 'start', `step ${stepIndex + 1}/${steps.length}`);
    const input: WorkerInput = {
      type: 'run',
      agentYaml,
      state: state as unknown as Record<string, unknown>,
      taskContext: task,
      stepInput,
      tools: agentYaml.tools,
      workflowSteps: steps.map((s) => ({ agent: s.agent, output_to: s.output_to })),
    };
    const result = await runWorkerWithRetry(runWorkerFn, workerPath, input, workerTimeoutMs, workerRetries);
    state.outputs[step.agent] = result.output;
    if (result.dotGraph) lastDotGraph = result.dotGraph;
    log(step.agent, 'done', result.success ? 'ok' : (result.error ?? 'fail'));

    const loopCondition = step.loop_if && result.output.toLowerCase().includes('issue');
    if (loopCondition && loopCount < maxLoops) {
      loopCount++;
      state.loopCount = loopCount;
      stepIndex = Math.max(0, stepIndex - 1);
      log('orchestrator', 'loop', `loop ${loopCount}/${maxLoops}`);
      persist();
      continue;
    }

    if (step.final_output) break;
    stepIndex++;
    persist();
  }

  const synthesizedOutput = steps.map((s) => `## ${s.agent}\n${(state.outputs[s.agent] as string) ?? ''}`).join('\n\n');
  if (RCO_VERBOSE) console.timeEnd(profileKey);
  return {
    success: true,
    state,
    synthesizedOutput,
    dotGraph: lastDotGraph,
  };
}
