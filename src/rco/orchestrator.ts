/**
 * RCO Recipe Orchestrator — legacy YAML workflow runner (child_process.fork).
 *
 * Walks recipe workflow steps, forks agentWorker.ts for each agent, persists
 * state via stateLock, and returns synthesized output. Team mode uses
 * team-orchestrator.ts instead; this module remains for recipes/QA/tests.
 */

import fs from 'fs';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { loadRecipe, loadAllAgents, loadRcoConfig } from './loadConfig.js';
import { acquireLock, readStateUnlocked, writeStateUnlocked } from './stateLock.js';
import type {
  AgentYaml,
  RcoRecipe,
  RcoState,
  RcoWorkflowStep,
  WorkerInput,
  WorkerOutput,
} from './types.js';

export type RunWorkerFn = (workerPath: string, input: WorkerInput) => Promise<WorkerOutput>;

export interface RunOrchestratorOptions {
  recipeName: string;
  task: string;
  configPath: string;
  agentsDir: string;
  recipesDir: string;
  stateFilePath?: string;
  runWorker?: RunWorkerFn;
  workerRetries?: number;
  workerTimeoutMs?: number;
  executionMode?: string;
}

export interface RunOrchestratorResult {
  success: boolean;
  state: RcoState;
  synthesizedOutput: string;
}

const DEFAULT_WORKER_TIMEOUT_MS = 120_000;
const DEFAULT_WORKER_RETRIES = 2;
const ADAPTIVE_AGENTS = ['Planner', 'Executor', 'Reviewer', 'Explainer'];

function resolveWorkerPath(referenceUrl: string = import.meta.url): string {
  const here = path.dirname(fileURLToPath(referenceUrl));
  const candidates = [
    path.join(here, 'agentWorker.js'),
    path.resolve(here, '../../dist/rco/agentWorker.js'),
    path.resolve(process.cwd(), 'dist/rco/agentWorker.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`RCO agentWorker not found (tried: ${candidates.join(', ')})`);
}

function adaptiveStepCount(task: string): number {
  const words = task.trim().split(/\s+/).filter(Boolean).length;
  const len = task.trim().length;
  if (words <= 4 || len < 30) return 1;
  if (words <= 10 || len < 80) return 2;
  if (words <= 25 || len < 200) return 3;
  return 4;
}

function buildAdaptiveSwarmRecipe(task: string): RcoRecipe {
  const stepCount = adaptiveStepCount(task);
  const agentNames = ADAPTIVE_AGENTS.slice(0, stepCount);
  const steps: RcoWorkflowStep[] = agentNames.map((agent, index) => ({
    agent,
    input: index === 0 ? '{{user_task}}' : undefined,
    output_to: index < agentNames.length - 1 ? agentNames[index + 1] : undefined,
    final_output: index === agentNames.length - 1,
  }));
  return {
    name: 'adaptive-swarm',
    execution_mode: 'adaptive-swarm',
    max_loops: 1,
    workflow: { steps },
  };
}

function loadOrchestratorRecipe(
  recipeName: string,
  recipesDir: string,
  task: string,
  executionMode?: string,
): RcoRecipe {
  if (recipeName === 'adaptive-swarm' || executionMode === 'adaptive-swarm') {
    return buildAdaptiveSwarmRecipe(task);
  }
  return loadRecipe(recipeName, recipesDir);
}

function resolveAgentYaml(
  stepAgent: string,
  agents: Map<string, AgentYaml>,
  recipe: RcoRecipe,
): AgentYaml {
  const key = stepAgent.toLowerCase();
  const fromDir = agents.get(key);
  if (fromDir) return { ...fromDir, name: stepAgent };

  const sub = recipe.subagents?.find((s) => s.name.toLowerCase() === key);
  if (sub) {
    const ref = agents.get(sub.agentRef.toLowerCase());
    return {
      name: stepAgent,
      role_prompt: sub.prompt ?? ref?.role_prompt,
      claude_model: sub.claude_model ?? ref?.claude_model ?? 'composer-2.5',
      tools: ref?.tools,
    };
  }

  return {
    name: stepAgent,
    role_prompt: `You are ${stepAgent}. Complete your assigned workflow step.`,
    claude_model: 'composer-2.5',
  };
}

function buildStepInput(
  step: RcoWorkflowStep,
  task: string,
  state: RcoState,
  previousAgent?: string,
): string {
  if (step.input) return step.input.replace(/\{\{user_task\}\}/g, task);
  if (previousAgent && state.outputs[previousAgent] !== undefined) {
    return String(state.outputs[previousAgent]);
  }
  return task;
}

function shouldLoopBack(step: RcoWorkflowStep, output: string): boolean {
  if (!step.loop_if) return false;
  return output.toLowerCase().includes(step.loop_if.toLowerCase());
}

function synthesizeOutput(state: RcoState): string {
  const sections: string[] = [];
  for (const [agent, output] of Object.entries(state.outputs)) {
    sections.push(`## ${agent}\n${String(output)}`);
  }
  return sections.join('\n\n');
}

function createInitialState(recipeName: string, task: string): RcoState {
  const now = Date.now();
  return {
    sessionId: `rco-${randomUUID()}`,
    recipe: recipeName,
    task,
    currentStep: 0,
    loopCount: 0,
    outputs: {},
    agentLogs: [],
    startedAt: now,
    updatedAt: now,
  };
}

function defaultRunWorker(workerPath: string, input: WorkerInput): Promise<WorkerOutput> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const child = fork(workerPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: process.env,
    });

    child.on('message', (msg: unknown) => {
      const typed = msg as { type?: string };
      if (typed?.type === 'result') {
        finish(() => resolve(msg as WorkerOutput));
      }
    });

    child.on('error', (err) => finish(() => reject(err)));
    child.on('exit', (code, signal) => {
      if (!settled) {
        finish(() => reject(new Error(`Worker exited with code ${code ?? signal ?? 'unknown'}`)));
      }
    });

    child.send(input);
  });
}

