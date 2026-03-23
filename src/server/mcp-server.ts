/**
 * MCP Server Implementation (v2)
 *
 * Roland MCP Server — exposes cost routing, analytics, budget management,
 * and recipe execution as MCP tools for IDE agents (VS Code, Cursor, etc.).
 *
 * Tools provided:
 *   health_check    — server status
 *   triage          — auto-pilot: analyze message → agent + recipe recommendation
 *   route_model     — complexity-based model recommendation
 *   track_cost      — log token usage and return session totals
 *   manage_budget   — get/set/reset spending limits
 *   get_analytics   — session cost & token breakdowns
 *   suggest_mode    — advisory: quick vs. standard vs. deep
 *   list_recipes    — available workflow recipes
 *   start_recipe    — begin a recipe session, return first step prompt
 *   advance_recipe  — submit step output, get next step or summary
 *   preview_changes — generate markdown diff + optional HTML preview of file changes
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppConfig } from '../utils/types.js';
import { McpServerError, McpToolError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ComplexityClassifier, ComplexityAnalysis } from '../orchestrator/complexity-classifier.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { AdvancedCostTracker, getGlobalTracker } from '../orchestrator/advanced-cost-tracker.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { RecipeSessionManager, ParsedRecipe, SubagentDef, RecipeStepDef } from './recipe-session.js';
import { generateDiff } from '../utils/diff-engine.js';
import { normaliseGooseModel, spawnGooseSession, isGooseAvailable } from '../utils/goose-runner.js';
import { gitStatus, gitDiff, gitLog, gitCommit } from '../utils/git-tools.js';
import {
  buildContextBlock,
  appendRule,
  appendDecision,
  appendTestPattern,
  appendCustomSection,
  readContext,
  writeRcoState,
  readRcoState,
} from '../utils/migration-context.js';
import { SessionContextManager } from './session-context.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

// ============================================================================
// OpenRouter Model Mapping
// ============================================================================

/**
 * Maps complexity tiers to OpenRouter model IDs.
 * Used by triage and route_model to return valid OpenRouter slugs.
 */
const OPENROUTER_MODELS: Record<string, string> = {
  simple: 'google/gemini-2.5-flash',
  medium: 'deepseek/deepseek-chat',
  complex: 'anthropic/claude-sonnet-4',
  explain: 'google/gemini-2.5-flash',
};

/**
 * Free model fallbacks — used when budget exceeds 80%.
 * All models support tool calling and have 128K+ context.
 * Update these when better free models become available on OpenRouter.
 *
 * Last verified: March 2026
 */
const FREE_MODELS = {
  // Primary: Qwen3 Coder — best free coding model, 262K context, native tool calling
  primary: 'qwen/qwen3-coder:free',
  // Secondary: NVIDIA Nemotron — top SWE-Bench, multi-step agentic coding
  secondary: 'nvidia/nemotron-3-super-120b-a12b:free',
  // Tier-specific free models
  coding: 'qwen/qwen3-coder:free',               // Best free coder, agentic focus
  reasoning: 'nvidia/nemotron-3-super-120b-a12b:free', // Multi-step planning, tool use
  light: 'mistralai/mistral-small-3.1-24b-instruct:free', // Docs, fast structured output
  // Additional fallbacks (if primary/secondary are rate-limited)
  fallbacks: [
    'minimax/minimax-m2.5:free',                  // 197K context, strong SWE-Bench
    'arcee-ai/trinity-large-preview:free',        // Complex toolchains
    'z-ai/glm-4.5-air:free',                      // Thinking mode, agent-centric
  ],
};

/** Budget degradation threshold (0.0-1.0). At this %, all models switch to free. */
const BUDGET_DEGRADATION_THRESHOLD = 0.8;

/**
 * Maps agent names to their recommended OpenRouter model.
 *
 * Budget-optimized for ~$85/month (~$52/mo at moderate usage):
 *   - Critical (architect, security):  claude-sonnet-4    (~15% budget, ~$11)
 *   - High-value (planner, critic):    gemini-2.5-pro     (~15% budget, ~$11)
 *   - Workhorse (most agents):         deepseek-chat (V3) (~55% budget, ~$1)
 *   - Light (writer, explore, docs):   gemini-2.5-flash   (~10% budget, ~$0.50)
 *   - Prototyping:                     grok-3-mini        (on-demand)
 *   - Main session:                    gemini-2.5-flash   (~$0.50)
 *
 * Fallback: if DeepSeek is down, agents fall back to gemini-2.5-flash.
 */
const AGENT_OPENROUTER_MODELS: Record<string, string> = {
  // Critical — wrong output here is expensive to redo
  architect: 'anthropic/claude-sonnet-4',
  'security-reviewer': 'anthropic/claude-sonnet-4',
  // High-value — thoroughness matters more than speed
  planner: 'google/gemini-2.5-pro',
  critic: 'google/gemini-2.5-pro',
  'code-reviewer': 'google/gemini-2.5-pro',
  // Workhorse — best coding per dollar
  executor: 'deepseek/deepseek-chat',
  researcher: 'deepseek/deepseek-chat',
  designer: 'deepseek/deepseek-chat',
  'qa-tester': 'deepseek/deepseek-chat',
  'build-fixer': 'deepseek/deepseek-chat',
  'tdd-guide': 'deepseek/deepseek-chat',
  analyst: 'deepseek/deepseek-chat',
  scientist: 'deepseek/deepseek-chat',
  vision: 'deepseek/deepseek-chat',
  // Light — fast, good enough for docs and navigation
  writer: 'google/gemini-2.5-flash',
  explore: 'google/gemini-2.5-flash',
};

/**
 * Check if budget is in degraded mode (>=80% used).
 * Returns the free model to use, or null if budget is fine.
 */
function getBudgetDegradedModel(agentName?: string): string | null {
  const status = BudgetManager.getStatus();
  if (!status.enabled) return null;

  const usagePercent = status.maxBudget > 0
    ? status.currentSpending / status.maxBudget
    : 0;

  if (usagePercent < BUDGET_DEGRADATION_THRESHOLD) return null;

  // Budget exceeded threshold — return appropriate free model
  if (agentName) {
    // Security/architecture agents get the reasoning free model
    if (['architect', 'security-reviewer', 'planner', 'critic', 'code-reviewer'].includes(agentName)) {
      return FREE_MODELS.reasoning;
    }
    // Coding agents get the coding free model
    if (['executor', 'build-fixer', 'qa-tester', 'tdd-guide', 'designer'].includes(agentName)) {
      return FREE_MODELS.coding;
    }
  }
  return FREE_MODELS.primary;
}

// ============================================================================
// MCP Server Implementation (v2)
// ============================================================================

export class McpServer {
  private server: Server;
  private config: AppConfig;
  private tools: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  private toolDefinitions: Map<string, Tool>;
  private costTracker: AdvancedCostTracker;
  private recipeSessionManager: RecipeSessionManager;
  private sessionContextManager: SessionContextManager;
  private recipesDir: string;

