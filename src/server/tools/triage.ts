/**
 * ## P1 Honesty & Consolidation
 *
 * Triage auto-pilot tool and agent/recipe matching catalogs.
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { McpToolError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { ComplexityAnalysis } from '../../orchestrator/complexity-classifier.js';
import { classifyWithSemantic } from '../../orchestrator/complexity-classifier.js';
import { ModelRouter } from '../../orchestrator/model-router.js';
import { classifyExecutionPath } from '../../rco/execution-path.js';
import { resolveAgentsDir as resolveAgentsDirShared } from '../../rco/loadConfig.js';
import { selectRelevantFiles, bundleFileContents, formatBundleAsMarkdown, DEFAULT_CONTEXT_GATHERING_CONFIG } from '../../utils/file-gatherer.js';
import type { FileBundle } from '../../utils/file-gatherer.js';
import { AGENT_OPENROUTER_MODELS, OPENROUTER_MODELS, getBudgetDegradedModel } from './cost.js';
import { buildRecipeCatalog } from './recipes.js';
import type { AgentCatalogEntry, McpToolContext, McpToolRegistrar } from './types.js';

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  { name: 'architect', role: 'System design, architecture decisions, component diagrams, trade-off analysis', triggers: ['architect', 'design', 'system design', 'component', 'diagram', 'trade-off', 'tradeoff', 'schema', 'database design', 'erd', 'data model', 'api design', 'microservice', 'infrastructure'], tier: 'complex' },
  { name: 'executor', role: 'Write clean, working code; implement features; make changes', triggers: ['implement', 'build', 'create', 'add', 'write', 'code', 'feature', 'make', 'develop', 'scaffold', 'generate'], tier: 'medium' },
  { name: 'researcher', role: 'Codebase exploration, documentation review, root cause investigation', triggers: ['research', 'investigate', 'explore', 'find', 'search', 'look into', 'root cause', 'why does', 'how does', 'understand', 'explain codebase'], tier: 'medium' },
  { name: 'planner', role: 'Break complex tasks into sequenced, actionable steps', triggers: ['plan', 'break down', 'steps', 'roadmap', 'strategy', 'approach', 'how should', 'what order', 'sequence', 'prioritize'], tier: 'medium' },
  { name: 'critic', role: 'Code review, find bugs, security issues, improvement opportunities', triggers: ['review', 'critique', 'improve', 'issues', 'problems', 'smell', 'anti-pattern', 'best practice', 'code quality'], tier: 'medium' },
  { name: 'designer', role: 'UI/UX design, component layout, user flows, accessibility', triggers: ['ui', 'ux', 'design', 'layout', 'component', 'user flow', 'wireframe', 'accessibility', 'a11y', 'responsive', 'css', 'style', 'theme', 'color', 'font'], tier: 'medium' },
  { name: 'test-author', role: 'Design and write tests: unit, integration, E2E, edge cases, coverage analysis', triggers: ['write tests', 'test design', 'unit test', 'integration test', 'e2e', 'spec', 'jest', 'vitest', 'pytest', 'coverage', 'edge case'], tier: 'medium' },
  { name: 'test-executor', role: 'Run test suites, report results, reproduce bugs, verify fixes', triggers: ['run tests', 'test run', 'assert', 'reproduce', 'verify fix', 'regression', 'test suite', 'green'], tier: 'medium' },
  { name: 'security-reviewer', role: 'Vulnerability scanning, OWASP checks, hardening recommendations', triggers: ['security', 'vulnerability', 'owasp', 'cve', 'xss', 'sql injection', 'csrf', 'auth', 'authentication', 'authorization', 'encrypt', 'hardening', 'penetration'], tier: 'complex' },
  { name: 'writer', role: 'Technical documentation, README updates, API docs', triggers: ['document', 'docs', 'readme', 'api docs', 'jsdoc', 'docstring', 'changelog', 'guide', 'tutorial', 'explain'], tier: 'simple' },
  { name: 'build-fixer', role: 'Resolve TypeScript errors, compilation failures, CI/CD issues', triggers: ['build', 'compile', 'typescript error', 'ts error', 'ci', 'cd', 'pipeline', 'build fail', 'lint', 'eslint', 'type error', 'cannot find module'], tier: 'medium' },
  { name: 'code-reviewer', role: 'Comprehensive code review covering correctness, design, style, performance', triggers: ['code review', 'pull request', 'pr review', 'review this', 'check this code', 'look at this'], tier: 'medium' },
  { name: 'tdd-guide', role: 'Test-driven development coaching, red-green-refactor cycle', triggers: ['tdd', 'test driven', 'red green refactor', 'test first', 'failing test'], tier: 'medium' },
  { name: 'scientist', role: 'Data analysis, statistics, ML, hypothesis testing', triggers: ['data', 'analysis', 'statistics', 'ml', 'machine learning', 'model', 'predict', 'regression', 'classification', 'dataset', 'hypothesis'], tier: 'complex' },
  { name: 'explore', role: 'Map project structure, find patterns, navigate codebase', triggers: ['explore', 'navigate', 'structure', 'map', 'dependency', 'where is', 'find file', 'project layout'], tier: 'simple' },
  { name: 'analyst', role: 'Metrics, trends, quantitative analysis', triggers: ['metrics', 'trend', 'analyze', 'performance', 'benchmark', 'measure', 'profil'], tier: 'medium' },
  { name: 'vision', role: 'Long-term technical strategy, technology evaluation', triggers: ['strategy', 'long-term', 'tech stack', 'evaluate', 'compare', 'future', 'migration', 'upgrade'], tier: 'complex' },
];

function resolveAgentsDir(): string {
  return resolveAgentsDirShared(import.meta.url);
}

function loadAgentRolePrompt(agentName: string): string {
  try {
    const agentsDir = resolveAgentsDir();
    const agentPath = path.join(agentsDir, `${agentName}.yaml`);
    if (!fs.existsSync(agentPath)) {
      return `You are the ${agentName} agent. Apply your specialized expertise to this task.`;
    }
    const raw = YAML.parse(fs.readFileSync(agentPath, 'utf-8'));
    return raw?.role_prompt || `You are the ${agentName} agent. Apply your specialized expertise to this task.`;
  } catch {
    return `You are the ${agentName} agent. Apply your specialized expertise to this task.`;
  }
}

function buildTriageReasoning(
  topAgent: { name: string; score: number; matchedTriggers: string[] },
  topRecipe: { name: string; score: number; matchedTriggers: string[] },
  complexity: ComplexityAnalysis,
  suggestRecipe: boolean,
): string {
  const parts: string[] = [];

  if (topAgent.score > 0) {
    parts.push(`Matched agent "${topAgent.name}" (triggers: ${topAgent.matchedTriggers.join(', ')}).`);
  } else {
    parts.push('No strong agent match — defaulting to executor for general implementation.');
  }

  parts.push(`Complexity: ${complexity.complexity} (score ${complexity.score}/100).`);

  if (suggestRecipe) {
    parts.push(`Recipe "${topRecipe.name}" is a good fit (triggers: ${topRecipe.matchedTriggers.join(', ')}). Consider running the full multi-agent workflow for better results.`);
  }

  return parts.join(' ');
}

export function registerTriageTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  const recipeCatalog = buildRecipeCatalog(ctx.recipesDir);

  registrar.registerTool(
    'triage',
    'Auto-pilot: analyze any user message and recommend agent persona, recipe workflow, and execution path (direct in chat vs Pure ClosedLoop team mission). Call FIRST on new coding requests. In Cursor, @roland + triage is self-contained — no Hermes required. Returns execution_path.path, summary, team_offer, team_command (roland team + --loop-template), loop_template, loop_template_reason, forced, cleaned_goal, plus agent and complexity routing. Pure ClosedLoop default (use_pm_team: false). Power-user override: --force-team or force team / full team / run as team / spawn team.',
    async (args: Record<string, unknown>) => {
      const message = args.message as string;
      if (!message) throw new McpToolError('triage', 'message is required');

      const lowerMessage = message.toLowerCase();
      const executionPath = classifyExecutionPath(message);

      const agentScores = AGENT_CATALOG.map(agent => {
        let score = 0;
        const matchedTriggers: string[] = [];
        for (const trigger of agent.triggers) {
          if (lowerMessage.includes(trigger)) {
            const weight = trigger.includes(' ') ? 3 : 1;
            score += weight;
            matchedTriggers.push(trigger);
          }
        }
        return { ...agent, score, matchedTriggers };
      });

      agentScores.sort((a, b) => b.score - a.score);
      const topAgent = agentScores[0];
      const runnersUp = agentScores.filter(a => a.score > 0 && a.name !== topAgent.name).slice(0, 2);

      const recipeScores = recipeCatalog.map(recipe => {
        let score = 0;
        const matchedTriggers: string[] = [];
        for (const trigger of recipe.triggers) {
          if (lowerMessage.includes(trigger)) {
            const weight = trigger.includes(' ') ? 4 : 1;
            score += weight;
            matchedTriggers.push(trigger);
          }
        }
        const soloBonus = score > 0 && recipe.category === 'solo' ? 3 : 0;
        return { ...recipe, score: score + soloBonus, matchedTriggers };
      });

      recipeScores.sort((a, b) => b.score - a.score);
      const topRecipe = recipeScores[0] ?? { name: '', fileKey: '', score: 0, matchedTriggers: [] as string[], description: '', agents: [] as string[] };

      const complexity = await classifyWithSemantic(message, ctx.config);
      const recipeThreshold = complexity.complexity === 'complex' ? 1 : 2;
      const suggestRecipe = topRecipe.score >= recipeThreshold;

      const recommendation: Record<string, unknown> = {
        execution_path: {
          path: executionPath.path,
          summary: executionPath.summary,
          reasons: executionPath.reasons,
          estimated_minutes: executionPath.estimatedMinutes,
          team_offer: executionPath.teamOffer,
          team_command: executionPath.teamCommand ?? null,
          loop_template: executionPath.loopTemplate ?? null,
          loop_template_reason: executionPath.loopTemplateReason ?? null,
          forced: executionPath.forced ?? false,
          cleaned_goal: executionPath.cleanedGoal ?? null,
        },
        agent: {
          name: topAgent.score > 0 ? topAgent.name : 'executor',
          role: topAgent.score > 0 ? topAgent.role : 'General implementation — no strong pattern match; defaulting to executor.',
          confidence: topAgent.score > 0 ? (topAgent.score >= 3 ? 'high' : 'medium') : 'low',
          matched_triggers: topAgent.matchedTriggers,
        },
        complexity: { level: complexity.complexity, score: complexity.score },
        reasoning: buildTriageReasoning(topAgent, topRecipe, complexity, suggestRecipe),
      };

      if (runnersUp.length > 0) {
        recommendation.alternative_agents = runnersUp.map(a => ({
          name: a.name, role: a.role, matched_triggers: a.matchedTriggers,
        }));
      }

      if (suggestRecipe) {
        recommendation.recipe = {
          name: topRecipe.fileKey,
          description: topRecipe.description,
          agents: topRecipe.agents,
          confidence: topRecipe.score >= 3 ? 'high' : 'medium',
          matched_triggers: topRecipe.matchedTriggers,
          start_command: `Use the start_recipe tool with recipe_name="${topRecipe.fileKey}" and the user's task.`,
        };
      }

      const modeMap: Record<string, string> = {
        local: 'local', simple: 'quick', medium: 'standard', complex: 'deep',
      };
      recommendation.suggested_mode = modeMap[complexity.complexity] || 'standard';

      if (complexity.complexity === 'local' && ctx.config.ollama?.enabled) {
        const ollamaCfg = ctx.config.ollama;
        const ollamaHealth = await ModelRouter.checkOllamaHealth(ollamaCfg.base_url);
        if (ollamaHealth.available) {
          recommendation.provider = 'local';
          recommendation.ollama_model = ollamaCfg.model;
          recommendation.ollama_base_url = ollamaCfg.base_url;
          recommendation.instructions = `This is a trivial task. Route to local Ollama model "${ollamaCfg.model}" at ${ollamaCfg.base_url}. $0 cost.`;
          return recommendation;
        }
        const fallbackTier = ollamaCfg.fallback_to || 'simple';
        recommendation.provider = 'openrouter';
        recommendation.ollama_fallback = true;
        recommendation.ollama_fallback_reason = 'Ollama unavailable';
        recommendation.ollama_fallback_tier = fallbackTier;
        (complexity as { complexity: string }).complexity = fallbackTier;
      }

      const agentName = topAgent.score > 0 ? topAgent.name : 'executor';
      let openrouterModel = AGENT_OPENROUTER_MODELS[agentName]
        || OPENROUTER_MODELS[complexity.complexity]
        || 'google/gemini-2.5-flash';

      const degradedModel = getBudgetDegradedModel(agentName);
      const budgetDegraded = degradedModel !== null;
      if (budgetDegraded) openrouterModel = degradedModel;

      recommendation.openrouter_model = openrouterModel;
      recommendation.persona_instructions = loadAgentRolePrompt(agentName);
      recommendation.temperature = 0.7;

      const isComplexExecution = complexity.complexity === 'complex' && !budgetDegraded;
      if (isComplexExecution) {
        const gatheringConfig = ctx.config.context_gathering ?? DEFAULT_CONTEXT_GATHERING_CONFIG;
        let fileBundle: FileBundle | undefined;
        let fileBundleMarkdown = '';
        if (gatheringConfig.enabled) {
          try {
            const selectedFiles = await selectRelevantFiles(message, gatheringConfig);
            if (selectedFiles.length > 0) {
              fileBundle = bundleFileContents(selectedFiles, gatheringConfig.max_bytes);
              fileBundleMarkdown = formatBundleAsMarkdown(fileBundle);
            }
          } catch (err) {
            logger.warn(`[Triage] File gathering failed: ${(err as Error).message}`);
          }
        }

        const contextRule = fileBundle && fileBundle.files.length > 0
          ? `3. USE PROVIDED CONTEXT: The relevant_files below contain actual file contents from the codebase. `
            + `Use exact import paths, type names, and function signatures from these files. Do NOT guess or hallucinate APIs. `
            + `If you need additional files not listed, call the read_context tool with {"files": ["path/to/file.ts"]}.`
          : `3. USE PROVIDED CONTEXT: Call the read_context tool with {"files": ["path/to/file.ts"]} to read any file `
            + `from the codebase. Use exact import paths, type names, and function signatures. Do NOT guess or hallucinate APIs.`;

        recommendation.execution_strategy = {
          mode: 'subagent_writes_code',
          execution_model: 'minimax/minimax-m2.5',
          apply_model: 'main_session',
          reason: 'Complex task — MiniMax M2.5 subagent will write the code with near-Opus reasoning quality. Main session applies files to disk.',
          subagent_instructions: `You are a senior engineer writing production-ready code. Rules:\n`
            + `1. OUTPUT FORMAT: For each file, output "📄 path/to/file.ts:" followed by the COMPLETE file content in a code block. `
            + `Include ALL imports, types, error handling, and edge cases. Code must be ready to write to disk as-is.\n`
            + `2. NO PLACEHOLDERS: Do NOT use "// TODO", "// ...", or "implement here". Write the real implementation.\n`
            + `${contextRule}\n`
            + `4. INCLUDE TESTS: If modifying a module that has a test file, include the updated test file too.\n`
            + `5. ERROR FIXES: If you receive error output, analyze the EXACT error message and stack trace. `
            + `Fix the root cause, not symptoms. Include the complete fixed file, not just a diff.`,
          relevant_files: fileBundle?.files.map(f => ({ path: f.path, content: f.content })),
          relevant_files_markdown: fileBundleMarkdown || undefined,
        };
      } else {
        recommendation.execution_strategy = {
          mode: 'main_session_direct',
          execution_model: 'main_session',
          reason: budgetDegraded
            ? 'Budget degraded — main session handles execution on free models.'
            : 'Simple/medium task — main session (Flash) handles execution directly.',
        };
      }

      if (budgetDegraded) {
        recommendation.budget_degraded = true;
        recommendation.budget_notice = `Budget ≥80% used — switched to free model (${openrouterModel}). Quality may be reduced.`;
      }

      recommendation.instructions = executionPath.path === 'team'
        ? `${executionPath.summary} Do NOT implement in chat. ${executionPath.teamOffer ?? 'Offer roland team with --loop-template and wait for confirmation.'}` +
          (executionPath.loopTemplate ? ` Pure ClosedLoop template: ${executionPath.loopTemplate}.` : '')
        : suggestRecipe
          ? `Adopt the "${agentName}" persona. A multi-agent recipe "${topRecipe.name}" is recommended — offer to run it, or proceed as the recommended agent if the user prefers a single pass. ${executionPath.summary}`
          : isComplexExecution
            ? `This is a complex task. Spawn a subagent to write the code (see execution_strategy + relevant_files for full codebase context), then apply the output to files yourself. ${executionPath.summary}`
            : `Adopt the "${agentName}" persona for this task. Apply that agent's expertise and thinking style to your response. ${executionPath.summary}`;

      return recommendation;
    },
    {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The user\'s raw message or task description to analyze' },
      },
      required: ['message'],
    },
  );
}
