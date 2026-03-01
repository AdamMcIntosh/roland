#!/usr/bin/env node
/**
 * RCO Agent Worker — child process that "executes" an agent (mock or Puppeteer-based Claude simulation).
 * Receives WorkerInput via IPC, validates with Zod, runs tools, sends WorkerOutput.
 * Set RCO_USE_PUPPETEER=1 to use headless browser Claude simulation (local mock page).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { WorkerInputSchema, type RcoState, type WorkerOutput } from './types.js';
import { runTool } from './tools.js';

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

/** Resolve path to Claude mock HTML (dist/rco/fixtures or src/rco/fixtures). */
function resolveMockPagePath(): string {
  const candidates = [
    path.join(__dirname, 'fixtures', 'claude-mock-page.html'),
    path.join(__dirname, '..', '..', 'dist', 'rco', 'fixtures', 'claude-mock-page.html'),
    path.join(__dirname, '..', '..', 'src', 'rco', 'fixtures', 'claude-mock-page.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

/** Puppeteer-based Claude simulation: open local mock page and read response. */
async function getResponseViaPuppeteer(prompt: string, agentName: string, model: string): Promise<string> {
  const mockPath = resolveMockPagePath();
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const fileUrl = pathToFileURL(mockPath).href + `?prompt=${encodeURIComponent(prompt.slice(0, 500))}&agent=${encodeURIComponent(agentName)}&model=${encodeURIComponent(model)}`;
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 10000 });
    const response = (await page.evaluate('typeof window !== "undefined" && window.__rco_mock_response ? window.__rco_mock_response : ""')) as string;
    return response || `[Puppeteer ${model} response for ${agentName}]\nProcessed task context.`;
  } finally {
    await browser.close();
  }
}

async function runAsync(input: unknown): Promise<void> {
  const parsed = WorkerInputSchema.safeParse(input);
  if (!parsed.success) {
    sendResult({
      type: 'result',
      success: false,
      output: '',
      error: `Validation failed: ${parsed.error.message}`,
    });
    process.exit(1);
  }

  const { agentYaml, state, taskContext, stepInput, tools, workflowSteps } = parsed.data;
  const agentName = agentYaml.name ?? 'unknown';
  const model = agentYaml.claude_model ?? 'claude-3-5-sonnet-20241022';

  log('start', `Agent=${agentName} model=${model}`);
  const prompt = `Task: ${taskContext}\n${stepInput ? `Input from previous step:\n${stepInput}` : ''}`;
  log('prompt', prompt.slice(0, 200) + (prompt.length > 200 ? '...' : ''));

  let mockResponse: string;
  if (process.env.RCO_USE_PUPPETEER === '1' || process.env.RCO_USE_PUPPETEER === 'true') {
    try {
      mockResponse = await getResponseViaPuppeteer(prompt, agentName, model);
      log('puppeteer', 'Got response from Claude mock page');
    } catch (err) {
      const fallback = `[Mock ${model} response for ${agentName}]\nProcessed task context. Output: structured result for next step.`;
      log('puppeteer', `Fallback to inline mock: ${(err as Error).message}`);
      mockResponse = fallback;
    }
  } else {
    mockResponse = `[Mock ${model} response for ${agentName}]\nProcessed task context. Output: structured result for next step.`;
  }
  log('response', mockResponse.slice(0, 150) + '...');

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

  let dotGraph: string | undefined;
  if (toolList.includes('dependency-mapper')) {
    dotGraph = runTool('dependency-mapper', '', stateCast, workflowSteps);
  }

  const output = [mockResponse, ...toolResults].filter(Boolean).join('\n');
  sendResult({
    type: 'result',
    success: true,
    output,
    dotGraph: dotGraph ?? undefined,
  });
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
