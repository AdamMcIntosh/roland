/**
 * RCO Benchmark — run sample tasks and time RCO vs simulated baseline.
 * Usage: npm run benchmark
 * Results are printed and can be documented in README Benchmarks section.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { runOrchestrator } from './rco/orchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RCO_VERBOSE = process.env.RCO_VERBOSE !== '0' && process.env.RCO_VERBOSE !== 'false';

function log(msg: string): void {
  if (RCO_VERBOSE) console.error(`[benchmark] ${msg}`);
}

/** Simulated baseline: fixed ms per "step" (no real execution). */
const BASELINE_MS_PER_STEP = 8000;
const BASELINE_STEPS_FOR_TASK = 4;

interface BenchmarkSample {
  name: string;
  task: string;
  recipe: string;
}

const SAMPLES: BenchmarkSample[] = [
  { name: 'Build todo app', task: 'Build a simple todo app with add/remove and persist to localStorage', recipe: 'PlanExecRevEx' },
  { name: 'CLI tool', task: 'Create a CLI tool that reads a JSON file and prints a summary', recipe: 'PlanExecRevEx' },
  { name: 'Refactor task', task: 'Refactor a function that parses query strings to use URLSearchParams', recipe: 'PlanExecRevEx' },
];

async function runRcoSample(sample: BenchmarkSample): Promise<{ ms: number; steps: number; success: boolean }> {
  const start = Date.now();
  let steps = 0;
  let success = false;
  try {
    const result = await runOrchestrator({
      recipeName: sample.recipe,
      task: sample.task,
      configPath: 'config.yaml',
      workerTimeoutMs: 15000,
      workerRetries: 1,
    });
    steps = result.state.currentStep + 1;
    success = result.success;
  } catch (err) {
    log(`RCO error: ${(err as Error).message}`);
  }
  const ms = Date.now() - start;
  return { ms, steps, success };
}

function runBaseline(sample: BenchmarkSample): { ms: number; steps: number } {
  const steps = BASELINE_STEPS_FOR_TASK;
  const ms = steps * BASELINE_MS_PER_STEP;
  return { ms, steps };
}

export async function runBenchmark(): Promise<void> {
  console.log('RCO Benchmark\n============\n');
  const results: Array<{
    name: string;
    task: string;
    rcoMs: number;
    rcoSteps: number;
    rcoSuccess: boolean;
    baselineMs: number;
    baselineSteps: number;
  }> = [];

  for (const sample of SAMPLES) {
    process.stdout.write(`Running: ${sample.name} ... `);
    const baseline = runBaseline(sample);
    const rco = await runRcoSample(sample);
    results.push({
      name: sample.name,
      task: sample.task,
      rcoMs: rco.ms,
      rcoSteps: rco.steps,
      rcoSuccess: rco.success,
      baselineMs: baseline.ms,
      baselineSteps: baseline.steps,
    });
    console.log(`RCO ${rco.ms}ms (${rco.steps} steps) | baseline ${baseline.ms}ms (${baseline.steps} steps)`);
  }

  console.log('\nSummary');
  console.log('-------');
  const totalRco = results.reduce((a, r) => a + r.rcoMs, 0);
  const totalBaseline = results.reduce((a, r) => a + r.baselineMs, 0);
  console.log(`Total RCO: ${totalRco}ms | Total baseline (simulated): ${totalBaseline}ms`);
  console.log(`All RCO success: ${results.every((r) => r.rcoSuccess) ? 'yes' : 'no'}`);
  return;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runBenchmark().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
