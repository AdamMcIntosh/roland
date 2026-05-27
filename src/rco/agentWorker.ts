#!/usr/bin/env node
/**
 * RCO Agent Worker — child process that executes an agent step.
 *
 * Execution priority:
 *   1. CURSOR_API_KEY set → real @cursor/sdk Agent (production path)
 *   2. otherwise          → inline mock string (tests / CI)
 *
 * Generates a structured prompt via buildClaudeToolCallingPrompt, sends it to
 * the chosen backend, and returns a WorkerOutput JSON envelope.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WorkerInputSchema, WorkerOutputSchema, type RcoState, type WorkerOutput } from './types.js';
import { runTool } from './tools.js';
import { buildClaudeToolCallingPrompt } from './prompts.js';
import { parseClaudeResponseText } from '../schemas.js';
import { toCursorModelId } from './model-routing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(phase: string, message: string): void {
  const line = `[RCO worker ${phase}] ${message}`;
  console.error(line);
  if (typeof process.send === 'function') {
    process.send({ type: 'log', phase, message });
  }
}

function sendResult(result: WorkerOutput): void {
  if (typeof process.send === 'function') {
    process.send(result);
  } else {
    console.log(JSON.stringify(result));
  }
}


/**
 * Production path: create a real @cursor/sdk Agent, send the prompt, and
 * return the result wrapped in the JSON envelope the rest of the worker expects.
 */
async function getResponseViaCursorSDK(prompt: string, agentName: string, model: string): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error('CURSOR_API_KEY is not set');

  // Dynamic import keeps the mock paths working without the SDK installed.
  const { Agent } = await import('@cursor/sdk') as typeof import('@cursor/sdk');

  const agent = await Agent.create({
    apiKey,
    model: { id: toCursorModelId(model, agentName) },
    name: agentName,
    local: { cwd: process.cwd() },
  });

  const run = await agent.send(prompt);
  const runResult = await run.wait();

  if (runResult.status === 'error' || runResult.status === 'cancelled') {
    throw new Error(`Cursor agent "${agentName}" ${runResult.status}: ${runResult.result ?? 'no detail'}`);
  }

  return JSON.stringify({ output: runResult.result ?? '', success: true });
}

async function runAsync(input: unknown): Promise<void> {
  const inputParsed = WorkerInputSchema.safeParse(input);
  if (!inputParsed.success) {
    sendResult({
      type: 'result',
      success: false,
      output: '',
      error: `Validation failed: ${inputParsed.error.message}`,
    });
    process.exit(1);
  }

  const { agentYaml, state, taskContext, stepInput, tools, workflowSteps, fileBundle } = inputParsed.data;
  const agentName = agentYaml.name ?? 'unknown';
  const model = agentYaml.claude_model ?? 'composer-2.5';

  log('start', `Agent=${agentName} model=${model}`);
  const prompt = buildClaudeToolCallingPrompt({
    agentYaml,
    taskContext,
    stepInput,
    stateSummary: state ? { currentStep: (state as unknown as RcoState).currentStep, loopCount: (state as unknown as RcoState).loopCount } : undefined,
    fileBundle: fileBundle as import('../utils/file-gatherer.js').FileBundle | undefined,
  });
  log('prompt', prompt.slice(0, 300) + (prompt.length > 300 ? '...' : ''));

  let rawResponse: string;
  if (process.env.CURSOR_API_KEY) {
    // Production: real Cursor SDK agent
    try {
      rawResponse = await getResponseViaCursorSDK(prompt, agentName, model);
      log('cursor-sdk', `Agent "${agentName}" completed`);
    } catch (err) {
      log('cursor-sdk', `Failed: ${(err as Error).message}`);
      sendResult({ type: 'result', success: false, output: '', error: (err as Error).message });
      setImmediate(() => process.exit(1));
      return;
    }
  } else {
    // CI / unit tests: inline mock
    rawResponse = JSON.stringify({ output: `[Mock ${model} response for ${agentName}] Processed task context. Output: structured result for next step.`, success: true });
  }
  log('response', rawResponse.slice(0, 200) + (rawResponse.length > 200 ? '...' : ''));

  const responseParsed = parseClaudeResponseText(rawResponse);

  const toolResults: string[] = [];
  const toolList = tools ?? agentYaml.tools ?? [];
  const stateCast = state as unknown as RcoState;
  for (const toolName of toolList) {
    const out = runTool(toolName, taskContext.slice(0, 100), stateCast, workflowSteps);
    toolResults.push(`${toolName}: ${out}`);
  }
  if (toolResults.length > 0) {
    log('tools', toolResults.join('; '));
  }

  let dotGraph: string | undefined = responseParsed.dotGraph;
  if (toolList.includes('dependency-mapper') && !dotGraph) {
    dotGraph = runTool('dependency-mapper', '', stateCast, workflowSteps);
  }

  const output = [responseParsed.output, ...toolResults].filter(Boolean).join('\n');
  const result: WorkerOutput = {
    type: 'result',
    success: responseParsed.success ?? true,
    output,
    dotGraph: dotGraph ?? undefined,
    error: responseParsed.error,
  };
  const validated = WorkerOutputSchema.safeParse(result);
  if (!validated.success) {
    log('validation', `WorkerOutput schema failed: ${validated.error.message}`);
  }
  sendResult(validated.success ? validated.data : result);
  setImmediate(() => process.exit(0));
}

function run(input: unknown): void {
  runAsync(input).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    sendResult({ type: 'result', success: false, output: '', error: msg });
    setImmediate(() => process.exit(1));
  });
}

if (typeof process.send === 'function') {
  process.on('message', (msg: unknown) => run(msg));
} else {
  const raw = process.argv[2];
  if (!raw) {
    sendResult({ type: 'result', success: false, output: '', error: 'Missing input JSON (argv or IPC)' });
    process.exit(1);
  }
  run(JSON.parse(raw) as unknown);
}
