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
import { AGENT_TIMEOUT_MS } from './constants.js';
import {
  cleanupSdkSession,
  configureSdkProcessLimits,
  resolveSdkSettleMs,
  waitForSdkRun,
} from '../utils/sdk-lifecycle.js';

configureSdkProcessLimits();

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


// ── Network-error helpers (mirrors team-orchestrator.ts) ─────────────────────
// Kept local so agentWorker.ts stays self-contained as a child-process entry
// point (no shared state with the orchestrator).

const WORKER_NETWORK_PATTERNS = [
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ENETUNREACH',
  'ConnectError', 'connect error', 'connection reset', 'connection refused',
  'connection closed', 'socket hang up', 'network error', 'fetch failed',
  'aborted', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
];

// Network: 2s → 5s → 10s → 20s → 30s
const WORKER_NETWORK_DELAYS = [2_000, 5_000, 10_000, 20_000, 30_000];
// Generic: 5s → 10s → 20s → 30s → 45s
const WORKER_GENERIC_DELAYS = [5_000, 10_000, 20_000, 30_000, 45_000];

/**
 * Apply ±30% random jitter to a delay (mirrors withJitter in team-orchestrator.ts).
 * Prevents all concurrent worker retries from hammering the API simultaneously.
 */
function withWorkerJitter(delayMs: number, factor = 0.3): number {
  const delta = Math.round(delayMs * factor * (Math.random() * 2 - 1));
  return Math.max(100, delayMs + delta);
}

function isWorkerNetworkError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return WORKER_NETWORK_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
}

/**
 * Single SDK call — no retry.  Retry logic lives in the wrapper below.
 */
async function getResponseViaCursorSDK(prompt: string, agentName: string, model: string): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error('CURSOR_API_KEY is not set');

  // Dynamic import keeps the mock paths working without the SDK installed.
  const { Agent } = await import('@cursor/sdk') as typeof import('@cursor/sdk');

  type SdkAgent = Awaited<ReturnType<typeof Agent.create>>;
  type SdkRun = Awaited<ReturnType<SdkAgent['send']>>;

  let agent: SdkAgent | undefined;
  let run: SdkRun | undefined;

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: toCursorModelId(model, agentName) },
      name: agentName,
      local: { cwd: process.cwd() },
    });

    run = await agent.send(prompt);
    const runResult = await waitForSdkRun(run, {
      timeoutMs: AGENT_TIMEOUT_MS,
      agentName,
    });

    if (runResult.status === 'error' || runResult.status === 'cancelled') {
      throw new Error(`Cursor agent "${agentName}" ${runResult.status}: ${runResult.result ?? 'no detail'}`);
    }

    return JSON.stringify({ output: runResult.result ?? '', success: true });
  } finally {
    const settleMs = resolveSdkSettleMs(agentName, prompt);
    const { forced } = await cleanupSdkSession(agent, run, { settleMs, agentName });
    if (forced) {
      log('cursor-sdk', `Force cleanup after settle (${settleMs}ms) for ${agentName}`);
    }
  }
}

/**
 * Resilient wrapper around getResponseViaCursorSDK.
 *
 * Network errors use WORKER_NETWORK_DELAYS (2 s → 5 s → 10 s → 20 s → 30 s).
 * Other errors use WORKER_GENERIC_DELAYS (5 s → 10 s → 20 s → 30 s → 45 s).
 * Max 5 total attempts. Throws on final failure so the caller can surface a
 * clean error envelope.
 */
async function getResponseViaCursorSDKWithRetry(prompt: string, agentName: string, model: string): Promise<string> {
  const maxAttempts = 5;
  let lastErr: Error = new Error('unknown');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getResponseViaCursorSDK(prompt, agentName, model);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxAttempts) break;

      const netError = isWorkerNetworkError(lastErr);
      const delayTable = netError ? WORKER_NETWORK_DELAYS : WORKER_GENERIC_DELAYS;
      const baseDelay = delayTable[attempt - 1] ?? delayTable[delayTable.length - 1];
      const delay = withWorkerJitter(baseDelay);   // ±30% random jitter

      log(
        'cursor-sdk',
        netError
          ? `Cursor API temporarily unavailable (${lastErr.message.slice(0, 80).trim()}) — retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt}/${maxAttempts})`
          : `Attempt ${attempt} failed: ${lastErr.message.slice(0, 80)} — retrying in ${(delay / 1000).toFixed(1)}s`,
      );

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
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
    // Production: real Cursor SDK agent (with network-aware retry)
    try {
      rawResponse = await getResponseViaCursorSDKWithRetry(prompt, agentName, model);
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
