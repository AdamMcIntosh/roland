/**
 * RCO Claude Plugin — wraps orchestrator with Claude slash commands.
 * Slash commands: /rco-run:recipe PlanExecRevEx --task "...", /rco-run:mode adaptive-swarm --task "...", /rco-new-agent "Create agent for testing"
 * Auto-reload: agents/ and recipes/ are read from disk on each run (no in-memory cache).
 */

import fs from 'fs';
import path from 'path';
import { runOrchestrator } from './rco/orchestrator.js';
import { exportCursor } from './rco/exportCursor.js';
import { loadRcoConfig } from './rco/loadConfig.js';
import { startDashboard } from './rco/dashboard.js';
import { PluginRunRecipeArgsSchema } from './schemas.js';
import { z } from 'zod';
import { hasConsent, setConsent, initTelemetry, captureException } from './telemetry.js';

const RCO_VERBOSE = process.env.RCO_VERBOSE !== '0' && process.env.RCO_VERBOSE !== 'false';

if (hasConsent()) initTelemetry();

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
    name: 'rco-run:mode',
    description: 'Run by execution mode: adaptive-swarm or collab-mode with --task "..."',
    args: ['mode', '--task', '<task string>'],
  },
  {
    name: 'rco-new-agent',
    description: 'Create a custom agent YAML from a prompt (e.g. "Create agent for testing"); saves to agents/custom-<name>.yaml',
    args: ['<prompt string>'],
  },
  {
    name: 'rco-status',
    description: 'Return current RCO session status or last run summary',
  },
  {
    name: 'rco-export',
    description: 'Export last session to Cursor rules and MCP snippet',
  },
  {
    name: 'rco-consent',
    description: 'Opt-in to telemetry: use /rco-consent:yes to enable (errors and sessions sent to Sentry)',
    args: ['yes'],
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

const RunModeArgsSchema = z.object({
  mode: z.enum(['adaptive-swarm', 'collab-mode']),
  task: z.string().min(1),
});

/**
 * Parse /rco-run:mode adaptive-swarm --task "Build todo app"
 */
export function parseRunModeArgs(rawArgs: string[]): { mode: 'adaptive-swarm' | 'collab-mode'; task: string } {
  let mode: 'adaptive-swarm' | 'collab-mode' = 'adaptive-swarm';
  let task = '';
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--task' && rawArgs[i + 1]) {
      task = rawArgs[++i];
    } else if (rawArgs[i] === 'adaptive-swarm' || rawArgs[i] === 'collab-mode') {
      mode = rawArgs[i] as 'adaptive-swarm' | 'collab-mode';
    } else if (!rawArgs[i].startsWith('--') && rawArgs[i] && !task) {
      task = rawArgs[i];
    }
  }
  const parsed = RunModeArgsSchema.safeParse({ mode, task });
  if (!parsed.success) throw new Error(`Invalid run mode args: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Run by execution mode (uses recipe of same name: adaptive-swarm or collab-mode).
 */
export async function runModeFromPlugin(args: string[]): Promise<RunRecipeResult> {
  const { mode, task } = parseRunModeArgs(args);
  log(`runModeFromPlugin mode=${mode} task=${task.slice(0, 80)}...`);
  const configPath = 'config.yaml';
  try {
    const rcoConfig = loadRcoConfig(configPath);
    startDashboard(rcoConfig.dashboard_port ?? 8080);
  } catch {
    startDashboard(8080);
  }
  const result = await runOrchestrator({
    recipeName: mode,
    task,
    configPath,
    executionMode: mode,
    workerTimeoutMs: 60000,
    workerRetries: 2,
  });
  let exported: { rulePath: string; mcpPath: string } | undefined;
  try {
    exported = exportCursor({ state: result.state });
  } catch {
    // ignore
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

/** Generate a safe filename slug from user prompt (e.g. "Create agent for testing" -> "testing"). */
function slugFromPrompt(prompt: string): string {
  const lower = prompt
    .toLowerCase()
    .replace(/create agent for\s*/i, '')
    .replace(/agent for\s*/i, '')
    .trim();
  const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
  return slug.slice(0, 50);
}

/** YAML template for a custom agent (role_prompt from user, default model and tools). */
const CUSTOM_AGENT_TEMPLATE = `name: {{name}}
role_prompt: {{role_prompt}}
recommended_model: claude-3-5-sonnet-20241022
claude_model: claude-3-5-sonnet-20241022
temperature: 0.6
tools:
  - search
  - code
  - terminal
`;

/**
 * Generate custom agent YAML from user prompt and save to agents/custom-<name>.yaml.
 * Auto-reload: next runOrchestrator call will load agents from disk and include the new file.
 */
export function generateAndSaveCustomAgent(userPrompt: string, agentsDir: string = 'agents'): { path: string; name: string } {
  const name = slugFromPrompt(userPrompt);
  const fileName = `custom-${name}.yaml`;
  const role_prompt = userPrompt.trim().replace(/\n/g, ' ');
  const yaml = CUSTOM_AGENT_TEMPLATE.replace(/\{\{\s*name\s*\}\}/g, name).replace(
    /\{\{\s*role_prompt\s*\}\}/g,
    role_prompt
  );
  const dir = path.isAbsolute(agentsDir) ? agentsDir : path.join(process.cwd(), agentsDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, yaml, 'utf-8');
  log(`Custom agent written: ${filePath}`);
  return { path: filePath, name };
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
  try {
    return await handlePluginCommandImpl(commandName, commandArgs);
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), { command: commandName });
    throw err;
  }
}

async function handlePluginCommandImpl(
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
  if (commandName === 'rco-run:mode') {
    const result = await runModeFromPlugin(commandArgs);
    const lines = [
      `## RCO Run (mode) Complete`,
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
  if (commandName === 'rco-new-agent') {
    const prompt = commandArgs.join(' ').trim() || 'Custom agent';
    const { path: filePath, name } = generateAndSaveCustomAgent(prompt);
    return `Custom agent "${name}" created. File: ${filePath}. YAML changes are loaded on next run (auto-reload).`;
  }
  if (commandName === 'rco-status') {
    return 'RCO status: last run not persisted in this process. Use rco-export to save session.';
  }
  if (commandName === 'rco-export') {
    return 'RCO export: run a recipe first with rco-run:recipe, then export is automatic unless --no-export.';
  }
  if (commandName === 'rco-consent') {
    const arg = (commandArgs[0] ?? '').toLowerCase();
    if (arg === 'yes') {
      setConsent('user');
      initTelemetry();
      return 'RCO telemetry: consent saved. Opt-in active; errors and sessions may be sent to Sentry. Set SENTRY_DSN (or RCO_SENTRY_DSN) for your project to receive them.';
    }
    return `RCO consent: use /rco-consent:yes to opt in. Current consent: ${hasConsent() ? 'yes' : 'no'}.`;
  }
  return `Unknown RCO command: ${commandName}. Available: ${RCO_PLUGIN_COMMANDS.map((c) => c.name).join(', ')}`;
}

