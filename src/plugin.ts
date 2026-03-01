/**
 * RCO Claude Plugin — wraps orchestrator with Claude slash commands.
 * Slash commands: /rco-run:recipe PlanExecRevEx --task "..."
 * For production: install via Claude marketplace or sideload; manifest in plugin/manifest.json.
 */

import { runOrchestrator } from './rco/orchestrator.js';
import { exportCursor } from './rco/exportCursor.js';
import { loadRcoConfig } from './rco/loadConfig.js';
import { PluginRunRecipeArgsSchema } from './schemas.js';

const RCO_VERBOSE = process.env.RCO_VERBOSE !== '0' && process.env.RCO_VERBOSE !== 'false';

function log(msg: string): void {
  if (RCO_VERBOSE) console.error(`[RCO plugin] ${msg}`);
}

export interface RcoPluginCommand {
  name: string;
  description: string;
  args?: string[];
}

/** Commands exposed to Claude (slash commands). */
export const RCO_PLUGIN_COMMANDS: RcoPluginCommand[] = [
  {
    name: 'rco-run:recipe',
    description: 'Run an RCO recipe (e.g. PlanExecRevEx) with a task description',
    args: ['recipe', '--task', '<task string>'],
  },
  {
    name: 'rco-status',
    description: 'Return current RCO session status or last run summary',
  },
  {
    name: 'rco-export',
    description: 'Export last session to Cursor rules and MCP snippet',
  },
];

export interface RunRecipeResult {
  success: boolean;
  sessionId: string;
  synthesizedOutput: string;
  steps: number;
  loops: number;
  exported?: { rulePath: string; mcpPath: string };
}

/**
 * Handle /rco-run:recipe PlanExecRevEx --task "Build a CLI"
 * Args can be: recipe name, then --task "..." or positional task.
 */
export function parseRunRecipeArgs(rawArgs: string[]): { recipe: string; task: string; options?: { noExport?: boolean } } {
  let recipe = 'PlanExecRevEx';
  let task = '';
  let noExport = false;
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--task' && rawArgs[i + 1]) {
      task = rawArgs[++i];
    } else if (rawArgs[i] === '--no-export') {
      noExport = true;
    } else if (rawArgs[i] === '--recipe' && rawArgs[i + 1]) {
      recipe = rawArgs[++i];
    } else if (!rawArgs[i].startsWith('--') && !task && rawArgs[i]) {
      // First non-flag could be recipe name if we already have recipe from --recipe
      if (recipe && task === '' && rawArgs[i] !== recipe) {
        task = rawArgs[i];
      } else if (!rawArgs[i].startsWith('--')) {
        recipe = rawArgs[i];
      }
    }
  }
  const parsed = PluginRunRecipeArgsSchema.safeParse({ recipe, task, options: { noExport } });
  if (!parsed.success) {
    throw new Error(`Invalid plugin args: ${parsed.error.message}`);
  }
  return { recipe: parsed.data.recipe, task: parsed.data.task, options: parsed.data.options };
}

/**
 * Execute recipe from plugin context (Claude slash command handler).
 * Returns result suitable for Claude to display.
 */
export async function runRecipeFromPlugin(args: string[]): Promise<RunRecipeResult> {
  const { recipe, task, options } = parseRunRecipeArgs(args);
  log(`runRecipeFromPlugin recipe=${recipe} task=${task.slice(0, 80)}...`);

  const configPath = 'config.yaml';
  let dashboardPort = 8080;
  try {
    const rcoConfig = loadRcoConfig(configPath);
    dashboardPort = rcoConfig.dashboard_port ?? 8080;
  } catch {
    // optional
  }

  const result = await runOrchestrator({
    recipeName: recipe,
    task,
    configPath,
    workerTimeoutMs: 60000,
    workerRetries: 2,
  });

  let exported: { rulePath: string; mcpPath: string } | undefined;
  if (!options?.noExport) {
    try {
      exported = exportCursor({ state: result.state });
      log(`Exported rule: ${exported.rulePath}`);
    } catch (e) {
      log(`Export failed: ${(e as Error).message}`);
    }
  }

  return {
    success: result.success,
    sessionId: result.state.sessionId,
    synthesizedOutput: result.synthesizedOutput,
    steps: result.state.currentStep + 1,
    loops: result.state.loopCount,
    exported,
  };
}

/**
 * Entry for Claude plugin: handle slash command and return response text.
 * E.g. commandName = "rco-run:recipe", commandArgs = ["PlanExecRevEx", "--task", "Build a todo app"].
 */
export async function handlePluginCommand(
  commandName: string,
  commandArgs: string[]
): Promise<string> {
  if (commandName === 'rco-run:recipe') {
    const result = await runRecipeFromPlugin(commandArgs);
    const lines = [
      `## RCO Run Complete`,
      `Session: ${result.sessionId}`,
      `Steps: ${result.steps} | Loops: ${result.loops}`,
      '',
      result.synthesizedOutput,
    ];
    if (result.exported) {
      lines.push('', `Exported: ${result.exported.rulePath}, ${result.exported.mcpPath}`);
    }
    return lines.join('\n');
  }
  if (commandName === 'rco-status') {
    return 'RCO status: last run not persisted in this process. Use rco-export to save session.';
  }
  if (commandName === 'rco-export') {
    return 'RCO export: run a recipe first with rco-run:recipe, then export is automatic unless --no-export.';
  }
  return `Unknown RCO command: ${commandName}. Available: ${RCO_PLUGIN_COMMANDS.map((c) => c.name).join(', ')}`;
}