  constructor(config: AppConfig) {
    this.config = config;
    this.tools = new Map();
    this.toolDefinitions = new Map();

    // Recipes directory — resolve relative to the server's own install location
    // so it works when Roland is run from any project directory
    this.recipesDir = McpServer.resolveRecipesDir();

    // Initialize cost tracker
    this.costTracker = getGlobalTracker();

    // Initialize recipe session manager (for IDE-driven recipe execution)
    this.recipeSessionManager = new RecipeSessionManager();

    // Initialize session context manager (persistent memory for long sessions)
    this.sessionContextManager = new SessionContextManager();

    // Initialize budget manager with config from config.yaml
    BudgetManager.initialize();
    if (config.goose) {
      BudgetManager.configureFromAppConfig({
        monthlyBudget: config.goose.monthly_budget,
        warningThreshold: config.goose.budget_degradation_threshold,
        billingCycleDay: config.goose.billing_cycle_day,
        enabled: true,
      });
    }

    this.registerTools();

    // Initialize MCP server with stdio transport
    this.server = new Server(
      {
        name: 'roland',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  // ==========================================================================
  // Tool Registration
  // ==========================================================================

  private registerTools(): void {
    this.registerHealthCheck();
    this.registerTriage();
    this.registerRouteModel();
    this.registerTrackCost();
    this.registerManageBudget();
    this.registerGetAnalytics();
    this.registerSuggestMode();
    this.registerListRecipes();
    this.registerStartRecipe();
    this.registerAdvanceRecipe();
    this.registerPreviewChanges();
    this.registerLoadMigrationContext();
    this.registerUpdateMigrationContext();
    this.registerRunGooseTask();
    this.registerSessionContext();
    this.registerGitTools();
  }

  // --------------------------------------------------------------------------
  // health_check
  // --------------------------------------------------------------------------
  private registerHealthCheck(): void {
    this.registerTool(
      'health_check',
      'Check the health status of the Roland MCP server',
      async () => ({
        status: 'healthy',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        tools: this.getTools(),
      }),
      { type: 'object', properties: {}, required: [] }
    );
  }

  // --------------------------------------------------------------------------
  // triage — auto-pilot: analyze any message → agent + recipe recommendation
  // --------------------------------------------------------------------------

  /**
   * Agent metadata for triage matching.
   * Each entry maps an agent name to its role description and keyword triggers.
   */
  private static readonly AGENT_CATALOG: Array<{
    name: string;
    role: string;
    triggers: string[];
    tier: 'simple' | 'medium' | 'complex';
  }> = [
    {
      name: 'architect',
      role: 'System design, architecture decisions, component diagrams, trade-off analysis',
      triggers: ['architect', 'design', 'system design', 'component', 'diagram', 'trade-off', 'tradeoff', 'schema', 'database design', 'erd', 'data model', 'api design', 'microservice', 'infrastructure'],
      tier: 'complex',
    },
    {
      name: 'executor',
      role: 'Write clean, working code; implement features; make changes',
      triggers: ['implement', 'build', 'create', 'add', 'write', 'code', 'feature', 'make', 'develop', 'scaffold', 'generate'],
      tier: 'medium',
    },
    {
      name: 'researcher',
      role: 'Codebase exploration, documentation review, root cause investigation',
      triggers: ['research', 'investigate', 'explore', 'find', 'search', 'look into', 'root cause', 'why does', 'how does', 'understand', 'explain codebase'],
      tier: 'medium',
    },
    {
      name: 'planner',
      role: 'Break complex tasks into sequenced, actionable steps',
      triggers: ['plan', 'break down', 'steps', 'roadmap', 'strategy', 'approach', 'how should', 'what order', 'sequence', 'prioritize'],
      tier: 'medium',
    },
    {
      name: 'critic',
      role: 'Code review, find bugs, security issues, improvement opportunities',
      triggers: ['review', 'critique', 'improve', 'issues', 'problems', 'smell', 'anti-pattern', 'best practice', 'code quality'],
      tier: 'medium',
    },
    {
      name: 'designer',
      role: 'UI/UX design, component layout, user flows, accessibility',
      triggers: ['ui', 'ux', 'design', 'layout', 'component', 'user flow', 'wireframe', 'accessibility', 'a11y', 'responsive', 'css', 'style', 'theme', 'color', 'font'],
      tier: 'medium',
    },
    {
      name: 'qa-tester',
      role: 'Write and run tests, edge cases, coverage analysis',
      triggers: ['test', 'testing', 'unit test', 'integration test', 'e2e', 'coverage', 'edge case', 'spec', 'jest', 'vitest', 'pytest', 'assert'],
      tier: 'medium',
    },
    {
      name: 'security-reviewer',
      role: 'Vulnerability scanning, OWASP checks, hardening recommendations',
      triggers: ['security', 'vulnerability', 'owasp', 'cve', 'xss', 'sql injection', 'csrf', 'auth', 'authentication', 'authorization', 'encrypt', 'hardening', 'penetration'],
      tier: 'complex',
    },
    {
      name: 'writer',
      role: 'Technical documentation, README updates, API docs',
      triggers: ['document', 'docs', 'readme', 'api docs', 'jsdoc', 'docstring', 'changelog', 'guide', 'tutorial', 'explain'],
      tier: 'simple',
    },
    {
      name: 'build-fixer',
      role: 'Resolve TypeScript errors, compilation failures, CI/CD issues',
      triggers: ['build', 'compile', 'typescript error', 'ts error', 'ci', 'cd', 'pipeline', 'build fail', 'lint', 'eslint', 'type error', 'cannot find module'],
      tier: 'medium',
    },
    {
      name: 'code-reviewer',
      role: 'Comprehensive code review covering correctness, design, style, performance',
      triggers: ['code review', 'pull request', 'pr review', 'review this', 'check this code', 'look at this'],
      tier: 'medium',
    },
    {
      name: 'tdd-guide',
      role: 'Test-driven development coaching, red-green-refactor cycle',
      triggers: ['tdd', 'test driven', 'red green refactor', 'test first', 'failing test'],
      tier: 'medium',
    },
    {
      name: 'scientist',
      role: 'Data analysis, statistics, ML, hypothesis testing',
      triggers: ['data', 'analysis', 'statistics', 'ml', 'machine learning', 'model', 'predict', 'regression', 'classification', 'dataset', 'hypothesis'],
      tier: 'complex',
    },
    {
      name: 'explore',
      role: 'Map project structure, find patterns, navigate codebase',
      triggers: ['explore', 'navigate', 'structure', 'map', 'dependency', 'where is', 'find file', 'project layout'],
      tier: 'simple',
    },
    {
      name: 'analyst',
      role: 'Metrics, trends, quantitative analysis',
      triggers: ['metrics', 'trend', 'analyze', 'performance', 'benchmark', 'measure', 'profil'],
      tier: 'medium',
    },
    {
      name: 'vision',
      role: 'Long-term technical strategy, technology evaluation',
      triggers: ['strategy', 'long-term', 'tech stack', 'evaluate', 'compare', 'future', 'migration', 'upgrade'],
      tier: 'complex',
    },
  ];

  /**
   * Recipe metadata for triage matching.
   */
  private static readonly RECIPE_CATALOG: Array<{
    name: string;
    fileKey: string;
    description: string;
    triggers: string[];
    agents: string[];
  }> = [
    {
      name: 'PlanExecRevEx',
      fileKey: 'PlanExecRevEx',
      description: '4-agent autonomous coding loop: plan → execute → review → explain',
      triggers: ['build', 'implement', 'create', 'develop', 'feature', 'full', 'complete', 'end to end', 'end-to-end'],
      agents: ['planner', 'executor', 'reviewer', 'explainer'],
    },
    {
      name: 'BugFix',
      fileKey: 'BugFix',
      description: 'Systematic bug resolution: triage → research → architect → fix → test → review → document',
      triggers: ['bug', 'fix', 'broken', 'not working', 'error', 'crash', 'fails', 'issue', 'defect', 'regression'],
      agents: ['analyst', 'researcher', 'architect', 'executor', 'qa-tester', 'critic', 'writer'],
    },
    {
      name: 'SecurityAudit',
      fileKey: 'SecurityAudit',
      description: 'Security audit: threat modeling → code review → remediation → documentation',
      triggers: ['security audit', 'vulnerability', 'penetration', 'owasp', 'secure', 'hardening', 'threat model'],
      agents: ['architect', 'critic', 'executor', 'writer'],
    },
    {
      name: 'RESTfulAPI',
      fileKey: 'RESTfulAPI',
      description: 'API design through documentation: architect → implement → review → document',
      triggers: ['api', 'rest', 'endpoint', 'restful', 'crud', 'route', 'controller'],
      agents: ['architect', 'executor', 'critic', 'writer'],
    },
    {
      name: 'WebAppFullStack',
      fileKey: 'WebAppFullStack',
      description: 'Full-stack web app: architect → design → implement → review → document',
      triggers: ['web app', 'full stack', 'fullstack', 'frontend', 'backend', 'full-stack', 'application', 'webapp'],
      agents: ['architect', 'designer', 'executor', 'critic', 'writer'],
    },
    {
      name: 'MicroservicesArchitecture',
      fileKey: 'MicroservicesArchitecture',
      description: 'Microservices: service decomposition → implement → review → document',
      triggers: ['microservice', 'service decomposition', 'distributed', 'event driven', 'message queue', 'kafka'],
      agents: ['architect', 'executor', 'critic', 'writer'],
    },
    {
      name: 'DocumentationRefactor',
      fileKey: 'DocumentationRefactor',
      description: 'Documentation improvement: audit → plan → write → review',
      triggers: ['documentation', 'docs refactor', 'readme', 'api docs', 'document everything', 'doc update'],
      agents: ['analyst', 'architect', 'writer', 'critic'],
    },
    {
      name: 'DesktopApp',
      fileKey: 'DesktopApp',
      description: 'Desktop app: architect → design → implement → test → review → package',
      triggers: ['desktop', 'electron', 'tauri', 'native app', 'gui', 'desktop app', 'cross-platform', 'maui', 'installable', 'offline app'],
      agents: ['architect', 'designer', 'executor', 'qa-tester', 'critic', 'writer'],
    },
    {
      name: 'VB6Migration',
      fileKey: 'VB6Migration',
      description: 'VB6→C# migration: load context → triage → plan → execute → review → explain',
      triggers: ['vb6', 'visual basic', 'vb 6', 'migrate', 'migration', 'legacy', 'vb6 to c#', 'vb to csharp', 'modernize', 'rewrite'],
      agents: ['planner', 'executor', 'reviewer', 'explainer'],
    },
  ];

  private registerTriage(): void {
    this.registerTool(
      'triage',
      'Auto-pilot: analyze any user message and recommend the best Roland agent persona and/or recipe workflow. Call this FIRST on every coding request to get intelligent routing. Returns which agent to adopt, whether a multi-agent recipe applies, and the reasoning.',
      async (args: Record<string, unknown>) => {
        const message = args.message as string;
        if (!message) {
          throw new McpToolError('triage', 'message is required');
        }

        const lowerMessage = message.toLowerCase();

        // --- Score agents ---
        const agentScores = McpServer.AGENT_CATALOG.map(agent => {
          let score = 0;
          const matchedTriggers: string[] = [];
          for (const trigger of agent.triggers) {
            if (lowerMessage.includes(trigger)) {
              // Longer triggers = more specific = higher weight
              const weight = trigger.includes(' ') ? 3 : 1;
              score += weight;
              matchedTriggers.push(trigger);
            }
          }
          return { ...agent, score, matchedTriggers };
        });

        // Sort by score descending
        agentScores.sort((a, b) => b.score - a.score);

        // Top agent and runners-up
        const topAgent = agentScores[0];
        const runnersUp = agentScores
          .filter(a => a.score > 0 && a.name !== topAgent.name)
          .slice(0, 2);

        // --- Score recipes ---
        const recipeScores = McpServer.RECIPE_CATALOG.map(recipe => {
          let score = 0;
          const matchedTriggers: string[] = [];
          for (const trigger of recipe.triggers) {
            if (lowerMessage.includes(trigger)) {
              const weight = trigger.includes(' ') ? 4 : 1;
              score += weight;
              matchedTriggers.push(trigger);
            }
          }
          return { ...recipe, score, matchedTriggers };
        });

        recipeScores.sort((a, b) => b.score - a.score);
        const topRecipe = recipeScores[0];

        // --- Complexity analysis ---
        const complexity = ComplexityClassifier.getDetailedAnalysis(message);

        // --- Decide if a recipe is warranted ---
        // Recipes are for substantial, multi-step work
        const recipeThreshold = complexity.complexity === 'complex' ? 1 : 2;
        const suggestRecipe = topRecipe.score >= recipeThreshold;

        // --- Build recommendation ---
        const recommendation: Record<string, unknown> = {
          agent: {
            name: topAgent.score > 0 ? topAgent.name : 'executor',
            role: topAgent.score > 0 ? topAgent.role : 'General implementation — no strong pattern match; defaulting to executor.',
            confidence: topAgent.score > 0
              ? (topAgent.score >= 3 ? 'high' : 'medium')
              : 'low',
            matched_triggers: topAgent.matchedTriggers,
          },
          complexity: {
            level: complexity.complexity,
            score: complexity.score,
          },
          reasoning: this.buildTriageReasoning(topAgent, topRecipe, complexity, suggestRecipe),
        };

        if (runnersUp.length > 0) {
          recommendation.alternative_agents = runnersUp.map(a => ({
            name: a.name,
            role: a.role,
            matched_triggers: a.matchedTriggers,
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

        // Mode suggestion (quick / standard / deep)
        const modeMap: Record<string, string> = {
          simple: 'quick',
          medium: 'standard',
          complex: 'deep',
        };
        recommendation.suggested_mode = modeMap[complexity.complexity] || 'standard';

        // --- Goose dispatch fields ---
        const agentName = topAgent.score > 0 ? topAgent.name : 'executor';
        let openrouterModel = AGENT_OPENROUTER_MODELS[agentName]
          || OPENROUTER_MODELS[complexity.complexity]
          || 'google/gemini-2.5-flash';

        // Budget degradation: switch to free models at 80% usage
        const degradedModel = getBudgetDegradedModel(agentName);
        const budgetDegraded = degradedModel !== null;
        if (budgetDegraded) {
          openrouterModel = degradedModel;
        }

        // Load persona instructions from agent YAML
        const personaInstructions = this.loadAgentRolePrompt(agentName);

        recommendation.openrouter_model = openrouterModel;
        recommendation.persona_instructions = personaInstructions;
        recommendation.temperature = 0.7;

        // --- Execution strategy: smart triage for complex code ---
        // Complex tasks: Sonnet 4 subagent writes the code, main session applies files
        // Simple/medium tasks: main session (Flash) writes and applies directly
        const isComplexExecution = complexity.complexity === 'complex' && !budgetDegraded;
        if (isComplexExecution) {
          recommendation.execution_strategy = {
            mode: 'subagent_writes_code',
            execution_model: 'anthropic/claude-sonnet-4',
            apply_model: 'main_session',
            reason: 'Complex task — Sonnet 4 subagent will write the code for higher quality. Main session applies files to disk.',
            subagent_instructions: `You are a senior engineer writing production-ready code. Rules:\n`
              + `1. OUTPUT FORMAT: For each file, output "📄 path/to/file.ts:" followed by the COMPLETE file content in a code block. `
              + `Include ALL imports, types, error handling, and edge cases. Code must be ready to write to disk as-is.\n`
              + `2. NO PLACEHOLDERS: Do NOT use "// TODO", "// ...", or "implement here". Write the real implementation.\n`
              + `3. USE PROVIDED CONTEXT: You will receive actual file contents from the codebase. Use exact import paths, `
              + `type names, and function signatures from those files. Do NOT guess or hallucinate APIs.\n`
              + `4. INCLUDE TESTS: If modifying a module that has a test file, include the updated test file too.\n`
              + `5. ERROR FIXES: If you receive error output, analyze the EXACT error message and stack trace. `
              + `Fix the root cause, not symptoms. Include the complete fixed file, not just a diff.`,
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

        recommendation.instructions = suggestRecipe
          ? `Adopt the "${agentName}" persona. A multi-agent recipe "${topRecipe.name}" is recommended — offer to run it, or proceed as the recommended agent if the user prefers a single pass.`
          : isComplexExecution
            ? `This is a complex task. Spawn a Sonnet 4 subagent to write the code (see execution_strategy), then apply the output to files yourself.`
            : `Adopt the "${agentName}" persona for this task. Apply that agent's expertise and thinking style to your response.`;

        return recommendation;
      },
      {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The user\'s raw message or task description to analyze',
          },
        },
        required: ['message'],
      }
    );
  }

  /**
   * Build human-readable reasoning for the triage decision.
   */
  private buildTriageReasoning(
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

  // --------------------------------------------------------------------------
  // Agent YAML loader — read role_prompt from agents/*.yaml
  // --------------------------------------------------------------------------

  /**
   * Resolve the agents directory relative to this file's location.
   */
  private static resolveAgentsDir(): string {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const serverDir = path.dirname(thisFile);
      const installDir = path.resolve(serverDir, '..');
      const rootDir = path.resolve(installDir, '..');

      const distAgents = path.join(installDir, 'agents');
      if (fs.existsSync(distAgents)) return distAgents;

      const srcAgents = path.join(rootDir, 'agents');
      if (fs.existsSync(srcAgents)) return srcAgents;
    } catch { /* fallback */ }
    return path.join(process.cwd(), 'agents');
  }

  /**
   * Load the role_prompt from an agent's YAML file.
   * Returns a fallback prompt if the file doesn't exist.
   */
  private loadAgentRolePrompt(agentName: string): string {
    try {
      const agentsDir = McpServer.resolveAgentsDir();
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

  // --------------------------------------------------------------------------
  // route_model — complexity analysis → cheapest adequate model
  // --------------------------------------------------------------------------
  private registerRouteModel(): void {
    this.registerTool(
      'route_model',
      'Analyze query complexity and recommend the cheapest adequate model. Call this before making an LLM request to optimize cost.',
      async (args: Record<string, unknown>) => {
        const query = args.query as string;
        if (!query) {
          throw new McpToolError('route_model', 'query is required');
        }

        const budgetHint = (args.budget as string) || 'moderate';

        // Run complexity analysis
        const analysis = ComplexityClassifier.getDetailedAnalysis(query);

        // Get routing recommendation with fallbacks
        let routing;
        try {
          routing = ModelRouter.routeByComplexity(query);
        } catch {
          // If routing fails (no config loaded), use analysis-only
          routing = null;
        }

        // Adjust recommendation by budget hint
        let recommendedModel = analysis.suggestedModel;
        if (budgetHint === 'minimal' && analysis.complexity !== 'simple') {
          // Force cheapest model even for complex queries
          recommendedModel = 'cursor-small';
        } else if (budgetHint === 'unlimited' && analysis.complexity === 'simple') {
          // Allow upgrading simple queries for higher quality
          recommendedModel = 'claude-3.5-sonnet';
        }

        // Build alternatives list
        const alternatives = [];
        if (routing) {
          if (routing.selected.model !== recommendedModel) {
            alternatives.push({
              model: routing.selected.model,
              reason: 'Config-preferred model for this complexity tier',
              estimated_cost: routing.selected.costPer1kTokens,
            });
          }
          for (const fb of routing.fallbacks.slice(0, 2)) {
            alternatives.push({
              model: fb.model,
              reason: 'Fallback option',
              estimated_cost: fb.costPer1kTokens,
            });
          }
        }

        // Estimate cost for recommended model
        const estimatedCost = ModelRouter.estimateCost(
          recommendedModel,
          analysis.tokenEstimate,
          analysis.tokenEstimate * 2 // Rough output estimate
        );

        // Map to OpenRouter model ID (with budget degradation)
        let openrouterModel = OPENROUTER_MODELS[analysis.complexity]
          || 'google/gemini-2.5-flash';

        const degradedModel = getBudgetDegradedModel();
        const budgetDegraded = degradedModel !== null;
        if (budgetDegraded) {
          openrouterModel = degradedModel;
        }

        return {
          recommended_model: recommendedModel,
          openrouter_model: openrouterModel,
          complexity: analysis.complexity,
          score: analysis.score,
          token_estimate: analysis.tokenEstimate,
          estimated_cost: estimatedCost,
          budget_hint: budgetHint,
          alternatives,
          factors: analysis.factors.filter(f => f.detected).map(f => ({
            name: f.name,
            weight: f.weight,
          })),
          ...(budgetDegraded ? {
            budget_degraded: true,
            budget_notice: `Budget ≥80% used — switched to free model (${openrouterModel}). Quality may be reduced.`,
          } : {}),
        };
      },
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The query or task description to analyze for complexity',
          },
          budget: {
            type: 'string',
            enum: ['minimal', 'moderate', 'unlimited'],
            description: 'Budget preference — minimal forces cheapest model, unlimited allows upgrades (default: moderate)',
          },
        },
        required: ['query'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // track_cost — log token usage, return session totals + budget warnings
  // --------------------------------------------------------------------------
  private registerTrackCost(): void {
    this.registerTool(
      'track_cost',
      'Log token usage from an LLM call and return session totals with budget status. Call this after each LLM interaction to track spending.',
      async (args: Record<string, unknown>) => {
        const model = args.model as string;
        const inputTokens = (args.input_tokens as number) || 0;
        const outputTokens = (args.output_tokens as number) || 0;
        const agent = (args.agent as string) || 'unknown';
        const task = (args.task as string) || 'unnamed';

        if (!model) {
          throw new McpToolError('track_cost', 'model is required');
        }

        // Calculate cost
        let cost: number;
        try {
          cost = ModelRouter.estimateCost(model, inputTokens, outputTokens);
        } catch {
          // Unknown model — estimate at $0 (free tier)
          cost = 0;
        }

        // Record in cost tracker
        this.costTracker.recordCost(model, 'ide', agent, inputTokens, outputTokens, cost, {
          query: task,
          cached: false,
        });

        // Record in budget manager
        BudgetManager.recordSpending(cost);

        // Get session summary
        const summary = this.costTracker.getSummary();
        const budgetStatus = BudgetManager.getStatus();

        // Build warning
        let warning: string | undefined;
        if (budgetStatus.enabled) {
          const usagePercent = (budgetStatus.currentSpending / budgetStatus.maxBudget) * 100;
          if (usagePercent >= 100) {
            warning = `BUDGET EXCEEDED: $${budgetStatus.currentSpending.toFixed(4)} / $${budgetStatus.maxBudget.toFixed(2)}`;
          } else if (usagePercent >= budgetStatus.warningThreshold * 100) {
            warning = `Budget warning: ${usagePercent.toFixed(1)}% used ($${budgetStatus.currentSpending.toFixed(4)} / $${budgetStatus.maxBudget.toFixed(2)})`;
          }
        }

        return {
          recorded: {
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: cost,
            agent,
            task,
          },
          session: {
            total_cost: summary.totalCost,
            total_tokens: summary.totalTokens,
            total_calls: summary.recordCount,
            avg_cost_per_call: summary.averageCostPerQuery,
          },
          budget: {
            enabled: budgetStatus.enabled,
            remaining: budgetStatus.enabled
              ? Math.max(0, budgetStatus.maxBudget - budgetStatus.currentSpending)
              : null,
          },
          ...(warning ? { warning } : {}),
        };
      },
      {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            description: 'The model that was used (e.g., "nousresearch/hermes-3-llama-3.1-405b:free")',
          },
          input_tokens: {
            type: 'number',
            description: 'Number of input tokens consumed',
          },
          output_tokens: {
            type: 'number',
            description: 'Number of output tokens generated',
          },
          agent: {
            type: 'string',
            description: 'Name of the agent that made the call (e.g., "architect", "executor")',
          },
          task: {
            type: 'string',
            description: 'Brief description of the task for cost attribution',
          },
        },
        required: ['model'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // manage_budget — get/set/reset spending limits
  // --------------------------------------------------------------------------
  private registerManageBudget(): void {
    this.registerTool(
      'manage_budget',
      'Manage API spending budget — check status, set limits, or reset spending. Use this to enforce cost controls.',
      async (args: Record<string, unknown>) => {
        const action = (args.action as string) || 'get_status';

        switch (action) {
          case 'get_status': {
            const status = BudgetManager.getStatus();
            const daysUntilReset = BudgetManager.getDaysUntilReset();
            return {
              action: 'get_status',
              enabled: status.enabled,
              max_budget: status.maxBudget,
              current_spending: status.currentSpending,
              remaining: Math.max(0, status.maxBudget - status.currentSpending),
              usage_percent: status.maxBudget > 0
                ? ((status.currentSpending / status.maxBudget) * 100)
                : 0,
              warning_threshold: `${(status.warningThreshold * 100).toFixed(0)}%`,
              billing_cycle_day: status.billingCycleDay,
              days_until_reset: daysUntilReset,
              auto_reset: 'Spending resets to $0 on day ' + status.billingCycleDay + ' of each month',
            };
          }

          case 'set_limit': {
            const limit = args.daily_limit as number;
            if (limit === undefined || limit <= 0) {
              throw new McpToolError('manage_budget', 'daily_limit must be a positive number');
            }
            BudgetManager.setMaxBudget(limit);
            return {
              action: 'set_limit',
              new_limit: limit,
              message: `Budget limit set to $${limit.toFixed(2)}`,
            };
          }

          case 'reset': {
            BudgetManager.reset();
            const status = BudgetManager.getStatus();
            return {
              action: 'reset',
              max_budget: status.maxBudget,
              current_spending: 0,
              message: 'Budget spending reset to $0.00',
            };
          }

          case 'enable': {
            const maxBudget = args.daily_limit as number | undefined;
            BudgetManager.enable(maxBudget);
            return {
              action: 'enable',
              max_budget: BudgetManager.getStatus().maxBudget,
              message: 'Budget enforcement enabled',
            };
          }

          case 'disable': {
            BudgetManager.disable();
            return {
              action: 'disable',
              message: 'Budget enforcement disabled',
            };
          }

          default:
            throw new McpToolError('manage_budget', `Unknown action: ${action}. Use: get_status, set_limit, reset, enable, disable`);
        }
      },
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get_status', 'set_limit', 'reset', 'enable', 'disable'],
            description: 'Action to perform (default: get_status)',
          },
          daily_limit: {
            type: 'number',
            description: 'Budget limit in USD (required for set_limit, optional for enable)',
          },
        },
        required: [],
      }
    );
  }

  // --------------------------------------------------------------------------
  // get_analytics — session cost & token breakdowns
  // --------------------------------------------------------------------------
  private registerGetAnalytics(): void {
    this.registerTool(
      'get_analytics',
      'Get cost and token usage analytics for the current session, grouped by model, agent, or provider.',
      async (args: Record<string, unknown>) => {
        const groupBy = (args.group_by as string) || 'summary';

        const summary = this.costTracker.getSummary();

        const result: Record<string, unknown> = {
          session: {
            total_cost: summary.totalCost,
            total_tokens: summary.totalTokens,
            total_calls: summary.recordCount,
            avg_cost_per_call: summary.averageCostPerQuery,
          },
        };

        switch (groupBy) {
          case 'model':
            result.breakdown = this.costTracker.getModelBreakdown().map(m => ({
              model: m.model,
              cost: m.cost,
              percentage: `${m.percentage.toFixed(1)}%`,
            }));
            break;

          case 'agent':
            result.breakdown = this.costTracker.getAgentBreakdown().map(a => ({
              agent: a.agent,
              cost: a.cost,
              percentage: `${a.percentage.toFixed(1)}%`,
            }));
            break;

          case 'provider':
            result.breakdown = this.costTracker.getProviderBreakdown().map(p => ({
              provider: p.provider,
              cost: p.cost,
              percentage: `${p.percentage.toFixed(1)}%`,
            }));
            break;

          case 'summary':
          default:
            result.by_model = summary.modelCosts;
            result.by_agent = summary.agentCosts;
            result.by_provider = summary.providerCosts;
            break;
        }

        // Include budget status for context
        const budgetStatus = BudgetManager.getStatus();
        if (budgetStatus.enabled) {
          result.budget = {
            limit: budgetStatus.maxBudget,
            spent: budgetStatus.currentSpending,
            remaining: Math.max(0, budgetStatus.maxBudget - budgetStatus.currentSpending),
            usage_percent: `${((budgetStatus.currentSpending / budgetStatus.maxBudget) * 100).toFixed(1)}%`,
          };
        }

        // Most expensive calls
        const expensive = this.costTracker.getMostExpensiveQueries(3);
        if (expensive.length > 0) {
          result.most_expensive = expensive.map(r => ({
            model: r.model,
            agent: r.agent,
            cost: r.cost,
            tokens: r.inputTokens + r.outputTokens,
          }));
        }

        return result;
      },
      {
        type: 'object',
        properties: {
          group_by: {
            type: 'string',
            enum: ['summary', 'model', 'agent', 'provider'],
            description: 'How to group the analytics breakdown (default: summary)',
          },
        },
        required: [],
      }
    );
  }

  // --------------------------------------------------------------------------
  // suggest_mode — advisory: should this be quick, standard, or deep?
  // --------------------------------------------------------------------------
  private registerSuggestMode(): void {
    this.registerTool(
      'suggest_mode',
      'Analyze a task and suggest the appropriate depth level (quick/standard/deep) with recommended agent chain. Use this to decide how much effort to invest in a task.',
      async (args: Record<string, unknown>) => {
        const query = args.query as string;
        if (!query) {
          throw new McpToolError('suggest_mode', 'query is required');
        }

        const analysis = ComplexityClassifier.getDetailedAnalysis(query);

        // Map complexity to mode
        let suggestedMode: string;
        let reasoning: string;
        let agentChain: string[];
        let estimatedCost: number;

        switch (analysis.complexity) {
          case 'simple':
            suggestedMode = 'quick';
            reasoning = 'Low complexity task — single agent can handle this efficiently.';
            agentChain = ['executor'];
            estimatedCost = ModelRouter.estimateCost(analysis.suggestedModel, analysis.tokenEstimate, analysis.tokenEstimate);
            break;

          case 'medium':
            suggestedMode = 'standard';
            reasoning = 'Moderate complexity — benefits from planning before execution.';
            agentChain = ['planner', 'executor', 'critic'];
            estimatedCost = ModelRouter.estimateCost(analysis.suggestedModel, analysis.tokenEstimate * 3, analysis.tokenEstimate * 3);
            break;

          case 'complex':
            suggestedMode = 'deep';
            reasoning = 'High complexity — requires multiple perspectives, review, and validation.';
            agentChain = ['planner', 'architect', 'executor', 'reviewer', 'critic'];
            estimatedCost = ModelRouter.estimateCost(analysis.suggestedModel, analysis.tokenEstimate * 5, analysis.tokenEstimate * 5);
            break;

          default:
            suggestedMode = 'standard';
            reasoning = 'Default recommendation.';
            agentChain = ['executor'];
            estimatedCost = 0;
        }

        // Check budget feasibility
        const budgetStatus = BudgetManager.getStatus();
        let budgetWarning: string | undefined;
        if (budgetStatus.enabled) {
          const remaining = budgetStatus.maxBudget - budgetStatus.currentSpending;
          if (estimatedCost > remaining) {
            budgetWarning = `Estimated cost ($${estimatedCost.toFixed(4)}) exceeds remaining budget ($${remaining.toFixed(4)}). Consider using "quick" mode.`;
            if (suggestedMode === 'deep') {
              suggestedMode = 'standard';
              agentChain = ['planner', 'executor', 'critic'];
              reasoning += ' (Downgraded from deep due to budget constraints.)';
            }
          }
        }

        return {
          suggested_mode: suggestedMode,
          complexity: analysis.complexity,
          complexity_score: analysis.score,
          reasoning,
          agent_chain: agentChain,
          estimated_cost: estimatedCost,
          key_factors: analysis.factors.filter(f => f.detected).map(f => f.name),
          ...(budgetWarning ? { budget_warning: budgetWarning } : {}),
        };
      },
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The task or query to analyze for appropriate depth level',
          },
        },
        required: ['query'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // list_recipes
  // --------------------------------------------------------------------------
  private registerListRecipes(): void {
    this.registerTool(
      'list_recipes',
      'List all available multi-agent workflow recipes with their descriptions and agent chains',
      async () => {
        const recipes = this.scanRecipeFiles();
        return {
          count: recipes.length,
          recipes,
        };
      },
      { type: 'object', properties: {}, required: [] }
    );
  }

  /**
   * Scan the recipes/ directory and parse each YAML for name/description/agents.
   */
  private scanRecipeFiles(): Array<{ name: string; description: string; agents: string[] }> {
    if (!fs.existsSync(this.recipesDir)) {
      return [];
    }
    const files = fs.readdirSync(this.recipesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    const results: Array<{ name: string; description: string; agents: string[] }> = [];

    for (const file of files) {
      try {
        const raw = YAML.parse(fs.readFileSync(path.join(this.recipesDir, file), 'utf-8'));
        if (!raw) continue;
        const agents = (raw.subagents || []).map((s: any) => s.name || 'unknown');
        results.push({
          name: raw.name || path.basename(file, path.extname(file)),
          description: raw.description || '',
          agents,
        });
      } catch {
        logger.warn(`[McpServer] Skipping malformed recipe: ${file}`);
      }
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // start_recipe — begin a recipe session, return first step's prompt
  // --------------------------------------------------------------------------
  private registerStartRecipe(): void {
    this.registerTool(
      'start_recipe',
      'Start a multi-agent recipe session. Returns the first step\'s system prompt and user prompt for you to execute. Then call advance_recipe with your output to get the next step. Available recipes: BugFix, RESTfulAPI, SecurityAudit, WebAppFullStack, MicroservicesArchitecture, PlanExecRevEx, DocumentationRefactor, DesktopApp, VB6Migration.',
      async (args: Record<string, unknown>) => {
        const recipeName = args.recipe_name as string;
        const userTask = args.task as string;

        if (!recipeName) {
          throw new McpToolError('start_recipe', 'recipe_name is required');
        }
        if (!userTask) {
          throw new McpToolError('start_recipe', 'task is required — describe what you want to accomplish');
        }

        try {
          // Load raw YAML to preserve subagent prompts (the RecipeLoader normalizes them away)
          const recipePath = path.join(this.recipesDir, `${recipeName}.yaml`);
          if (!fs.existsSync(recipePath)) {
            throw new McpToolError('start_recipe', `Recipe not found: ${recipeName}`);
          }

          const rawYaml = YAML.parse(fs.readFileSync(recipePath, 'utf-8'));
          if (!rawYaml) {
            throw new McpToolError('start_recipe', `Failed to parse recipe: ${recipeName}`);
          }

          // Parse the raw YAML recipe into the format the session manager expects
          const parsed = this.parseRecipeForSession(rawYaml);

          // Start the session
          const stepPrompt = this.recipeSessionManager.startSession(parsed, userTask);

          return {
            instructions: 'Execute this step using the system_prompt as your persona and user_prompt as the task. ' +
                          'When done, call advance_recipe with session_id and your complete output.',
            ...stepPrompt,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new McpToolError('start_recipe', `Failed to start recipe: ${message}`);
        }
      },
      {
        type: 'object',
        properties: {
          recipe_name: {
            type: 'string',
            description: 'Name of the recipe (e.g., "BugFix", "PlanExecRevEx", "SecurityAudit")',
          },
          task: {
            type: 'string',
            description: 'The task to accomplish (e.g., "Create a hello world Express app with tests")',
          },
        },
        required: ['recipe_name', 'task'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // advance_recipe — submit step output, get next step or summary
  // --------------------------------------------------------------------------
  private registerAdvanceRecipe(): void {
    this.registerTool(
      'advance_recipe',
      'Submit the output from the current recipe step and get the next step\'s prompt. When all steps are complete, returns a summary. Pass cost data if available for budget tracking.',
      async (args: Record<string, unknown>) => {
        const sessionId = args.session_id as string;
        const stepOutput = args.step_output as string;

        if (!sessionId) {
          throw new McpToolError('advance_recipe', 'session_id is required');
        }
        if (!stepOutput) {
          throw new McpToolError('advance_recipe', 'step_output is required — provide your complete output for this step');
        }

        // Optional cost tracking data
        const costData = args.cost ? args.cost as {
          input_tokens?: number;
          output_tokens?: number;
          cost?: number;
          model?: string;
        } : undefined;

        try {
          const result = this.recipeSessionManager.advanceSession(sessionId, stepOutput, costData);

          // Check if it's a summary (session complete) or next step prompt
          if ('status' in result && (result.status === 'completed' || result.status === 'failed')) {
            return {
              type: 'summary',
              ...result,
            };
          }

          return {
            type: 'next_step',
            instructions: 'Execute this step using the system_prompt as your persona and user_prompt as the task. ' +
                          'When done, call advance_recipe again with session_id and your complete output.',
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new McpToolError('advance_recipe', message);
        }
      },
      {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: 'The session ID returned by start_recipe',
          },
          step_output: {
            type: 'string',
            description: 'Your complete output for the current step',
          },
          cost: {
            type: 'object',
            description: 'Optional cost data for budget tracking',
            properties: {
              input_tokens: { type: 'number', description: 'Input tokens used' },
              output_tokens: { type: 'number', description: 'Output tokens used' },
              cost: { type: 'number', description: 'Cost in USD' },
              model: { type: 'string', description: 'Model used' },
            },
          },
        },
        required: ['session_id', 'step_output'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // Parse a loaded Recipe into the session manager's ParsedRecipe format
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // session_context — persistent memory for long coding sessions
  // --------------------------------------------------------------------------
  private registerSessionContext(): void {
    this.registerTool(
      'session_context',
      'Persistent memory for long coding sessions. Tracks decisions, file changes, patterns, migration progress, and errors across subagent calls. Use this to maintain context continuity — call "get" before spawning subagents and "update" after each step.',
      async (args: Record<string, unknown>) => {
        const action = (args.action as string) || 'get';
        const sessionId = args.session_id as string | undefined;

        switch (action) {
          case 'start': {
            const task = args.task as string;
            if (!task) {
              throw new McpToolError('session_context', 'task is required for start action');
            }
            const id = args.id as string | undefined;
            const session = this.sessionContextManager.start(task, id);
            return {
              action: 'start',
              session_id: session.id,
              task: session.task,
              message: `Session "${session.id}" started. Call session_context with action="update" after each step to build context.`,
            };
          }

          case 'get': {
            const session = this.sessionContextManager.get(sessionId);
            if (!session) {
              return {
                action: 'get',
                message: 'No active session. Use action="start" with a task description to begin one.',
              };
            }
            const formatted = this.sessionContextManager.formatForSubagent(session.id);
            return {
              action: 'get',
              session_id: session.id,
              task: session.task,
              current_step: session.current_step,
              context: formatted,
              stats: {
                decisions: session.decisions.length,
                files_modified: session.files_modified.length,
                patterns: session.patterns.length,
                migrations: session.migration_map.length,
                errors_resolved: session.errors_resolved.length,
              },
              instructions: 'Pass the "context" field to any subagent as part of its prompt to maintain session continuity.',
            };
          }

          case 'update': {
            const sid = sessionId || this.sessionContextManager.get()?.id;
            if (!sid) {
              throw new McpToolError('session_context', 'No active session. Use action="start" first.');
            }

            const updates: Record<string, unknown> = {};

            if (args.decision) updates.decision = args.decision;
            if (args.file_change) updates.file_change = args.file_change;
            if (args.pattern) updates.pattern = args.pattern;
            if (args.migration) updates.migration = args.migration;
            if (args.error_resolved) updates.error_resolved = args.error_resolved;
            if (args.note) updates.note = args.note;
            if (args.advance_step !== undefined) updates.advance_step = args.advance_step;

            const session = this.sessionContextManager.update(sid, updates);
            if (!session) {
              throw new McpToolError('session_context', `Session not found: ${sid}`);
            }

            return {
              action: 'update',
              session_id: session.id,
              current_step: session.current_step,
              updated: Object.keys(updates),
              message: 'Context updated. Call action="get" before the next subagent to retrieve full context.',
            };
          }

          case 'list': {
            const sessions = this.sessionContextManager.list();
            return {
              action: 'list',
              count: sessions.length,
              sessions,
            };
          }

          case 'resume': {
            if (!sessionId) {
              throw new McpToolError('session_context', 'session_id is required for resume action');
            }
            const session = this.sessionContextManager.get(sessionId);
            if (!session) {
              throw new McpToolError('session_context', `Session not found: ${sessionId}`);
            }
            const formatted = this.sessionContextManager.formatForSubagent(sessionId);
            return {
              action: 'resume',
              session_id: session.id,
              task: session.task,
              current_step: session.current_step,
              context: formatted,
              message: `Resumed session "${session.id}" at step ${session.current_step}.`,
            };
          }

          case 'delete': {
            if (!sessionId) {
              throw new McpToolError('session_context', 'session_id is required for delete action');
            }
            const deleted = this.sessionContextManager.delete(sessionId);
            return {
              action: 'delete',
              session_id: sessionId,
              deleted,
            };
          }

          default:
            throw new McpToolError('session_context', `Unknown action: ${action}. Use: start, get, update, list, resume, delete`);
        }
      },
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'get', 'update', 'list', 'resume', 'delete'],
            description: 'Action: start (new session), get (retrieve context), update (log changes), list (all sessions), resume (continue session), delete',
          },
          session_id: {
            type: 'string',
            description: 'Session ID (optional for get/update — uses most recent; required for resume/delete)',
          },
          task: {
            type: 'string',
            description: 'Task description (required for start)',
          },
          id: {
            type: 'string',
            description: 'Custom session ID (optional for start, auto-generated if omitted)',
          },
          decision: {
            type: 'string',
            description: 'Architectural or implementation decision to log (for update)',
          },
          file_change: {
            type: 'object',
            description: 'File change to log (for update)',
            properties: {
              path: { type: 'string', description: 'File path' },
              action: { type: 'string', enum: ['created', 'modified', 'deleted'], description: 'What happened' },
              summary: { type: 'string', description: 'Brief description of the change' },
            },
          },
          pattern: {
            type: 'object',
            description: 'Established pattern to log (for update)',
            properties: {
              name: { type: 'string', description: 'Pattern name (e.g., "Repository pattern")' },
              example_file: { type: 'string', description: 'File that demonstrates this pattern' },
              description: { type: 'string', description: 'How this pattern is used in this project' },
            },
          },
          migration: {
            type: 'object',
            description: 'Migration mapping entry (for update)',
            properties: {
              source: { type: 'string', description: 'Source file (e.g., "Modules/CustomerManager.vb")' },
              target: { type: 'string', description: 'Target file (e.g., "src/Services/CustomerService.cs")' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'skipped'] },
              notes: { type: 'string', description: 'Migration notes' },
            },
          },
          error_resolved: {
            type: 'object',
            description: 'Error that was resolved (for update)',
            properties: {
              error: { type: 'string', description: 'The error message' },
              resolution: { type: 'string', description: 'How it was fixed' },
            },
          },
          note: {
            type: 'string',
            description: 'Free-form note to add (for update)',
          },
          advance_step: {
            type: 'boolean',
            description: 'Increment the step counter (for update, default false)',
          },
        },
        required: ['action'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // Parse a loaded Recipe into the session manager's ParsedRecipe format
  // --------------------------------------------------------------------------
  private parseRecipeForSession(recipeData: any): ParsedRecipe {
    // The recipe YAML has subagents[] with prompts and workflow.steps[]
    // We need to extract both into the ParsedRecipe format

    const rawSubagents = recipeData.subagents || recipeData.agents_config || [];
    const rawSteps = recipeData.steps ||
                     recipeData.workflow?.steps ||
                     [];

    const subagents: SubagentDef[] = rawSubagents.map((sa: any) => ({
      name: sa.name || 'unknown',
      prompt: sa.prompt || sa.system_prompt || `You are the ${sa.name} agent.`,
      model: sa.model,
      provider: sa.provider,
    }));

    const steps: RecipeStepDef[] = rawSteps.map((step: any) => ({
      agent: step.agent || step.name || 'unknown',
      input: step.input,
      output_to: step.output_to,
      loop_if: typeof step.loop_if === 'string' ? step.loop_if : step.loop_if?.condition,
      loop_to: step.loop_to,
      final_output: step.final_output === true,
      condition: step.condition,
    }));

    return {
      name: recipeData.name || 'unknown',
      description: recipeData.description || '',
      subagents,
      steps,
      options: recipeData.options,
      settings: recipeData.settings,
    };
  }

  // ==========================================================================
  // MCP Request Handlers
  // ==========================================================================

  private setupHandlers(): void {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('📋 ListTools request received');
      return {
        tools: Array.from(this.toolDefinitions.values()),
      };
    });

    // Handle call tool request
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      try {
        logger.debug(`🔧 CallTool request: ${toolName}`);

        const toolHandler = this.tools.get(toolName);
        if (!toolHandler) {
          throw new McpToolError(toolName, 'Tool not found');
        }

        const result = await toolHandler(args);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`❌ Tool error (${toolName}):`, message);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    this.server.onerror = (error) => {
      logger.error('❌ MCP Server error:', error);
    };

    this.server.onclose = () => {
      logger.info('🔌 MCP Server closed');
    };
  }

  // --------------------------------------------------------------------------
  // load_migration_context — inject project context block into the session
  // --------------------------------------------------------------------------
  private registerLoadMigrationContext(): void {
    this.registerTool(
      'load_migration_context',
      'Load the project migration context (roland-context.json + .rco-state.json) and return a prompt-ready markdown block. Call this at the start of every session to inject mapping rules, past decisions, and test patterns. Optionally initialise a new session ID.',
      async (args: Record<string, unknown>) => {
        // Pass undefined when no explicit project_root so findProjectRoot()
        // correctly checks ROLAND_PROJECT_ROOT before falling back to cwd.
        const projectRoot = typeof args.project_root === 'string' && args.project_root
          ? args.project_root
          : undefined;

        const initSession = args.init_session === true;

        if (initSession) {
          const sessionId = `session-${Date.now()}`;
          writeRcoState(
            {
              sessionId,
              startedAt: new Date().toISOString(),
              activeRecipe: null,
              stepIndex: 0,
              context: {},
            },
            projectRoot
          );
        }

        const contextBlock = buildContextBlock(projectRoot);
        const ctx = readContext(projectRoot);
        const state = readRcoState(projectRoot);

        return {
          context_block: contextBlock,
          summary: {
            project: `${ctx.project.sourceLanguage}→${ctx.project.targetLanguage}: ${ctx.project.description}`,
            rules_count: ctx.rules.length,
            decisions_count: ctx.decisions.length,
            test_patterns_count: ctx.testPatterns.length,
            custom_sections: Object.keys(ctx.customSections),
            session_id: state?.sessionId ?? null,
          },
          instructions: 'Paste the context_block into your system prompt or prepend it to the user task before planning. Use update_migration_context to add new rules or decisions discovered during this session.',
        };
      },
      {
        type: 'object',
        properties: {
          project_root: {
            type: 'string',
            description: 'Absolute path to the project directory (default: ROLAND_PROJECT_ROOT env var, then cwd)',
          },
          init_session: {
            type: 'boolean',
            description: 'If true, creates a fresh .rco-state.json with a new session ID (default: false)',
          },
        },
        required: [],
      }
    );
  }

  // --------------------------------------------------------------------------
  // update_migration_context — append rules / decisions / patterns / sections
  // --------------------------------------------------------------------------
  private registerUpdateMigrationContext(): void {
    this.registerTool(
      'update_migration_context',
      'Append a new mapping rule, architectural decision, test pattern, or custom section to roland-context.json and regenerate MIGRATION.md. Use this whenever a new VB6→C# pattern or project decision is discovered.',
      async (args: Record<string, unknown>) => {
        const type = args.type as string;
        const projectRoot = typeof args.project_root === 'string' && args.project_root
          ? args.project_root
          : undefined;

        if (!type) throw new McpToolError('update_migration_context', '"type" is required');

        switch (type) {
          case 'rule': {
            const pattern = args.pattern as string;
            const replacement = args.replacement as string;
            if (!pattern || !replacement) {
              throw new McpToolError('update_migration_context', '"pattern" and "replacement" required for type=rule');
            }
            const rule = appendRule(pattern, replacement, args.notes as string | undefined, projectRoot);
            return { added: 'rule', rule, message: `Rule #${rule.id} added and MIGRATION.md updated.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new rule.' };
          }

          case 'decision': {
            const description = args.description as string;
            const rationale = args.rationale as string;
            if (!description || !rationale) {
              throw new McpToolError('update_migration_context', '"description" and "rationale" required for type=decision');
            }
            const decision = appendDecision(description, rationale, projectRoot);
            return { added: 'decision', decision, message: `Decision #${decision.id} added and MIGRATION.md updated.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new decision.' };
          }

          case 'test_pattern': {
            const name = args.name as string;
            const patternDescription = args.description as string;
            if (!name || !patternDescription) {
              throw new McpToolError('update_migration_context', '"name" and "description" required for type=test_pattern');
            }
            const tp = appendTestPattern(name, patternDescription, args.example as string | undefined, projectRoot);
            return { added: 'test_pattern', test_pattern: tp, message: `Test pattern #${tp.id} added and MIGRATION.md updated.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new test pattern.' };
          }

          case 'section': {
            const section = args.section as string;
            const content = args.content as string;
            if (!section || !content) {
              throw new McpToolError('update_migration_context', '"section" and "content" required for type=section');
            }
            appendCustomSection(section, content, projectRoot);
            return { added: 'section', section, message: `Custom section "${section}" updated in roland-context.json and MIGRATION.md.`, updated_context_block: buildContextBlock(projectRoot), instructions: 'Re-prepend updated_context_block to your context to reflect the new section.' };
          }

          default:
            throw new McpToolError('update_migration_context', `Unknown type "${type}". Use: rule, decision, test_pattern, section`);
        }
      },
      {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['rule', 'decision', 'test_pattern', 'section'],
            description: 'What to append: "rule" (mapping pattern), "decision" (architectural decision), "test_pattern", or "section" (freeform)',
          },
          project_root: {
            type: 'string',
            description: 'Absolute path to the project directory (default: ROLAND_PROJECT_ROOT env var, then cwd)',
          },
          // rule fields
          pattern: { type: 'string', description: '[rule] VB6 pattern or construct being replaced' },
          replacement: { type: 'string', description: '[rule] C# equivalent' },
          notes: { type: 'string', description: '[rule] Optional notes or caveats' },
          // decision fields
          description: { type: 'string', description: '[decision | test_pattern] Short description' },
          rationale: { type: 'string', description: '[decision] Why this decision was made' },
          // test_pattern fields
          name: { type: 'string', description: '[test_pattern] Pattern name' },
          example: { type: 'string', description: '[test_pattern] Optional code example' },
          // section fields
          section: { type: 'string', description: '[section] Section heading' },
          content: { type: 'string', description: '[section] Markdown content to append' },
        },
        required: ['type'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // run_goose_task — spawn a headless Goose session with smart model routing
  // --------------------------------------------------------------------------
  private registerRunGooseTask(): void {
    this.registerTool(
      'run_goose_task',
      'Spawn a headless Goose coding session for a task. Goose has full file read/write and shell access via its Developer extension. Roland automatically routes to the cheapest adequate model using complexity analysis. Returns the session output.',
      async (args: Record<string, unknown>) => {
        const task = args.task as string;
        if (!task) throw new McpToolError('run_goose_task', '"task" is required');

        if (!isGooseAvailable()) {
          return {
            error: 'goose CLI not found in PATH',
            install: 'https://block.github.io/goose/',
            tip: 'Install Goose and ensure it is in PATH, then retry.',
          };
        }

        const projectRoot = typeof args.project_root === 'string' && args.project_root
          ? args.project_root
          : undefined;

        const maxTurns = typeof args.max_turns === 'number' ? args.max_turns : 30;
        const timeoutMs = typeof args.timeout_seconds === 'number'
          ? args.timeout_seconds * 1000
          : 300_000;

        // Auto-route: use provided model or derive from complexity analysis
        let modelId = typeof args.model === 'string' ? args.model : null;
        let routingInfo: Record<string, unknown> = {};

        if (!modelId) {
          try {
            const routing = ModelRouter.routeByComplexity(task);
            modelId = routing.selected.model;
            routingInfo = {
              auto_routed: true,
              complexity: ComplexityClassifier.getDetailedAnalysis(task).complexity,
              model_selected: modelId,
              estimated_cost: routing.selected.costPer1kTokens,
            };
          } catch {
            modelId = 'claude-sonnet-4-5'; // safe default
            routingInfo = { auto_routed: false, model_selected: modelId };
          }
        }

        const gooseModel = normaliseGooseModel(modelId);

        logger.info(`🦆 Spawning Goose session: ${gooseModel.provider}/${gooseModel.model}`);

        const result = await spawnGooseSession({
          task,
          model: gooseModel,
          projectRoot,
          maxTurns,
          timeoutMs,
        });

        return {
          output: result.output,
          exit_code: result.exitCode,
          duration_seconds: Math.round(result.durationMs / 1000),
          model_used: `${result.modelUsed.provider}/${result.modelUsed.model}`,
          routing: routingInfo,
          success: result.exitCode === 0,
        };
      },
      {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Full task description for the Goose session. Include all context needed — Goose will read files, run commands, and edit code autonomously.',
          },
          model: {
            type: 'string',
            description: 'Model ID to use (e.g. "claude-sonnet-4-5", "gpt-4o"). Omit to auto-route based on task complexity.',
          },
          project_root: {
            type: 'string',
            description: 'Working directory for the Goose session (default: ROLAND_PROJECT_ROOT env var, then cwd)',
          },
          max_turns: {
            type: 'number',
            description: 'Maximum LLM turns Goose is allowed (default: 30)',
          },
          timeout_seconds: {
            type: 'number',
            description: 'Session timeout in seconds (default: 300)',
          },
        },
        required: ['task'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // preview_changes — markdown diff + optional HTML preview
  // --------------------------------------------------------------------------
  private registerPreviewChanges(): void {
    this.registerTool(
      'preview_changes',
      'Generate a markdown unified diff and optional HTML preview comparing original vs modified content. Returns diff stats (additions/deletions) alongside formatted output.',
      async (args: Record<string, unknown>) => {
        const original = args.original as string;
        const modified = args.modified as string;

        if (typeof original !== 'string') {
          throw new McpToolError('preview_changes', '"original" must be a string');
        }
        if (typeof modified !== 'string') {
          throw new McpToolError('preview_changes', '"modified" must be a string');
        }

        const filename = typeof args.filename === 'string' ? args.filename : 'file';
        const format = (args.format as string) ?? 'markdown';
        const contextLines = typeof args.context_lines === 'number'
          ? Math.max(0, Math.floor(args.context_lines))
          : 3;

        if (!['markdown', 'html', 'both'].includes(format)) {
          throw new McpToolError('preview_changes', '"format" must be one of: markdown, html, both');
        }

        const includeHtml = format === 'html' || format === 'both';

        const result = generateDiff(original, modified, { filename, contextLines, includeHtml });

        return {
          filename,
          stats: {
            additions: result.additions,
            deletions: result.deletions,
            hunks: result.hunks.length,
            unchanged: original.split('\n').length - result.deletions,
          },
          markdown_diff: format !== 'html' ? result.markdownDiff : undefined,
          html_preview: includeHtml ? result.htmlPreview : undefined,
        };
      },
      {
        type: 'object',
        properties: {
          original: {
            type: 'string',
            description: 'Original file content (before changes)',
          },
          modified: {
            type: 'string',
            description: 'Modified file content (after changes)',
          },
          filename: {
            type: 'string',
            description: 'File name shown in the diff header (default: "file")',
          },
          format: {
            type: 'string',
            enum: ['markdown', 'html', 'both'],
            description: 'Output format — "markdown" (default), "html", or "both"',
          },
          context_lines: {
            type: 'number',
            description: 'Lines of context around each change (default: 3)',
          },
        },
        required: ['original', 'modified'],
      }
    );
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async start(): Promise<void> {
    try {
      logger.info('🚀 Starting Roland MCP Server v2...');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.success('✅ MCP Server connected and ready');
      logger.info(`📦 Tools: ${this.getTools().join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpServerError(`Failed to start MCP server: ${message}`);
    }
  }

  // --------------------------------------------------------------------------
  // git_status / git_diff / git_log / git_commit
  // --------------------------------------------------------------------------
  private registerGitTools(): void {
    this.registerTool(
      'git_status',
      'Return the current git status (staged, unstaged, untracked files). Useful before planning file edits or commits.',
      async (args: Record<string, unknown>) => {
        const cwd = typeof args.project_root === 'string' && args.project_root
          ? args.project_root
          : (process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd());
        const result = gitStatus(cwd);
        return {
          staged: result.staged,
          unstaged: result.unstaged,
          untracked: result.untracked,
          summary: `${result.staged.length} staged, ${result.unstaged.length} unstaged, ${result.untracked.length} untracked`,
          raw: result.raw,
        };
      }
    );

    this.registerTool(
      'git_diff',
      'Return a unified diff of current changes. Pass staged=true for staged-only diff, file_path to limit to one file.',
      async (args: Record<string, unknown>) => {
        const cwd = typeof args.project_root === 'string' && args.project_root
          ? args.project_root
          : (process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd());
        const staged = args.staged === true;
        const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
        const maxLines = typeof args.max_lines === 'number' ? args.max_lines : 500;
        const diff = gitDiff(cwd, { staged, filePath, maxLines });
        return { diff: diff || '(no changes)', staged, file_path: filePath ?? null };
      }
    );

    this.registerTool(
      'git_log',
      'Return the last N commits from git log (one-line format). Defaults to 10.',
      async (args: Record<string, unknown>) => {
        const cwd = typeof args.project_root === 'string' && args.project_root
          ? args.project_root
          : (process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd());
        const limit = typeof args.limit === 'number' ? args.limit : 10;
        const log = gitLog(cwd, limit);
        return { log: log || '(no commits)', limit };
      }
    );

    this.registerTool(
      'git_commit',
      'Stage files and create a git commit. Pass files[] to stage specific paths, or omit to stage all changes (git add -A).',
      async (args: Record<string, unknown>) => {
        const cwd = typeof args.project_root === 'string' && args.project_root
          ? args.project_root
          : (process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd());
        const message = args.message as string;
        if (!message) throw new McpToolError('git_commit', 'message is required');
        const files = Array.isArray(args.files) ? (args.files as string[]) : undefined;
        const result = gitCommit(cwd, message, files);
        return {
          sha: result.sha,
          message: result.message,
          success: true,
        };
      }
    );
  }

  async stop(): Promise<void> {
    try {
      logger.info('🛑 Stopping MCP Server...');
      await this.server.close();
      logger.success('✅ MCP Server stopped');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`⚠️ Error stopping server: ${message}`);
    }
  }

  // ==========================================================================
  // Tool Registration Helper
  // ==========================================================================

  registerTool(
    name: string,
    description: string,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
    inputSchema?: Record<string, unknown>
  ): void {
    this.tools.set(name, handler);
    this.toolDefinitions.set(name, {
      name,
      description,
      inputSchema: (inputSchema as Tool['inputSchema']) || {
        type: 'object',
        properties: {},
        required: [],
      },
    });
    logger.debug(`✅ Registered tool: ${name}`);
  }

  getTool(name: string): ((args: Record<string, unknown>) => Promise<unknown>) | undefined {
    return this.tools.get(name);
  }

  getTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getServer(): Server {
    return this.server;
  }

  // --------------------------------------------------------------------------
  // Portable path resolution
  // --------------------------------------------------------------------------

  /**
   * Resolve the recipes directory relative to this file's location.
   * Search order:
   *   1. <installDir>/dist/recipes  (bundled in dist after build)
   *   2. <installDir>/recipes       (development / source layout)
   *   3. process.cwd()/recipes      (legacy fallback)
   */
  private static resolveRecipesDir(): string {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const serverDir = path.dirname(thisFile);           // dist/server/
      const installDir = path.resolve(serverDir, '..');   // dist/
      const rootDir = path.resolve(installDir, '..');     // project root

      // 1. dist/recipes (copied by build)
      const distRecipes = path.join(installDir, 'recipes');
      if (fs.existsSync(distRecipes)) return distRecipes;

      // 2. project-root/recipes (source layout)
      const srcRecipes = path.join(rootDir, 'recipes');
      if (fs.existsSync(srcRecipes)) return srcRecipes;
    } catch {
      // URL parsing failed — fall through
    }

    // 3. Legacy fallback
    return path.join(process.cwd(), 'recipes');
  }

  /**
   * Return the resolved Roland installation root directory.
   * Useful for other tools that need to locate bundled assets.
   */
  static getRolandRoot(): string {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      return path.resolve(path.dirname(thisFile), '..', '..');
    } catch {
      return process.cwd();
    }
  }
}
