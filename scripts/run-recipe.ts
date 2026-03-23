#!/usr/bin/env node
/**
 * Roland Recipe Runner — autonomous step loop via Goose
 *
 * Drives a recipe workflow end-to-end. Each step spawns a headless Goose
 * session with the Developer extension active (file read/write + shell),
 * so agents actually edit files and run commands — not just produce text.
 *
 * Usage:
 *   npx tsx scripts/run-recipe.ts --recipe VB6Migration --task "Migrate Form1.frm"
 *   npx tsx scripts/run-recipe.ts --recipe BugFix --task "Fix null ref" --project /path/to/project
 *   npx tsx scripts/run-recipe.ts --recipe VB6Migration --task "..." --dry-run
 *   npx tsx scripts/run-recipe.ts --recipe VB6Migration --task "..." --max-turns 50 --timeout 600
 *
 * Requirements:
 *   goose CLI in PATH  — https://block.github.io/goose/
 *   OPENROUTER_API_KEY — used by Goose when provider=openrouter (the default routing path)
 *   ROLAND_PROJECT_ROOT or --project — project directory for context + file operations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { buildContextBlock } from '../src/utils/migration-context.js';
import {
  normaliseGooseModel,
  spawnGooseSession,
  isGooseAvailable,
  getGooseVersion,
} from '../src/utils/goose-runner.js';
import { SessionContextManager } from '../src/server/session-context.js';

// ============================================================================
// Types
// ============================================================================

interface SubagentDef {
  name: string;
  provider: string;
  model: string;
  prompt: string;
}

interface RecipeStep {
  agent: string;
  input?: string;
  output_to?: string;
  loop_if?: string;
  loop_to?: string;
  final_output?: boolean;
  condition?: string;
}

interface RecipeOptions {
  cache_messages?: boolean;
  max_loops?: number;
}

interface RecipeYaml {
  name: string;
  description?: string;
  lead_model?: string;
  subagents: SubagentDef[];
  workflow: { steps: RecipeStep[] };
  options?: RecipeOptions;
}

interface StepOutput {
  stepIndex: number;
  agentName: string;
  model: string;
  prompt: string;
  output: string;
  durationMs: number;
  exitCode: number;
  loopTriggered: boolean;
}

interface RunSummary {
  recipe: string;
  task: string;
  startedAt: string;
  finishedAt: string;
  totalSteps: number;
  loopCount: number;
  steps: StepOutput[];
  finalOutput: string;
}

// ============================================================================
// Prompt interpolation
// ============================================================================

function interpolatePrompt(
  template: string,
  userTask: string,
  outputs: Map<string, string>
): string {
  let result = template.replace(/\{\{user_task\}\}/g, userTask);
  result = result.replace(/@(\w+)/g, (match, name: string) => {
    for (const [agentName, output] of outputs) {
      if (agentName.toLowerCase() === name.toLowerCase()) return output;
    }
    return match;
  });
  return result;
}

// ============================================================================
// Recipe file resolution
// ============================================================================

function resolveRecipeFile(recipeName: string): string {
  const thisFile = fileURLToPath(import.meta.url);
  const scriptsDir = path.dirname(thisFile);
  const rootDir = path.resolve(scriptsDir, '..');

  const candidates = [
    path.join(rootDir, 'dist', 'recipes', `${recipeName}.yaml`),
    path.join(rootDir, 'recipes', `${recipeName}.yaml`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const recipesDir = fs.existsSync(path.join(rootDir, 'dist', 'recipes'))
    ? path.join(rootDir, 'dist', 'recipes')
    : path.join(rootDir, 'recipes');

  const available = fs.existsSync(recipesDir)
    ? fs.readdirSync(recipesDir)
        .filter(f => f.endsWith('.yaml'))
        .map(f => f.replace('.yaml', ''))
        .join(', ')
    : '(none found)';

  throw new Error(`Recipe "${recipeName}" not found.\nAvailable: ${available}`);
}

// ============================================================================
// Output directory
// ============================================================================

function createOutputDir(projectRoot: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 6);
  const outDir = path.join(projectRoot, '.omc', 'recipe-runs', `${timestamp}-${suffix}`);
  fs.mkdirSync(path.join(outDir, 'steps'), { recursive: true });
  return outDir;
}

// ============================================================================
// Core runner
// ============================================================================

export async function runRecipe(opts: {
  recipeName: string;
  task: string;
  projectRoot?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  maxTurns?: number;
  maxRetries?: number;
}): Promise<RunSummary> {
  const {
    recipeName,
    task,
    projectRoot = process.env['ROLAND_PROJECT_ROOT']?.trim()
      ? path.resolve(process.env['ROLAND_PROJECT_ROOT'].trim())
      : process.cwd(),
    dryRun = false,
    timeoutMs = 300_000,
    maxTurns = 30,
    maxRetries = 1,
  } = opts;

  if (!dryRun && !isGooseAvailable()) {
    throw new Error(
      'goose CLI not found in PATH.\n' +
      'Install it from https://block.github.io/goose/ then re-run.\n' +
      'Or use --dry-run to preview prompts without executing.'
    );
  }

  const recipePath = resolveRecipeFile(recipeName);
  const recipeYaml = YAML.parse(fs.readFileSync(recipePath, 'utf-8')) as RecipeYaml;
  const maxLoops = recipeYaml.options?.max_loops ?? 3;

  const subagentMap = new Map<string, SubagentDef>(
    recipeYaml.subagents.map(s => [s.name.toLowerCase(), s])
  );

  // Validate loop_to references before executing any steps
  const stepAgentNames = new Set(recipeYaml.workflow.steps.map(s => s.agent.toLowerCase()));
  for (const step of recipeYaml.workflow.steps) {
    if (step.loop_to && !stepAgentNames.has(step.loop_to.toLowerCase())) {
      throw new Error(`Recipe validation: loop_to="${step.loop_to}" does not match any step agent name.`);
    }
  }

  // Load migration context (optional — non-migration recipes may not have roland-context.json)
  let contextBlock = '';
  try {
    contextBlock = buildContextBlock(projectRoot);
  } catch {
    // Context is optional
  }

  const outDir = dryRun ? null : createOutputDir(projectRoot);
  const startedAt = new Date().toISOString();
  const outputs = new Map<string, string>();
  const stepResults: StepOutput[] = [];

  // Start a session context to track decisions and progress across steps
  const sessionMgr = new SessionContextManager();
  const session = dryRun ? null : sessionMgr.start(task);

  const gooseVersion = dryRun ? null : getGooseVersion();

  console.log(`\n🎬 Roland Recipe Runner${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`   Recipe:  ${recipeYaml.name}`);
  console.log(`   Task:    ${task}`);
  console.log(`   Project: ${projectRoot}`);
  if (gooseVersion) console.log(`   Goose:   ${gooseVersion}`);
  console.log('');

  const steps = recipeYaml.workflow.steps;
  let currentStepIdx = 0;
  let loopCount = 0;

  while (currentStepIdx < steps.length) {
    const step = steps[currentStepIdx];
    const stepNum = currentStepIdx + 1;
    const subagent = subagentMap.get(step.agent.toLowerCase());

    if (!subagent) {
      throw new Error(`Step ${stepNum}: agent "${step.agent}" not found in subagents list.`);
    }

    const modelId = subagent.model ?? recipeYaml.lead_model ?? 'claude-sonnet-4-5';
    const gooseModel = normaliseGooseModel(modelId);

    // Build the full task prompt for this Goose session:
    // context block + session context + subagent system prompt + interpolated user task
    const sessionContextBlock = session
      ? sessionMgr.formatForSubagent(session.id)
      : '';

    const systemSection = [contextBlock, sessionContextBlock, subagent.prompt]
      .filter(Boolean)
      .join('\n\n---\n\n');

    const userSection = interpolatePrompt(
      step.input ?? `Complete your role for the task: ${task}`,
      task,
      outputs
    );

    const fullPrompt = interpolatePrompt(
      `${systemSection}\n\n## Your task\n${userSection}`,
      task,
      outputs
    );

    console.log(`[Step ${stepNum}/${steps.length}] ${subagent.name} (${gooseModel.provider}/${gooseModel.model})...`);

    if (dryRun) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(fullPrompt.slice(0, 800));
      if (fullPrompt.length > 800) console.log('\n...(truncated)');
      console.log(`${'─'.repeat(60)}\n`);

      const placeholder = `[DRY RUN — ${subagent.name} output placeholder]`;
      outputs.set(subagent.name, placeholder);
      stepResults.push({
        stepIndex: currentStepIdx,
        agentName: subagent.name,
        model: `${gooseModel.provider}/${gooseModel.model}`,
        prompt: fullPrompt,
        output: placeholder,
        durationMs: 0,
        exitCode: 0,
        loopTriggered: false,
      });
      currentStepIdx++;
      continue;
    }

    // Spawn a headless Goose session for this step, with retry on failure
    // Named session preserves conversation history across steps
    const gooseSessionName = session ? `roland-${session.id}` : undefined;
    let sessionResult = await spawnGooseSession({
      task: fullPrompt,
      model: gooseModel,
      projectRoot,
      timeoutMs,
      maxTurns,
      sessionName: gooseSessionName,
    });

    let { output, exitCode, durationMs } = sessionResult;
    let retryCount = 0;

    while (exitCode !== 0 && retryCount < maxRetries) {
      retryCount++;
      console.log(`   ⚠️  exit code ${exitCode} — retry ${retryCount}/${maxRetries}`);
      const retryPrompt = `${fullPrompt}\n\n## Previous attempt failed\nThe prior attempt exited with code ${exitCode}. Output:\n${output.slice(0, 1000)}\n\nPlease fix any issues and complete the task.`;
      sessionResult = await spawnGooseSession({
        task: retryPrompt,
        model: gooseModel,
        projectRoot,
        timeoutMs,
        maxTurns,
      });
      ({ output, exitCode, durationMs } = sessionResult);
    }

    outputs.set(subagent.name, output);

    if (exitCode !== 0) {
      console.log(`   ⚠️  exit code ${exitCode} after ${retryCount} retry/retries (${(durationMs / 1000).toFixed(1)}s) — continuing`);
    } else {
      console.log(`   ✅ done (${(durationMs / 1000).toFixed(1)}s, ${output.length} chars)${retryCount > 0 ? ` [recovered after ${retryCount} retry]` : ''}`);
    }

    // Update session context with step result
    if (session) {
      sessionMgr.update(session.id, {
        note: `Step ${stepNum} — ${subagent.name} (${gooseModel.model}): exit ${exitCode}, ${output.length} chars`,
        advance_step: true,
      });
    }

    // Check loop condition
    let loopTriggered = false;
    if (step.loop_if && step.loop_to && loopCount < maxLoops) {
      if (output.toLowerCase().includes(step.loop_if.toLowerCase())) {
        const targetIdx = steps.findIndex(
          s => s.agent.toLowerCase() === step.loop_to!.toLowerCase()
        );
        if (targetIdx === -1) {
          throw new Error(`Step ${stepNum}: loop_to="${step.loop_to}" could not be resolved at runtime.`);
        }

        loopTriggered = true;
        loopCount++;
        console.log(`   🔁 Loop "${step.loop_if}" matched (${loopCount}/${maxLoops}) — jumping to ${step.loop_to}`);

        stepResults.push({ stepIndex: currentStepIdx, agentName: subagent.name, model: `${gooseModel.provider}/${gooseModel.model}`, prompt: fullPrompt, output, durationMs, exitCode, loopTriggered });

        if (outDir) {
          fs.writeFileSync(
            path.join(outDir, 'steps', `${String(stepResults.length).padStart(2, '0')}-${subagent.name}-loop${loopCount}.md`),
            `# ${subagent.name} (loop ${loopCount})\n\n${output}`
          );
        }

        currentStepIdx = targetIdx;
        continue;
      }
    }

    stepResults.push({ stepIndex: currentStepIdx, agentName: subagent.name, model: `${gooseModel.provider}/${gooseModel.model}`, prompt: fullPrompt, output, durationMs, exitCode, loopTriggered });

    if (outDir) {
      fs.writeFileSync(
        path.join(outDir, 'steps', `${String(stepResults.length).padStart(2, '0')}-${subagent.name}.md`),
        `# ${subagent.name}\n\n${output}`
      );
    }

    currentStepIdx++;
  }

  const finishedAt = new Date().toISOString();
  const finalOutput = stepResults[stepResults.length - 1]?.output ?? '';

  const summary: RunSummary = {
    recipe: recipeName,
    task,
    startedAt,
    finishedAt,
    totalSteps: stepResults.length,
    loopCount,
    steps: stepResults,
    finalOutput,
  };

  if (outDir) {
    fs.writeFileSync(
      path.join(outDir, 'output.md'),
      `# Recipe Run: ${recipeYaml.name}\n\n**Task**: ${task}\n**Started**: ${startedAt}\n**Finished**: ${finishedAt}\n\n---\n\n${finalOutput}`
    );
    const summaryForFile = {
      ...summary,
      steps: summary.steps.map(s => ({
        ...s,
        prompt: '(omitted)',
        output: s.output.slice(0, 200) + (s.output.length > 200 ? '...' : ''),
      })),
    };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summaryForFile, null, 2));
    console.log(`\n📁 Output: ${outDir}`);
  }

  console.log(`\n✅ Recipe complete — ${stepResults.length} steps, ${loopCount} loop(s)`);
  if (finalOutput && !dryRun) {
    console.log('\n─── Final Output ───────────────────────────────────────');
    console.log(finalOutput.slice(0, 1200));
    if (finalOutput.length > 1200) console.log('\n...(see output.md for full output)');
    console.log('────────────────────────────────────────────────────────\n');
  }

  return summary;
}

// ============================================================================
// CLI entry point
// ============================================================================

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        result[key] = true;
      } else {
        result[key] = next;
        i++;
      }
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const recipe = args['recipe'] as string;
  const task = args['task'] as string;
  const project = args['project'] as string | undefined;
  const dryRun = args['dry-run'] === true;
  const timeout = args['timeout'] ? Number(args['timeout']) * 1000 : 300_000;
  const maxTurns = args['max-turns'] ? Number(args['max-turns']) : 30;
  const maxRetries = args['max-retries'] ? Number(args['max-retries']) : 1;

  if (!recipe || !task) {
    console.error(
      'Usage: npx tsx scripts/run-recipe.ts ' +
      '--recipe <name> --task "<description>" ' +
      '[--project <path>] [--dry-run] [--timeout <seconds>] [--max-turns <n>]'
    );
    process.exit(1);
  }

  try {
    await runRecipe({ recipeName: recipe, task, projectRoot: project, dryRun, timeoutMs: timeout, maxTurns, maxRetries });
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