async function invokeWorker(
  runWorker: RunWorkerFn,
  workerPath: string,
  input: WorkerInput,
  workerRetries: number,
  workerTimeoutMs: number,
): Promise<WorkerOutput> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= workerRetries; attempt++) {
    try {
      const result = await Promise.race([
        runWorker(workerPath, input),
        new Promise<WorkerOutput>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Worker timeout after ${workerTimeoutMs}ms`)),
            workerTimeoutMs,
          );
        }),
      ]);
      if (result.success) return result;
      lastError = new Error(result.error ?? 'Worker returned success=false');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Worker failed');
}

function persistState(stateFilePath: string, state: RcoState): void {
  const release = acquireLock(stateFilePath);
  try {
    writeStateUnlocked(stateFilePath, state);
  } finally {
    release();
  }
}

export async function runOrchestrator(opts: RunOrchestratorOptions): Promise<RunOrchestratorResult> {
  const {
    recipeName,
    task,
    configPath,
    agentsDir,
    recipesDir,
    stateFilePath = path.join(process.cwd(), '.rco-state.json'),
    runWorker = defaultRunWorker,
    workerRetries = DEFAULT_WORKER_RETRIES,
    workerTimeoutMs = DEFAULT_WORKER_TIMEOUT_MS,
    executionMode,
  } = opts;

  loadRcoConfig(configPath);
  const agents = loadAllAgents(agentsDir);
  const recipe = loadOrchestratorRecipe(recipeName, recipesDir, task, executionMode);
  const workerPath = resolveWorkerPath();
  const steps = recipe.workflow.steps;

  let state = readStateUnlocked<RcoState>(stateFilePath) ?? createInitialState(recipe.name, task);
  state.recipe = recipe.name;
  state.task = task;

  let stepIndex = state.currentStep;
  let previousAgent: string | undefined;
  let success = true;

  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    const agentYaml = resolveAgentYaml(step.agent, agents, recipe);
    const stepInput = buildStepInput(step, task, state, previousAgent);
    const workerInput: WorkerInput = {
      type: 'run',
      agentYaml,
      state: state as unknown as Record<string, unknown>,
      taskContext: task,
      stepInput,
      tools: agentYaml.tools,
      workflowSteps: steps.map((s) => ({ agent: s.agent, output_to: s.output_to })),
    };

    state.agentLogs.push({
      agent: step.agent,
      phase: 'start',
      message: `Step ${stepIndex + 1}/${steps.length}`,
      ts: Date.now(),
    });

    let workerResult: WorkerOutput;
    try {
      workerResult = await invokeWorker(runWorker, workerPath, workerInput, workerRetries, workerTimeoutMs);
    } catch (err) {
      success = false;
      const message = err instanceof Error ? err.message : String(err);
      state.agentLogs.push({
        agent: step.agent,
        phase: 'error',
        message,
        ts: Date.now(),
      });
      break;
    }

    state.outputs[step.agent] = workerResult.output;
    state.agentLogs.push({
      agent: step.agent,
      phase: 'done',
      message: workerResult.output.slice(0, 120),
      ts: Date.now(),
    });
    state.currentStep = stepIndex;
    state.updatedAt = Date.now();
    persistState(stateFilePath, state);

    if (shouldLoopBack(step, workerResult.output) && state.loopCount < (recipe.max_loops ?? 5)) {
      state.loopCount += 1;
      const loopTarget = steps.findIndex((s) => s.agent === step.output_to);
      stepIndex = loopTarget >= 0 ? loopTarget : stepIndex + 1;
      previousAgent = step.agent;
      continue;
    }

    previousAgent = step.agent;
    stepIndex += 1;
    state.currentStep = Math.max(0, stepIndex - 1);
  }

  state.updatedAt = Date.now();
  persistState(stateFilePath, state);

  return {
    success,
    state,
    synthesizedOutput: synthesizeOutput(state),
  };
}
