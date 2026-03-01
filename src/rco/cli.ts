#!/usr/bin/env node
/**
 * RCO CLI — npm run rco -- --recipe PlanExecRevEx --task "Build a todo app"
 */

import { runOrchestrator } from './orchestrator.js';
import { startDashboard, broadcast } from './dashboard.js';
import { exportCursor } from './exportCursor.js';
import { loadRcoConfig } from './loadConfig.js';

function parseArgs(): { recipe: string; task: string; dashboard: boolean; export: boolean; verbose: boolean } {
  const args = process.argv.slice(2);
  let recipe = 'PlanExecRevEx';
  let task = '';
  let dashboard = false;
  let doExport = true;
  let verbose = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--recipe' && args[i + 1]) {
      recipe = args[++i];
    } else if (args[i] === '--task' && args[i + 1]) {
      task = args[++i];
    } else if (args[i] === '--dashboard') {
      dashboard = true;
    } else if (args[i] === '--no-export') {
      doExport = false;
    } else if (args[i] === '--quiet') {
      verbose = false;
    }
  }
  return { recipe, task, dashboard, export: doExport, verbose };
}

async function main(): Promise<void> {
  const { recipe, task, dashboard: useDashboard, export: doExport, verbose } = parseArgs();

  if (!task) {
    console.error('Usage: npm run rco -- --recipe PlanExecRevEx --task "Build a todo app"');
    process.exit(1);
  }

  if (verbose) console.error('[RCO] Recipe:', recipe, '| Task:', task);

  let configPath = 'config.yaml';
  try {
    const rcoConfig = loadRcoConfig(configPath);
    const port = rcoConfig.dashboard_port ?? 8080;
    if (useDashboard) {
      startDashboard(port);
      if (verbose) console.error('[RCO] Dashboard WS on port', port);
    }
  } catch (e) {
    if (verbose) console.error('[RCO] Config load (optional):', (e as Error).message);
  }

  const onLog = useDashboard
    ? (p: { agent: string; phase: string; message: string }) => broadcast({ type: 'log', ...p })
    : undefined;

  if (verbose) console.error('[RCO] Starting orchestrator...');
  const result = await runOrchestrator({
    recipeName: recipe,
    task,
    onLog,
  });

  if (verbose) {
    console.error('[RCO] Session:', result.state.sessionId);
    console.error('[RCO] Steps:', result.state.currentStep + 1, '| Loops:', result.state.loopCount);
  }

  if (doExport) {
    const { rulePath, mcpPath } = exportCursor({ state: result.state });
    if (verbose) console.error('[RCO] Exported .cursor rule:', rulePath, '| MCP:', mcpPath);
  }

  console.log(result.synthesizedOutput);
  if (result.dotGraph && verbose) console.error('[RCO] DOT graph available in session state');
}

main().catch((err) => {
  console.error('[RCO] Fatal:', err);
  process.exit(1);
});
