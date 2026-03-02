#!/usr/bin/env node
/**
 * RCO Manual QA: run 5–10 scenarios, log timings, compare to hardcoded benchmark mocks.
 * Usage: npm run qa -- [--scenario <name>] [--all]
 * Scenarios: todo-app, bug-fix, api-design, security-audit, webapp, doc-refactor, desktop-app, code-review, microservices, plan-exec-rev-ex
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { runOrchestrator, type RunWorkerFn } from '../src/rco/orchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/** Hardcoded mock benchmarks (ms) for typical multi-agent runner baselines — for comparison only */
const BASELINE_BENCHMARK_MS: Record<string, number> = {
  'todo-app': 12000,
  'bug-fix': 25000,
  'api-design': 15000,
  'security-audit': 22000,
  'webapp': 35000,
  'doc-refactor': 18000,
  'desktop-app': 40000,
  'code-review': 14000,
  'microservices': 28000,
  'plan-exec-rev-ex': 10000,
};

interface Scenario {
  name: string;
  recipe: string;
  task: string;
}

const SCENARIOS: Scenario[] = [
  { name: 'todo-app', recipe: 'PlanExecRevEx', task: 'Build a simple todo app with add/remove and persist to localStorage' },
  { name: 'bug-fix', recipe: 'PlanExecRevEx', task: 'Fix the bug: button click does not update counter' },
  { name: 'api-design', recipe: 'PlanExecRevEx', task: 'Design a REST API for a user profile service with CRUD' },
  { name: 'security-audit', recipe: 'PlanExecRevEx', task: 'Review this codebase for SQL injection and XSS risks' },
  { name: 'webapp', recipe: 'PlanExecRevEx', task: 'Scaffold a small full-stack web app with login and dashboard' },
  { name: 'doc-refactor', recipe: 'PlanExecRevEx', task: 'Refactor the README and add API documentation' },
  { name: 'desktop-app', recipe: 'PlanExecRevEx', task: 'Outline a desktop app with Electron and React' },
  { name: 'code-review', recipe: 'PlanExecRevEx', task: 'Perform a code review and suggest improvements' },
  { name: 'microservices', recipe: 'PlanExecRevEx', task: 'Propose a microservices split for a monolith' },
  { name: 'plan-exec-rev-ex', recipe: 'PlanExecRevEx', task: 'Build a minimal CLI tool that echoes arguments' },
];

/** Mock runWorker to avoid real forks in QA (fast, deterministic). */
const mockRunWorker: RunWorkerFn = async (_workerPath, input) => ({
  type: 'result',
  success: true,
  output: `[QA mock] ${(input as { agentYaml?: { name?: string } }).agentYaml?.name ?? 'agent'} completed step for: ${(input as { taskContext?: string }).taskContext?.slice(0, 50) ?? ''}...`,
});

async function runScenario(scenario: Scenario): Promise<{ ms: number; success: boolean }> {
  const start = Date.now();
  try {
    const result = await runOrchestrator({
      recipeName: scenario.recipe,
      task: scenario.task,
      configPath: path.join(projectRoot, 'config.yaml'),
      agentsDir: path.join(projectRoot, 'agents'),
      recipesDir: path.join(projectRoot, 'recipes'),
      stateFilePath: path.join(projectRoot, `.rco-qa-${scenario.name}.json`),
      runWorker: mockRunWorker,
      workerRetries: 0,
    });
    const ms = Date.now() - start;
    return { ms, success: result.success };
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`[QA] ${scenario.name} error:`, err);
    return { ms, success: false };
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const scenarioIndex = args.indexOf('--scenario');
  const runAll = args.includes('--all');
  const singleScenario = scenarioIndex >= 0 && args[scenarioIndex + 1] ? args[scenarioIndex + 1] : null;

  const toRun = singleScenario
    ? SCENARIOS.filter((s) => s.name === singleScenario)
    : runAll
      ? SCENARIOS
      : [SCENARIOS[0]]; // default: todo-app

  if (toRun.length === 0) {
    console.error('Usage: npm run qa -- [--scenario <name>] [--all]');
    console.error('Scenarios:', SCENARIOS.map((s) => s.name).join(', '));
    process.exit(1);
  }

  console.log('[RCO QA] Running', toRun.length, 'scenario(s)');
  console.log('---');

  (async () => {
    const results: { name: string; ms: number; success: boolean; omcMs?: number }[] = [];
    for (const scenario of toRun) {
      const { ms, success } = await runScenario(scenario);
      const baselineMs = BASELINE_BENCHMARK_MS[scenario.name];
      results.push({ name: scenario.name, ms, success, baselineMs });
      const diff = baselineMs != null ? (ms - baselineMs).toFixed(0) : 'N/A';
      console.log(`${scenario.name}: ${ms}ms (success=${success})${baselineMs != null ? ` | baseline: ${baselineMs}ms (diff: ${diff}ms)` : ''}`);
    }
    console.log('---');
    const totalMs = results.reduce((a, r) => a + r.ms, 0);
    console.log(`Total: ${totalMs}ms over ${results.length} scenario(s)`);
    console.log('[RCO QA] Done. Compare timings to baseline benchmarks above (mock mode; real runs use real workers).');
  })();
}

main();
