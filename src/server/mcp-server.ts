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
import { ComplexityClassifier, ComplexityAnalysis, classifyWithSemantic } from '../orchestrator/complexity-classifier.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { AdvancedCostTracker, getGlobalTracker } from '../orchestrator/advanced-cost-tracker.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { RecipeSessionManager, ParsedRecipe, SubagentDef, RecipeStepDef } from './recipe-session.js';
import { generateDiff } from '../utils/diff-engine.js';
import { normaliseGooseModel, spawnGooseSession, isGooseAvailable } from '../utils/goose-runner.js';
import { gitStatus, gitDiff, gitLog, gitCommit } from '../utils/git-tools.js';
import { analyzeScreenshot } from '../utils/screenshot.js';
import { getDiffStreamServer, initDiffStreamServer } from './diff-stream.js';
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
import { ProjectContextManager } from './project-context.js';
import { CoordinationManager, ConcurrencyError } from '../coordination/index.js';
import { LeadPM } from '../pm/lead-pm.js';
import { renderTimeline, renderUsage } from '../pm/render.js';
import type { PMEventAction } from '../pm/event-log.js';
import { QualityTracker, initializeQualityTracker } from '../orchestrator/quality-tracker.js';
import { selectRelevantFiles, bundleFileContents, formatBundleAsMarkdown, DEFAULT_CONTEXT_GATHERING_CONFIG } from '../utils/file-gatherer.js';
import { resolveAgentsDir as resolveAgentsDirShared } from '../rco/loadConfig.js';
import { classifyExecutionPath } from '../rco/execution-path.js';
import type { FileBundle } from '../utils/file-gatherer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

// ============================================================================
// Cursor MCP configuration helpers
// ============================================================================

/** Read-only / low-risk tools safe for Cursor autoApprove in ~/.cursor/mcp.json */
export const MCP_AUTO_APPROVE_TOOLS = [
  'health_check',
  'roland_hello',
  'board_status',
  'pm_standup',
  'triage',
  'list_team',
  'list_team_recipes',
  'list_recipes',
  'get_team_context',
  'get_pm_playbook',
  'get_team_usage',
  'get_pm_events',
  'get_analytics',
  'suggest_mode',
  'route_model',
  'blackboard_read',
  'bus_poll',
  'git_status',
  'git_diff',
  'git_log',
  'read_context',
] as const;

/** Resolve the built MCP server entry (dist/server/mcp-server.js). */
export function resolveMcpServerEntry(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(thisFile), 'mcp-server.js');
  } catch {
    return path.join(process.cwd(), 'dist', 'server', 'mcp-server.js');
  }
}

/** Build the `mcpServers.roland` block for ~/.cursor/mcp.json */
export function buildCursorMcpServerEntry(options?: {
  rolandRoot?: string;
  projectRoot?: string;
  includeAutoApprove?: boolean;
}): Record<string, unknown> {
  const entry = options?.rolandRoot
    ? path.join(options.rolandRoot, 'dist', 'server', 'mcp-server.js').replace(/\\/g, '/')
    : resolveMcpServerEntry().replace(/\\/g, '/');
  const env: Record<string, string> = { ROLAND_QUIET: '1' };
  if (options?.projectRoot) {
    env.ROLAND_PROJECT_ROOT = options.projectRoot.replace(/\\/g, '/');
  }
  const block: Record<string, unknown> = {
    command: 'node',
    args: [entry],
    env,
  };
  if (options?.includeAutoApprove !== false) {
    block.autoApprove = [...MCP_AUTO_APPROVE_TOOLS];
  }
  return block;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// OpenRouter Model Mapping
// ============================================================================

/**
 * Maps complexity tiers to OpenRouter model IDs.
 * Used by triage and route_model to return valid OpenRouter slugs.
 */
const OPENROUTER_MODELS: Record<string, string> = {
  simple: 'deepseek/deepseek-v3-0324',
  medium: 'qwen/qwen3-coder-next',
  complex: 'minimax/minimax-m2.5',
  explain: 'deepseek/deepseek-v3-0324',
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
 * Hybrid setup: 80-95% of Opus quality at 1/10th-1/5th cost (~$19/mo):
 *   - Critic/Architect (reasoning):    minimax-m2.5       (~15% budget, ~$5)
 *   - Executor/Coder (workhorse):      qwen3-coder-next   (~55% budget, ~$8)
 *   - QA/Simple (light tasks):         deepseek-v3-0324   (~20% budget, ~$2)
 *   - Dispatcher:                      claude-haiku-4.5   (~$4/mo)
 *
 * Fallback: agents fall back to next tier down if primary is unavailable.
 */
const AGENT_OPENROUTER_MODELS: Record<string, string> = {
  // Critic/Architect — MiniMax M2.5 for near-Opus reasoning quality
  architect: 'minimax/minimax-m2.5',
  'security-reviewer': 'minimax/minimax-m2.5',
  planner: 'minimax/minimax-m2.5',
  critic: 'minimax/minimax-m2.5',
  'code-reviewer': 'minimax/minimax-m2.5',
  // Executor/Coder — Qwen3-Coder-Next for best coding quality/cost balance
  executor: 'qwen/qwen3-coder-next',
  researcher: 'qwen/qwen3-coder-next',
  designer: 'qwen/qwen3-coder-next',
  'build-fixer': 'qwen/qwen3-coder-next',
  'tdd-guide': 'qwen/qwen3-coder-next',
  analyst: 'qwen/qwen3-coder-next',
  scientist: 'qwen/qwen3-coder-next',
  vision: 'qwen/qwen3-coder-next',
  // QA/Simple — DeepSeek V3.2 for testing and light tasks
  'test-author':   'deepseek/deepseek-v3-0324',
  'test-executor': 'deepseek/deepseek-v3-0324',
  writer: 'deepseek/deepseek-v3-0324',
  explore: 'deepseek/deepseek-v3-0324',
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
    if (['executor', 'build-fixer', 'test-executor', 'tdd-guide', 'designer'].includes(agentName)) {
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
  private projectContextManager: ProjectContextManager;
  private qualityTracker: QualityTracker;
  private coordination: CoordinationManager;
  private leadPm: LeadPM;
  private recipesDir: string;
  private transport: StdioServerTransport | null = null;
  private shuttingDown = false;
  private connected = false;

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

    // Initialize project context manager (cross-session knowledge base)
    const projectRoot = process.env.ROLAND_PROJECT_ROOT || process.cwd();
    this.projectContextManager = new ProjectContextManager(projectRoot);
    this.sessionContextManager.setProjectContext(this.projectContextManager);

    // Initialize quality tracker (model A/B quality signals, persisted to .roland/)
    this.qualityTracker = initializeQualityTracker(projectRoot);

    // Initialize coordination substrate (Blackboard + Message Bus) — the shared
    // awareness layer the host (Lead PM) and sub-agents communicate through.
    // State is project-scoped under .roland/ (see coordination/paths.ts).
    this.coordination = new CoordinationManager();

    // Initialize the PM control loop (Phase 2/3). The host acts as the Lead PM;
    // these tools let it run the team on top of the coordination substrate.
    // Routing is Cursor-native (Phase 3): an optional `pm:` config section can
    // override the three Cursor models and per-engineer lanes.
    const pmCfg = (config as { pm?: { lead_model?: string; fast_model?: string; standard_model?: string; lane_overrides?: Record<string, 'pm' | 'reasoning' | 'coding' | 'light'> } }).pm;
    this.leadPm = new LeadPM(this.coordination, {
      policy: pmCfg
        ? {
            pm: pmCfg.lead_model ?? 'grok-4.3',
            fast: pmCfg.fast_model ?? 'composer-2.5',
            standard: pmCfg.standard_model ?? 'composer-2.5',
          }
        : undefined,
      laneOverrides: pmCfg?.lane_overrides,
    });

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
    this.registerProjectContext();
    this.registerQualitySignal();
    this.registerGitTools();
    this.registerAnalyzeScreenshot();
    this.registerReadContext();
    this.registerCoordinationTools();
    this.registerPmTools();
    this.registerChatTools();
  }

  // --------------------------------------------------------------------------
  // health_check
  // --------------------------------------------------------------------------
  private registerHealthCheck(): void {
    this.registerTool(
      'health_check',
      'Verify Roland MCP is running. Returns server version, uptime, registered tool count, and optional Ollama/classifier status. Call this first if MCP tools are not responding.',
      async () => {
        const result: Record<string, unknown> = {
          status: 'healthy',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          tools: this.getTools(),
        };

        // Include ollama section only when enabled in config
        if (this.config.ollama?.enabled) {
          const ollamaCfg = this.config.ollama;
          const health = await ModelRouter.checkOllamaHealth(ollamaCfg.base_url);
          result.ollama = {
            enabled: true,
            available: health.available,
            base_url: ollamaCfg.base_url,
            model: ollamaCfg.model,
          };
        }

        // Classifier section
        const apiKeyAvailable = Boolean(process.env.OPENROUTER_API_KEY);
        const classifierCfg = this.config.classifier;
        const semanticEnabled = classifierCfg?.semantic_enabled ?? true;
        result.classifier = {
          mode: apiKeyAvailable && semanticEnabled ? 'semantic' : 'heuristic',
          semantic_model: classifierCfg?.semantic_model ?? 'qwen/qwen3-coder:free',
          api_key_available: apiKeyAvailable,
        };

        return result;
      },
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
      name: 'test-author',
      role: 'Design and write tests: unit, integration, E2E, edge cases, coverage analysis',
      triggers: ['write tests', 'test design', 'unit test', 'integration test', 'e2e', 'spec', 'jest', 'vitest', 'pytest', 'coverage', 'edge case'],
      tier: 'medium',
    },
    {
      name: 'test-executor',
      role: 'Run test suites, report results, reproduce bugs, verify fixes',
      triggers: ['run tests', 'test run', 'assert', 'reproduce', 'verify fix', 'regression', 'test suite', 'green'],
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
    category?: 'solo' | 'enterprise';
  }> = [
    // ------------------------------------------------------------------
    // Solo recipes — lean, fast, preferred when their triggers match
    // ------------------------------------------------------------------
    {
      name: 'QuickShip',
      fileKey: 'QuickShip',
      description: 'Solo 3-agent loop: plan → implement with tests → QA and auto-commit',
      triggers: ['ship', 'implement', 'build', 'add feature'],
      agents: ['planner', 'executor', 'qa'],
      category: 'solo',
    },
    {
      name: 'Spike',
      fileKey: 'Spike',
      description: 'Solo feasibility spike: explore → prototype, no tests required',
      triggers: ['spike', 'prototype', 'explore', 'try', 'experiment'],
      agents: ['explorer', 'executor'],
      category: 'solo',
    },
    {
      name: 'Refactor',
      fileKey: 'Refactor',
      description: 'Solo refactor: analyze + check coverage → refactor → verify no behavior change',
      triggers: ['refactor', 'clean up', 'restructure', 'reorganize'],
      agents: ['analyst', 'executor', 'qa'],
      category: 'solo',
    },
    {
      name: 'Debug',
      fileKey: 'Debug',
      description: 'Solo debug: reproduce + isolate root cause → fix with regression test',
      triggers: ['debug', 'fix bug', 'broken', 'failing', 'error', 'crash'],
      agents: ['researcher', 'executor'],
      category: 'solo',
    },
    // ------------------------------------------------------------------
    // Enterprise recipes — multi-agent, full pipeline
    // ------------------------------------------------------------------
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
      agents: ['analyst', 'researcher', 'architect', 'executor', 'test-author', 'test-executor', 'critic', 'writer'],
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
      agents: ['architect', 'designer', 'executor', 'test-executor', 'critic', 'writer'],
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
      'Auto-pilot: analyze any user message and recommend agent persona, recipe workflow, and execution path (direct in chat vs team mission). Call FIRST on new coding requests. Returns execution_path.path ("direct" | "team"), execution_path.summary (show to operator), execution_path.team_offer (when team), execution_path.forced (true when force-team override), execution_path.cleaned_goal (goal with triggers stripped), plus agent and complexity routing. Power-user override: append --force-team or phrases like "force team", "full team", "run as team", "spawn team" to bypass scoring and force Team path.',
      async (args: Record<string, unknown>) => {
        const message = args.message as string;
        if (!message) {
          throw new McpToolError('triage', 'message is required');
        }

        const lowerMessage = message.toLowerCase();

        const executionPath = classifyExecutionPath(message);

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
        // Solo recipes get a +3 bonus when their triggers match, so they are
        // preferred over enterprise recipes for the same keyword.
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
          const soloBonus = score > 0 && recipe.category === 'solo' ? 3 : 0;
          return { ...recipe, score: score + soloBonus, matchedTriggers };
        });

        recipeScores.sort((a, b) => b.score - a.score);
        const topRecipe = recipeScores[0];

        // --- Complexity analysis ---
        const complexity = await classifyWithSemantic(message, this.config);

        // --- Decide if a recipe is warranted ---
        // Recipes are for substantial, multi-step work
        const recipeThreshold = complexity.complexity === 'complex' ? 1 : 2;
        const suggestRecipe = topRecipe.score >= recipeThreshold;

        // --- Build recommendation ---
        const recommendation: Record<string, unknown> = {
          execution_path: {
            path: executionPath.path,
            summary: executionPath.summary,
            reasons: executionPath.reasons,
            estimated_minutes: executionPath.estimatedMinutes,
            team_offer: executionPath.teamOffer,
            forced: executionPath.forced ?? false,
            cleaned_goal: executionPath.cleanedGoal ?? null,
          },
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

        // Mode suggestion (quick / standard / deep / local)
        const modeMap: Record<string, string> = {
          local: 'local',
          simple: 'quick',
          medium: 'standard',
          complex: 'deep',
        };
        recommendation.suggested_mode = modeMap[complexity.complexity] || 'standard';

        // --- Local (Ollama) tier handling ---
        if (complexity.complexity === 'local' && this.config.ollama?.enabled) {
          const ollamaCfg = this.config.ollama;
          const ollamaHealth = await ModelRouter.checkOllamaHealth(ollamaCfg.base_url);
          if (ollamaHealth.available) {
            recommendation.provider = 'local';
            recommendation.ollama_model = ollamaCfg.model;
            recommendation.ollama_base_url = ollamaCfg.base_url;
            // Return early with local routing info — no openrouter model needed
            recommendation.instructions = `This is a trivial task. Route to local Ollama model "${ollamaCfg.model}" at ${ollamaCfg.base_url}. $0 cost.`;
            return recommendation;
          } else {
            // Ollama unavailable — fall back to configured tier
            const fallbackTier = ollamaCfg.fallback_to || 'simple';
            recommendation.provider = 'openrouter';
            recommendation.ollama_fallback = true;
            recommendation.ollama_fallback_reason = 'Ollama unavailable';
            recommendation.ollama_fallback_tier = fallbackTier;
            // Override complexity level for downstream model selection
            (complexity as { complexity: string }).complexity = fallbackTier;
          }
        }

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
        // Complex tasks: subagent writes the code with full codebase context, main session applies files
        // Simple/medium tasks: main session writes and applies directly
        const isComplexExecution = complexity.complexity === 'complex' && !budgetDegraded;
        if (isComplexExecution) {
          // Gather relevant file contents so the subagent gets full codebase context
          const gatheringConfig = this.config.context_gathering ?? DEFAULT_CONTEXT_GATHERING_CONFIG;
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
          ? `${executionPath.summary} Do NOT implement in chat. ${executionPath.teamOffer ?? 'Offer roland team and wait for confirmation.'}`
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
   * Resolve the agents directory. Delegates to the shared implementation in loadConfig.ts.
   */
  private static resolveAgentsDir(): string {
    return resolveAgentsDirShared(import.meta.url);
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
        const analysis = await classifyWithSemantic(query, this.config);

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
          recommendedModel = 'claude-haiku-4-5';
        } else if (budgetHint === 'unlimited' && analysis.complexity === 'simple') {
          // Allow upgrading simple queries for higher quality
          recommendedModel = 'claude-sonnet-4-6';
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

        // Quality analytics
        const allQuality = this.qualityTracker.getModelQuality() as import('../orchestrator/quality-tracker.js').ModelQuality[];
        let qualityRecommendation: string | null = null;

        // Find worst model with > 10 signals and best alternative in same tier
        const worstModel = allQuality
          .filter(q => q.total_tasks > 10)
          .sort((a, b) => a.accept_rate - b.accept_rate)[0];

        if (worstModel) {
          for (const tier of worstModel.worst_task_types) {
            const recs = this.qualityTracker.getRecommendation(tier);
            const best = recs[0];
            if (best && best.model !== worstModel.model && best.score - worstModel.accept_rate > 0.2) {
              qualityRecommendation = `Consider switching ${tier} tasks from ${worstModel.model} to ${best.model} (accept rate: ${(worstModel.accept_rate * 100).toFixed(0)}% → ${(best.score * 100).toFixed(0)}%)`;
              break;
            }
          }
        }

        result.quality = {
          models: allQuality,
          recommendation: qualityRecommendation,
        };

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
  // project_context — cross-session knowledge base
  // --------------------------------------------------------------------------
  private registerProjectContext(): void {
    this.registerTool(
      'project_context',
      'Persistent cross-session knowledge base. Compounds conventions, patterns, decisions, and error resolutions over time. Entries gain confidence with repeated observation and stale entries are pruned automatically.',
      async (args: Record<string, unknown>) => {
        const action = (args.action as string) || 'read';
        const ctx = this.projectContextManager;

        switch (action) {
          case 'read': {
            const type = args.type as 'convention' | 'pattern' | 'decision' | 'error' | undefined;
            const entries = ctx.query(type);
            return { action: 'read', type: type || 'all', entries };
          }

          case 'observe': {
            const type = args.type as 'convention' | 'pattern' | 'decision' | 'error';
            if (!type) {
              throw new McpToolError('project_context', 'type is required for observe action');
            }
            const data: Record<string, unknown> = {};
            if (args.description) data.description = args.description;
            if (args.category) data.category = args.category;
            if (args.examples) data.examples = args.examples;
            if (args.rationale) data.rationale = args.rationale;
            if (args.error_pattern) data.error_pattern = args.error_pattern;
            if (args.resolution) data.resolution = args.resolution;
            if (args.files) data.files = args.files;
            if (args.name) data.name = args.name;
            ctx.observe(type, data);
            await ctx.save();
            return { action: 'observe', type, message: 'Entry observed and saved.' };
          }

          case 'format': {
            return { action: 'format', content: ctx.formatForPrompt() };
          }

          case 'pin': {
            const id = args.id as string;
            if (!id) throw new McpToolError('project_context', 'id is required for pin action');
            const found = ctx.pin(id);
            if (found) await ctx.save();
            return { action: 'pin', id, found };
          }

          case 'unpin': {
            const id = args.id as string;
            if (!id) throw new McpToolError('project_context', 'id is required for unpin action');
            const found = ctx.unpin(id);
            if (found) await ctx.save();
            return { action: 'unpin', id, found };
          }

          case 'remove': {
            const id = args.id as string;
            if (!id) throw new McpToolError('project_context', 'id is required for remove action');
            const removed = ctx.remove(id);
            if (removed) await ctx.save();
            return { action: 'remove', id, removed };
          }

          case 'prune': {
            const count = ctx.prune();
            if (count > 0) await ctx.save();
            return { action: 'prune', removed: count };
          }

          case 'reset': {
            ctx.reset();
            await ctx.save();
            return { action: 'reset', message: 'All entries cleared. Project metadata preserved.' };
          }

          default:
            throw new McpToolError('project_context', `Unknown action: ${action}. Use: read, observe, format, pin, unpin, remove, prune, reset`);
        }
      },
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'observe', 'format', 'pin', 'unpin', 'remove', 'prune', 'reset'],
            description: 'Action to perform on the project knowledge base',
          },
          type: {
            type: 'string',
            enum: ['convention', 'pattern', 'decision', 'error'],
            description: 'Entry type (required for observe, optional filter for read)',
          },
          id: {
            type: 'string',
            description: 'Entry ID (required for pin, unpin, remove)',
          },
          description: {
            type: 'string',
            description: 'Description of the convention, pattern, or decision (for observe)',
          },
          category: {
            type: 'string',
            description: 'Convention category: naming, file-structure, import-style, test-pattern, etc. (for observe type=convention)',
          },
          examples: {
            type: 'array',
            items: { type: 'string' },
            description: 'Example strings demonstrating the convention (for observe type=convention)',
          },
          name: {
            type: 'string',
            description: 'Pattern name (for observe type=pattern)',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths where this pattern appears (for observe type=pattern)',
          },
          rationale: {
            type: 'string',
            description: 'Reasoning behind the decision (for observe type=decision)',
          },
          error_pattern: {
            type: 'string',
            description: 'What the error looks like (for observe type=error)',
          },
          resolution: {
            type: 'string',
            description: 'How the error was fixed (for observe type=error)',
          },
        },
        required: ['action'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // quality_signal — record quality feedback for a model response
  // --------------------------------------------------------------------------
  private registerQualitySignal(): void {
    this.registerTool(
      'quality_signal',
      'Record quality feedback for a model response. Call after each agent response with accept/retry/reject/manual_fix to help Roland learn which models work best for your codebase.',
      async (args: Record<string, unknown>) => {
        const model = args.model as string;
        const signal = args.signal as 'accept' | 'retry' | 'reject' | 'manual_fix';

        if (!model) {
          throw new McpToolError('quality_signal', 'model is required');
        }
        if (!signal || !['accept', 'retry', 'reject', 'manual_fix'].includes(signal)) {
          throw new McpToolError('quality_signal', 'signal must be one of: accept, retry, reject, manual_fix');
        }

        const provider = (args.provider as string) || 'openrouter';
        const task_type = (args.task_type as string) || 'unknown';
        const complexity_tier = (args.complexity_tier as string) || 'unknown';
        const retry_model = args.retry_model as string | undefined;

        await this.qualityTracker.recordSignal(
          model,
          provider,
          task_type,
          complexity_tier,
          signal,
          retry_model
        );

        const quality = this.qualityTracker.getModelQuality(model);
        return {
          recorded: true,
          model,
          signal,
          quality,
        };
      },
      {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            description: 'The model that generated the response',
          },
          signal: {
            type: 'string',
            enum: ['accept', 'retry', 'reject', 'manual_fix'],
            description: 'Quality signal for the response',
          },
          provider: {
            type: 'string',
            description: 'Provider for the model (default: openrouter)',
          },
          task_type: {
            type: 'string',
            description: 'Complexity tier or task category',
          },
          complexity_tier: {
            type: 'string',
            description: 'Complexity tier: local, simple, medium, complex',
          },
          retry_model: {
            type: 'string',
            description: 'If signal is retry, which model was used instead',
          },
        },
        required: ['model', 'signal'],
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
        const stack = error instanceof Error ? error.stack : undefined;
        logger.error(`Tool "${toolName}" failed: ${message}`, stack ? { stack } : undefined);

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
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(`MCP protocol error: ${message}`, stack ? { stack } : undefined);
    };

    this.server.onclose = () => {
      this.connected = false;
      logger.info('MCP stdio transport closed');
      if (!this.shuttingDown) {
        // Stdio cannot reconnect in-process — exit cleanly so Cursor respawns us.
        logger.warn('Client disconnected — exiting for Cursor to restart the MCP server');
        process.exit(0);
      }
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

        // Force model overrides everything — bypasses routing entirely
        const forceModel = typeof args.force_model === 'string' ? args.force_model : null;

        // Auto-route: use force_model > provided model > complexity analysis
        let modelId = forceModel ?? (typeof args.model === 'string' ? args.model : null);
        let routingInfo: Record<string, unknown> = {};

        if (forceModel) {
          routingInfo = { auto_routed: false, forced: true, model_selected: forceModel };
        } else if (!modelId) {
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

        const gooseModel = normaliseGooseModel(modelId ?? 'claude-sonnet-4-5');

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

        // Write pending change file for VS Code extension consumption
        const writePending = args.write_pending !== false;
        let pendingFile: string | undefined;
        if (writePending && filename !== 'file') {
          try {
            const projectRoot = process.env.ROLAND_PROJECT_ROOT || process.cwd();
            const pendingDir = path.join(projectRoot, '.omc', 'pending-changes');
            fs.mkdirSync(pendingDir, { recursive: true });
            const safeName = filename.replace(/[/\\:]/g, '_');
            const ts = Date.now();
            pendingFile = path.join(pendingDir, `${safeName}-${ts}.json`);
            fs.writeFileSync(pendingFile, JSON.stringify({
              originalPath: filename,
              proposedContent: modified,
              description: `${result.additions} additions, ${result.deletions} deletions`,
              tool: 'preview_changes',
              timestamp: new Date().toISOString(),
            }, null, 2), 'utf-8');
          } catch {
            // Non-fatal — extension just won't pick it up
          }
        }

        // Broadcast diff event to any connected VS Code extension clients
        try {
          const diffServer = getDiffStreamServer();
          if (diffServer && diffServer.getClientCount() > 0) {
            const { randomUUID } = await import('crypto');
            diffServer.broadcastDiff({
              type: 'diff:new',
              id: randomUUID(),
              file: filename !== 'file' ? filename : undefined,
              original,
              modified,
              timestamp: Date.now(),
            });
          }
        } catch {
          // Non-fatal — WebSocket broadcast failure should not affect tool result
        }

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
          pending_change_file: pendingFile,
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
          write_pending: {
            type: 'boolean',
            description: 'Write a pending change file for VS Code extension consumption (default: true). Set false to skip.',
          },
        },
        required: ['original', 'modified'],
      }
    );
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async start(options: { maxConnectRetries?: number } = {}): Promise<void> {
    const maxRetries = options.maxConnectRetries ?? 5;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.connectTransport();
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        logger.error(`MCP stdio connect failed (attempt ${attempt}/${maxRetries}): ${message}`, stack ? { stack } : undefined);

        if (attempt < maxRetries) {
          const delay = Math.min(500 * 2 ** (attempt - 1), 8000);
          logger.warn(`Retrying MCP connection in ${delay}ms…`);
          await sleep(delay);
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new McpServerError(`Failed to start MCP server after ${maxRetries} attempts: ${message}`);
  }

  private async connectTransport(): Promise<void> {
    logger.info('Connecting Roland MCP server via stdio transport…');
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    this.connected = true;
    logger.success(`MCP server connected (${this.getTools().length} tools)`);
    logger.info(`Tools: ${this.getTools().join(', ')}`);

    // Start the diff stream WebSocket server (optional sidecar)
    const diffStreamPort = this.config.diff_stream?.port ?? 8089;
    const diffStreamEnabled = this.config.diff_stream?.enabled !== false;
    if (diffStreamEnabled) {
      try {
        const diffServer = initDiffStreamServer(diffStreamPort);
        diffServer.start();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Diff stream server unavailable (non-fatal): ${message}`);
      }
    }
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --------------------------------------------------------------------------
  // git_status / git_diff / git_log / git_commit
  // --------------------------------------------------------------------------
  private registerGitTools(): void {
    this.registerTool(
      'git_status',
      'Read-only: current git status (staged, unstaged, untracked). Use before planning edits or commits. Pass project_root to target a repo other than ROLAND_PROJECT_ROOT/cwd.',
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
      'Read-only: unified diff of working-tree changes. Pass staged:true for index-only, file_path to limit scope, max_lines to cap output.',
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
      'Read-only: recent commit history (one-line format). Defaults to 10 commits. Use to understand recent changes before editing.',
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
      'Create a git commit (mutating). Stages files[] or all changes (git add -A) then commits with message. Requires explicit user approval in Cursor.',
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

  // --------------------------------------------------------------------------
  // analyze_screenshot — capture or load image, analyse with vision model
  // --------------------------------------------------------------------------
  private registerAnalyzeScreenshot(): void {
    this.registerTool(
      'analyze_screenshot',
      'Capture the primary screen (or load an existing image file) and analyse it with a vision-capable model. Returns a text description of what is visible — code, errors, UI, etc. Useful when debugging visual issues or reading screenshots.',
      async (args: Record<string, unknown>) => {
        const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
        const prompt = typeof args.prompt === 'string' ? args.prompt
          : 'Describe what you see in this image, focusing on any code, error messages, UI elements, or anything relevant to software development.';
        const model = typeof args.model === 'string' ? args.model : 'google/gemini-2.5-flash';

        const result = await analyzeScreenshot({ filePath, prompt, model });
        return {
          analysis: result.analysis,
          model: result.model,
          source: result.capturedNow ? 'screen capture' : result.imagePath,
        };
      }
    );
  }

  // --------------------------------------------------------------------------
  // read_context — on-demand file reading for subagents during execution
  // --------------------------------------------------------------------------

  private registerReadContext(): void {
    this.registerTool(
      'read_context',
      'Read file contents from the project codebase. Use this when you need additional files beyond what was provided in relevant_files. Pass an array of file paths to read. Returns file contents ready to use as context for code generation.',
      async (args: Record<string, unknown>) => {
        const filePaths = args.files;
        if (!Array.isArray(filePaths) || filePaths.length === 0) {
          return { error: 'Provide a "files" array of file paths to read.' };
        }

        const maxFiles = 20;
        const maxBytesPerFile = 50000; // ~50KB per file
        const paths = filePaths
          .filter((f): f is string => typeof f === 'string')
          .slice(0, maxFiles);

        const results: Array<{ path: string; content: string; sizeBytes: number }> = [];
        const errors: Array<{ path: string; error: string }> = [];

        for (const filePath of paths) {
          try {
            // Prevent path traversal
            const resolved = path.resolve(filePath);
            const cwd = process.cwd();
            if (!resolved.startsWith(cwd)) {
              errors.push({ path: filePath, error: 'Path outside project directory' });
              continue;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const sizeBytes = Buffer.byteLength(content, 'utf-8');

            if (sizeBytes > maxBytesPerFile) {
              // Return truncated content for large files
              const truncated = content.slice(0, maxBytesPerFile);
              results.push({ path: filePath, content: truncated + '\n// ... [truncated]', sizeBytes });
            } else {
              results.push({ path: filePath, content, sizeBytes });
            }
          } catch (err) {
            errors.push({ path: filePath, error: (err as Error).message });
          }
        }

        const totalBytes = results.reduce((sum, f) => sum + f.sizeBytes, 0);

        return {
          files: results,
          errors: errors.length > 0 ? errors : undefined,
          total_files: results.length,
          total_bytes: totalBytes,
        };
      },
      {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of file paths to read (relative to project root)',
          },
        },
        required: ['files'],
      }
    );
  }

  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    try {
      logger.info('Stopping MCP server…');
      const diffServer = getDiffStreamServer();
      if (diffServer) {
        try {
          diffServer.stop();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`Error stopping diff stream server: ${message}`);
        }
      }
      await this.server.close();
      this.connected = false;
      this.transport = null;
      logger.success('MCP server stopped cleanly');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(`Error during MCP shutdown: ${message}`, stack ? { stack } : undefined);
    }
  }

  // ==========================================================================
  // Tool Registration Helper
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Coordination substrate (Phase 1): Blackboard + Message Bus
  //
  // The shared-awareness layer. The host acts as the Lead PM and, together with
  // any sub-agents it spawns, uses these tools to publish facts/tasks/blockers,
  // read the whole board, and exchange directed or broadcast messages. State is
  // project-scoped under .roland/ so one global MCP registration works in every
  // repo.
  // --------------------------------------------------------------------------
  private registerCoordinationTools(): void {
    // blackboard_post — create or update a shared entry
    this.registerTool(
      'blackboard_post',
      'Publish or update a shared entry on the team Blackboard (a fact, decision, task, artifact, blocker, or status). Re-posting the same key updates it and bumps its rev. Pass expectedRev to guard against overwriting a concurrent change.',
      async (args: Record<string, unknown>) => {
        try {
          const entry = this.coordination.blackboard.post({
            key: args.key as string,
            type: args.type as never,
            value: args.value,
            tags: args.tags as string[] | undefined,
            author: args.author as string,
            status: args.status as never,
            expectedRev: args.expectedRev as number | undefined,
          });
          return { ok: true, entry };
        } catch (err) {
          if (err instanceof ConcurrencyError) {
            return { ok: false, conflict: { key: err.key, expected: err.expected, actual: err.actual } };
          }
          throw err;
        }
      },
      {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Stable id for the entry, e.g. "task:auth-refactor". Re-posting updates it.' },
          type: { type: 'string', enum: ['fact', 'decision', 'task', 'artifact', 'blocker', 'status'], description: 'Kind of entry.' },
          value: { description: 'Arbitrary JSON payload (string, object, etc.).' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering.' },
          author: { type: 'string', description: 'Agent id posting this, e.g. "lead-pm" or "executor#3".' },
          status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'archived'], description: 'Optional lifecycle status (most useful for tasks/blockers).' },
          expectedRev: { type: 'number', description: 'If set and the stored rev differs, the post is rejected with a concurrency error.' },
        },
        required: ['key', 'type', 'value', 'author'],
      }
    );

    // blackboard_read — query the board
    this.registerTool(
      'blackboard_read',
      'Read entries from the team Blackboard, newest first. All filters are optional; with none, returns the most recent entries. Use this to get shared awareness of tasks, decisions, and blockers across the team.',
      async (args: Record<string, unknown>) => {
        const entries = this.coordination.blackboard.read({
          key: args.key as string | undefined,
          type: args.type as never,
          tags: args.tags as string[] | undefined,
          author: args.author as string | undefined,
          status: args.status as never,
          since: args.since as number | undefined,
          includeArchived: args.includeArchived as boolean | undefined,
          limit: (args.limit as number | undefined) ?? 50,
        });
        return { count: entries.length, entries };
      },
      {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Exact key to fetch.' },
          type: { type: 'string', enum: ['fact', 'decision', 'task', 'artifact', 'blocker', 'status'] },
          tags: { type: 'array', items: { type: 'string' }, description: 'Match-any: entry matches if it has at least one of these tags.' },
          author: { type: 'string' },
          status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'archived'] },
          since: { type: 'number', description: 'Only entries updated at or after this epoch-ms timestamp.' },
          includeArchived: { type: 'boolean', description: 'Include archived entries (default false).' },
          limit: { type: 'number', description: 'Max entries to return (default 50, max 200).' },
        },
        required: [],
      }
    );

    // blackboard_patch — partial update of an existing entry
    this.registerTool(
      'blackboard_patch',
      'Partially update an existing Blackboard entry (e.g. transition a task status to in_progress/done, or revise its value). Bumps rev. Fails if the key does not exist.',
      async (args: Record<string, unknown>) => {
        try {
          const entry = this.coordination.blackboard.patch({
            key: args.key as string,
            author: args.author as string,
            changes: (args.changes as Record<string, unknown>) ?? {},
            expectedRev: args.expectedRev as number | undefined,
          });
          return { ok: true, entry };
        } catch (err) {
          if (err instanceof ConcurrencyError) {
            return { ok: false, conflict: { key: err.key, expected: err.expected, actual: err.actual } };
          }
          throw err;
        }
      },
      {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key of the entry to update.' },
          author: { type: 'string', description: 'Agent id making the change.' },
          changes: {
            type: 'object',
            description: 'Fields to change.',
            properties: {
              type: { type: 'string', enum: ['fact', 'decision', 'task', 'artifact', 'blocker', 'status'] },
              value: { description: 'New JSON payload.' },
              tags: { type: 'array', items: { type: 'string' } },
              status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'archived'] },
            },
          },
          expectedRev: { type: 'number', description: 'Optional optimistic-concurrency guard.' },
        },
        required: ['key', 'author', 'changes'],
      }
    );

    // bus_send — send a peer-to-peer or broadcast message
    this.registerTool(
      'bus_send',
      'Send a message on the team Message Bus to a specific agent, or to "*" to broadcast to everyone but the sender. Use this for direct peer-to-peer coordination that does not belong on the shared Blackboard.',
      async (args: Record<string, unknown>) => {
        const message = this.coordination.bus.send({
          from: args.from as string,
          to: args.to as string,
          topic: args.topic as string | undefined,
          body: args.body as string,
          replyTo: args.replyTo as string | undefined,
        });
        return { ok: true, message };
      },
      {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Sender agent id.' },
          to: { type: 'string', description: 'Recipient agent id, or "*" to broadcast.' },
          topic: { type: 'string', description: 'Optional topic/channel (default "general").' },
          body: { type: 'string', description: 'Message content.' },
          replyTo: { type: 'string', description: 'Optional id of the message this replies to.' },
        },
        required: ['from', 'to', 'body'],
      }
    );

    // bus_poll — drain a recipient's mailbox
    this.registerTool(
      'bus_poll',
      'Drain undelivered messages addressed to an agent (directly or via broadcast). By default acknowledges them so they are not returned again. Returns messages oldest-first plus a nextSince cursor for the next poll.',
      async (args: Record<string, unknown>) => {
        const messages = this.coordination.bus.poll({
          recipient: args.recipient as string,
          since: args.since as number | undefined,
          topic: args.topic as string | undefined,
          ack: args.ack as boolean | undefined,
          limit: args.limit as number | undefined,
        });
        const nextSince = messages.length > 0 ? messages[messages.length - 1].ts + 1 : (args.since as number | undefined);
        return { count: messages.length, messages, nextSince };
      },
      {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'Agent id whose mailbox to drain.' },
          since: { type: 'number', description: 'Only messages at or after this epoch-ms timestamp.' },
          topic: { type: 'string', description: 'Restrict to a single topic.' },
          ack: { type: 'boolean', description: 'Mark returned messages delivered to this recipient (default true). Set false to peek.' },
          limit: { type: 'number', description: 'Max messages to return (1-200).' },
        },
        required: ['recipient'],
      }
    );
  }

  // --------------------------------------------------------------------------
  // PM control loop (Phase 2): the Lead PM's team-management surface.
  //
  // The host acts as the Lead PM (Opus 4.7). These tools let it decompose work,
  // assign engineers, monitor and clear blockers, review submissions, and
  // synthesize the result — all on top of the Phase 1 Blackboard + Message Bus.
  // The lifecycle is enforced server-side so the board can't reach a bad state.
  // --------------------------------------------------------------------------
  private registerPmTools(): void {
    // get_pm_playbook — adopt the Engineering-Manager posture
    this.registerTool(
      'get_pm_playbook',
      'Fetch the Lead PM playbook (the Engineering-Manager system prompt). Call this once at the start of a session so you operate as the PM: keep the team unblocked, decompose and delegate, review against acceptance criteria.',
      async () => this.leadPm.getPlaybook(),
      { type: 'object', properties: {}, required: [] }
    );

    // pm_standup — the rendered, daily-driver heartbeat (Phase 4)
    this.registerTool(
      'pm_standup',
      'Cursor daily-driver: rendered Markdown standup with blockers first, board state, usage, UNSC mission summary, and your next 3 actions. Call at the start of each chat turn when @roland is active, or after roland_run_team to track progress.',
      async () => {
        const standup = this.leadPm.getStandup();
        try {
          const { coordDir } = await import('../coordination/paths.js');
          const { buildBoardStatusReport, formatConciseUnscSummary } = await import('../rco/board-report.js');
          const unsc = formatConciseUnscSummary(buildBoardStatusReport(coordDir()));
          return {
            ...standup,
            markdown: `${standup.markdown}\n\n---\n\n${unsc}`,
            unscSummary: unsc,
          };
        } catch {
          return standup;
        }
      },
      { type: 'object', properties: {}, required: [] }
    );

    // board_status — concise UNSC summary for end-of-task reporting
    this.registerTool(
      'board_status',
      'Concise UNSC mission status from .roland/blackboard.json and command-blackboard.md. Use after team runs or at end of major tasks. Blockers listed first. Pass format:"json" for structured output, format:"verbose" for full report.',
      async (args: Record<string, unknown>) => {
        const projectRoot = process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd();
        const stateDir = typeof args.state_dir === 'string' && args.state_dir
          ? args.state_dir
          : path.join(projectRoot, '.roland');
        const { buildBoardStatusReport, formatConciseUnscSummary, formatBoardStatusReport } =
          await import('../rco/board-report.js');
        const report = buildBoardStatusReport(stateDir, typeof args.goal === 'string' ? args.goal : undefined);
        const concise = formatConciseUnscSummary(report);
        if (args.format === 'json') {
          return { ...report, concise };
        }
        if (args.format === 'verbose') {
          return { markdown: formatBoardStatusReport(report), report, concise };
        }
        return { markdown: concise, report, concise };
      },
      {
        type: 'object',
        properties: {
          state_dir: { type: 'string', description: 'Path to .roland state directory' },
          goal: { type: 'string', description: 'Optional goal hint for smart command-board recall' },
          format: { type: 'string', enum: ['markdown', 'json', 'verbose'], description: 'Output shape (default: markdown concise summary)' },
        },
        required: [],
      }
    );

    // get_team_context — THE HEARTBEAT (structured; pass format:"markdown" for a rendered standup)
    this.registerTool(
      'get_team_context',
      'The PM heartbeat. Returns the full team digest: status counts, the blockers/reviews/stalled/ready items that need your attention (blockers first), your inbox, recent decisions, and concrete suggested next actions. Pass format:"markdown" for a rendered standup. Act on needsAttention top-down — unblock before starting new work.',
      async (args: Record<string, unknown>) => {
        if (args.format === 'markdown') return this.leadPm.getStandup();
        return this.leadPm.getTeamContext();
      },
      {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'markdown'], description: 'Output format. "markdown" returns a rendered standup; default is structured JSON.' },
        },
        required: [],
      }
    );

    // list_team — the roster of engineers
    this.registerTool(
      'list_team',
      'List Roland engineer personas (executor, architect, test-author, etc.) with specialties and recommended models. Use before spawn_task or assign_task.',
      async () => ({ engineers: this.leadPm.listTeam() }),
      { type: 'object', properties: {}, required: [] }
    );

    // spawn_task — register a decomposed task
    this.registerTool(
      'spawn_task',
      'Register a decomposed unit of work as a task on the board (status: open). Returns the task plus a dispatch packet (engineer persona, recommended model, assembled brief, context files) you use to launch the engineer in your IDE.',
      async (args: Record<string, unknown>) => {
        return this.leadPm.spawnTask({
          slug: args.slug as string,
          title: args.title as string,
          description: args.description as string,
          assignee: args.assignee as string | undefined,
          dependsOn: args.dependsOn as string[] | undefined,
          priority: args.priority as never,
          acceptanceCriteria: args.acceptanceCriteria as string | undefined,
        });
      },
      {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Short stable id for the task, e.g. "login-ui". Becomes key "task:login-ui".' },
          title: { type: 'string', description: 'Human-readable title.' },
          description: { type: 'string', description: 'What the engineer must accomplish.' },
          assignee: { type: 'string', description: 'Optional engineer persona to suggest. If omitted, Roland recommends one.' },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task keys that must be done before this can start.' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
          acceptanceCriteria: { type: 'string', description: 'Concrete bar the work is reviewed against.' },
        },
        required: ['slug', 'title', 'description'],
      }
    );

    // assign_task — assign to an engineer and notify
    this.registerTool(
      'assign_task',
      'Assign a task to an engineer (open/in_progress → in_progress), notify them on the bus, and return a fresh dispatch packet to launch them.',
      async (args: Record<string, unknown>) => {
        return this.leadPm.assignTask({
          taskKey: args.taskKey as string,
          assignee: args.assignee as string,
        });
      },
      {
        type: 'object',
        properties: {
          taskKey: { type: 'string', description: 'Key of the task, e.g. "task:login-ui".' },
          assignee: { type: 'string', description: 'Engineer persona id (see list_team).' },
        },
        required: ['taskKey', 'assignee'],
      }
    );

    // mark_blocked — raise a blocker (engineer or PM)
    this.registerTool(
      'mark_blocked',
      'Flag a task as blocked (in_progress → blocked), recording exactly what is needed and notifying the PM. Engineers call this the moment they are stuck.',
      async (args: Record<string, unknown>) => {
        return this.leadPm.markBlocked({
          taskKey: args.taskKey as string,
          need: args.need as string,
          raisedBy: args.raisedBy as string,
          slug: args.slug as string | undefined,
        });
      },
      {
        type: 'object',
        properties: {
          taskKey: { type: 'string', description: 'Key of the blocked task.' },
          need: { type: 'string', description: 'Precisely what is needed to proceed (a decision, file, constraint, access).' },
          raisedBy: { type: 'string', description: 'Agent id raising the blocker (the engineer, or "lead-pm").' },
          slug: { type: 'string', description: 'Optional human-readable blocker id.' },
        },
        required: ['taskKey', 'need', 'raisedBy'],
      }
    );

    // unblock_task — PM resolves a blocker
    this.registerTool(
      'unblock_task',
      'Resolve a blocker with a concrete decision. Records the decision on the board, archives the blocker, returns the task to in_progress once no blockers remain, and notifies the assignee. This is your highest-priority action.',
      async (args: Record<string, unknown>) => {
        return this.leadPm.unblockTask({
          taskKey: args.taskKey as string,
          blockerKey: args.blockerKey as string,
          resolution: args.resolution as string,
        });
      },
      {
        type: 'object',
        properties: {
          taskKey: { type: 'string', description: 'Key of the blocked task.' },
          blockerKey: { type: 'string', description: 'Key of the blocker to resolve (from get_team_context).' },
          resolution: { type: 'string', description: 'Your concrete decision/answer that unblocks the engineer.' },
        },
        required: ['taskKey', 'blockerKey', 'resolution'],
      }
    );

    // complete_task — engineer submits work for review
    this.registerTool(
      'complete_task',
      'Submit completed work: attaches an artifact and moves the task to in_review, notifying the PM. Engineers call this when done. Optionally pass model + input_tokens/output_tokens to attribute Cursor usage in the same call (no need to also call report_usage).',
      async (args: Record<string, unknown>) => {
        return this.leadPm.completeTask({
          taskKey: args.taskKey as string,
          summary: args.summary as string,
          content: args.content as string | undefined,
          author: args.author as string,
          slug: args.slug as string | undefined,
          model: args.model as string | undefined,
          inputTokens: args.input_tokens as number | undefined,
          outputTokens: args.output_tokens as number | undefined,
        });
      },
      {
        type: 'object',
        properties: {
          taskKey: { type: 'string', description: 'Key of the task being completed.' },
          summary: { type: 'string', description: 'One-line summary of what was delivered.' },
          content: { type: 'string', description: 'Optional artifact body (diff, doc, output).' },
          author: { type: 'string', description: 'Engineer id submitting the work.' },
          slug: { type: 'string', description: 'Optional human-readable artifact id.' },
          model: { type: 'string', description: 'Optional Cursor model used (e.g. "composer-2.5-standard") — enables usage attribution.' },
          input_tokens: { type: 'number', description: 'Optional Cursor input tokens used for this task.' },
          output_tokens: { type: 'number', description: 'Optional Cursor output tokens used for this task.' },
        },
        required: ['taskKey', 'summary', 'author'],
      }
    );

    // review_task — PM accepts or rejects
    this.registerTool(
      'review_task',
      'Review submitted work against its acceptance criteria. accept → done; reject → back to in_progress with your notes, and the engineer is notified to rework.',
      async (args: Record<string, unknown>) => {
        return this.leadPm.reviewTask({
          taskKey: args.taskKey as string,
          decision: args.decision as 'accept' | 'reject',
          notes: args.notes as string | undefined,
        });
      },
      {
        type: 'object',
        properties: {
          taskKey: { type: 'string', description: 'Key of the task in review.' },
          decision: { type: 'string', enum: ['accept', 'reject'], description: 'Accept the work or send it back.' },
          notes: { type: 'string', description: 'On reject: the specific gap to fix.' },
        },
        required: ['taskKey', 'decision'],
      }
    );

    // synthesize_deliverable — final rollup
    this.registerTool(
      'synthesize_deliverable',
      'Roll up all completed tasks and their artifacts into a single deliverable summary for the human PM. Call this when nothing is open/in_progress/blocked/in_review.',
      async () => this.leadPm.synthesizeDeliverable(),
      { type: 'object', properties: {}, required: [] }
    );

    // list_team_recipes — the pre-decomposed team templates
    this.registerTool(
      'list_team_recipes',
      'List the bundled team recipes (e.g. full-feature-team, bugfix-team, refactor-team) — pre-decomposed task graphs you can drop onto the board in one call with start_team_recipe.',
      async () => ({ recipes: this.leadPm.listTeamRecipes() }),
      { type: 'object', properties: {}, required: [] }
    );

    // start_team_recipe — instantiate a whole task graph for a goal
    this.registerTool(
      'start_team_recipe',
      'Instantiate a team recipe for a goal: seeds the entire task graph on the board (namespaced + dependency-linked) and returns dispatch packets for the tasks ready to start now. Use this to kick off a standard workflow without decomposing by hand.',
      async (args: Record<string, unknown>) => {
        return this.leadPm.startTeamRecipe({
          recipe: args.recipe as string,
          goal: args.goal as string,
          namespace: args.namespace as string | undefined,
        });
      },
      {
        type: 'object',
        properties: {
          recipe: { type: 'string', description: 'Recipe name (see list_team_recipes), e.g. "full-feature-team".' },
          goal: { type: 'string', description: 'The goal to instantiate the recipe for; substituted into task titles/descriptions.' },
          namespace: { type: 'string', description: 'Optional slug prefix for the task keys. Defaults to a goal-derived unique prefix.' },
        },
        required: ['recipe', 'goal'],
      }
    );

    // report_usage — attribute Cursor token usage to a task/engineer
    this.registerTool(
      'report_usage',
      'Attribute Cursor token usage to a task and engineer. Records usage for visibility (cost is $0 — Cursor billing is by subscription) and rolls it onto the task. Engineers can instead pass these fields directly to complete_task.',
      async (args: Record<string, unknown>) => {
        return this.leadPm.recordUsage({
          taskKey: args.taskKey as string,
          engineer: args.engineer as string,
          model: args.model as string,
          inputTokens: args.input_tokens as number,
          outputTokens: args.output_tokens as number,
        });
      },
      {
        type: 'object',
        properties: {
          taskKey: { type: 'string', description: 'Key of the task the usage belongs to.' },
          engineer: { type: 'string', description: 'Engineer persona id that did the work.' },
          model: { type: 'string', description: 'Cursor model used, e.g. "composer-2.5-standard".' },
          input_tokens: { type: 'number', description: 'Input tokens consumed.' },
          output_tokens: { type: 'number', description: 'Output tokens produced.' },
        },
        required: ['taskKey', 'engineer', 'model', 'input_tokens', 'output_tokens'],
      }
    );

    // get_team_usage — Cursor usage dashboard (pass format:"markdown" for a rendered view)
    this.registerTool(
      'get_team_usage',
      'Cursor usage attribution across the team: token/request totals broken down by engineer, model, and task. Figures are usage, not dollars (the PM team runs on the Cursor subscription). Pass format:"markdown" for a rendered view.',
      async (args: Record<string, unknown>) => {
        const usage = this.leadPm.getTeamUsage();
        if (args.format === 'markdown') return { markdown: renderUsage(usage), usage };
        return usage;
      },
      {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'markdown'], description: 'Output format. "markdown" returns a rendered table; default is structured JSON.' },
        },
        required: [],
      }
    );

    // get_pm_events — the audit timeline (Phase 4 observability)
    this.registerTool(
      'get_pm_events',
      'The PM event timeline: a reverse-chronological audit trail of lifecycle actions (spawn/assign/block/unblock/complete/review/usage/recipe-start) from .roland/pm-events.log. Use this to answer "what happened on this feature?". Pass format:"markdown" for a rendered timeline.',
      async (args: Record<string, unknown>) => {
        const events = this.leadPm.getPmEvents(
          (args.limit as number | undefined) ?? 50,
          {
            action: args.action as PMEventAction | undefined,
            taskKey: args.taskKey as string | undefined,
          }
        );
        if (args.format === 'markdown') return { markdown: renderTimeline(events), events };
        return { events };
      },
      {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max events to return (newest first). Default 50.' },
          action: { type: 'string', enum: ['spawn', 'assign', 'block', 'unblock', 'complete', 'review', 'usage', 'recipe-start'], description: 'Optional filter by action.' },
          taskKey: { type: 'string', description: 'Optional filter to a single task key.' },
          format: { type: 'string', enum: ['json', 'markdown'], description: '"markdown" returns a rendered timeline; default is structured JSON.' },
        },
        required: [],
      }
    );
  }

  // --------------------------------------------------------------------------
  // Cursor chat tools — roland_hello, roland_run_team
  //
  // These two tools power the @roland Cursor chat experience:
  //   roland_hello     — welcome banner + project state on first invocation
  //   roland_run_team  — launch a background PM team run from chat
  // --------------------------------------------------------------------------
  private registerChatTools(): void {
    // ── roland_hello ──────────────────────────────────────────────────────────
    this.registerTool(
      'roland_hello',
      'Start-of-session handshake for @roland in Cursor chat. Returns a welcome banner, capabilities table, current board/memory state, and quick-start hints. Call when the user first mentions @roland.',
      async (args: Record<string, unknown>) => {
        const projectRoot = process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd();
        const stateDir = typeof args.state_dir === 'string' && args.state_dir
          ? args.state_dir
          : path.join(projectRoot, '.roland');

        // ── Memory summary ───────────────────────────────────────────────────
        let memoryStatus = 'No project memory yet — builds automatically after each run.';
        let memoryBulletCount = 0;
        try {
          const mem = fs.readFileSync(path.join(stateDir, 'memory.md'), 'utf-8');
          memoryBulletCount = mem.split('\n').filter(l => l.trim().startsWith('- ')).length;
          if (memoryBulletCount > 0) {
            memoryStatus = `${memoryBulletCount} knowledge entries (Architecture Decisions · Coding Standards · Past Mistakes · Preferences).`;
          }
        } catch { /* no memory yet */ }

        // ── Board summary ────────────────────────────────────────────────────
        let boardStatus = 'No active tasks.';
        let blockerCount = 0;
        let unscSnippet = '';
        try {
          const { buildBoardStatusReport, formatConciseUnscSummary } = await import('../rco/board-report.js');
          const report = buildBoardStatusReport(stateDir);
          blockerCount = report.counts.blockers;
          if (report.counts.total > 0) {
            boardStatus = `${report.counts.total} entries · ${report.counts.blockers} blockers · ${report.counts.done} done`;
          }
          unscSnippet = formatConciseUnscSummary(report);
        } catch {
          try {
            const bb = JSON.parse(fs.readFileSync(path.join(stateDir, 'blackboard.json'), 'utf-8'));
            const entries = Array.isArray(bb) ? bb : [];
            if (entries.length > 0) {
              boardStatus = `${entries.length} entries`;
            }
          } catch { /* no board yet */ }
        }

        // ── Background run status ────────────────────────────────────────────
        let bgStatus = '';
        try {
          const pidRec = JSON.parse(fs.readFileSync(path.join(stateDir, 'supervisor.pid'), 'utf-8'));
          const alive = (() => { try { process.kill(pidRec.pid, 0); return true; } catch { return false; } })();
          if (alive) {
            bgStatus = `\n- 🔄 **Background run active** (PID ${pidRec.pid}): "${(pidRec.goal ?? '').slice(0, 60)}"`;
          }
        } catch { /* no bg run */ }

        const blockerWarning = blockerCount > 0
          ? `\n> ⚠️ **${blockerCount} blocker${blockerCount !== 1 ? 's' : ''} need your attention** — call \`pm_standup()\` to see them.\n`
          : '';

        const greeting = `# 👋 Roland is ready

${blockerWarning}
## What I can do

| Mode | Use when | How |
|------|----------|-----|
| **Direct in chat** | Single-file edits · Q&A · Quick fixes · < 30 min | I edit files here in Cursor |
| **PM Team run** | Features · Refactors · Tests · Multi-file · > 30 min | \`roland_run_team({ goal })\` after you confirm |
| **Background mode** | Long-running goals while you keep working | \`roland team "goal" --background\` in terminal |

Every request is triaged to **Direct** or **Team** — I show the path and reasoning before acting.

## Current project state
${bgStatus}
- 📚 **Memory:** ${memoryStatus}
- 📋 **Board:** ${boardStatus}

## Quick examples

\`\`\`
# Small task — I handle it directly:
@roland why is the login endpoint returning 401 intermittently?

# Complex goal — I'll spin up the full team:
@roland add complete OAuth2 support with GitHub and Google providers

# Check team status:
@roland what's the current status?

# Launch a recipe workflow:
start_team_recipe({ recipe: "bugfix-team", goal: "fix the memory leak in the WebSocket handler" })
\`\`\`

## Terminal commands

\`\`\`bash
roland "goal"              # full team run
roland bg-status           # background run health
roland status              # live TUI observer
roland doctor              # verify install
npm run serve-dashboard    # usage dashboard → http://127.0.0.1:8081
\`\`\`
${unscSnippet ? `\n---\n\n${unscSnippet}\n` : ''}
What would you like to work on?`;

        return {
          greeting,
          project_state: {
            memory_entries: memoryBulletCount,
            board: boardStatus,
            blockers: blockerCount,
            state_dir: stateDir,
          },
          quick_start: blockerCount > 0
            ? 'Call pm_standup() first — there are open blockers to resolve.'
            : 'Describe your goal and I\'ll triage it, or call pm_standup() to check the board.',
        };
      },
      {
        type: 'object',
        properties: {
          state_dir: {
            type: 'string',
            description: 'Path to .roland state directory (default: .roland/ in project root)',
          },
        },
        required: [],
      }
    );

    // ── roland_run_team ───────────────────────────────────────────────────────
    this.registerTool(
      'roland_run_team',
      'Launch a background PM team run for goals on the **Team** execution path. Use when work needs multi-file changes, Sparrow + Vanguard test orchestration, Command Blackboard tracking, wave synthesis, or > 30–45 min effort. Also use when the operator forces team mode via --force-team, "force team", "full team", "run as team", or "spawn team" (no confirmation needed — launch immediately). Do NOT use for single-file edits, Q&A, or quick fixes unless force-team was explicitly requested. Trade-off: team runs add PM overhead but provide parallel callsigns, blocker surfacing, and Mission Complete synthesis. Returns immediately; track with pm_standup() or get_team_context().',
      async (args: Record<string, unknown>) => {
        const goal = args.goal as string;
        if (!goal || typeof goal !== 'string' || !goal.trim()) {
          throw new McpToolError('roland_run_team', '"goal" is required — describe what you want the team to build or fix');
        }

        const projectRoot = process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd();
        const stateDir = typeof args.state_dir === 'string' && args.state_dir
          ? args.state_dir
          : path.join(projectRoot, '.roland');

        // Locate the roland CLI entry point (dist/index.js from dist/server/)
        let entryPoint: string;
        try {
          const thisFile = fileURLToPath(import.meta.url);
          entryPoint = path.resolve(path.dirname(thisFile), '..', 'index.js');
          if (!fs.existsSync(entryPoint)) throw new Error('not found');
        } catch {
          entryPoint = path.join(process.cwd(), 'dist', 'index.js');
        }

        // Prepare log file
        const logDir = path.join(stateDir, 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        const ts = Date.now();
        const logFile = path.join(logDir, `chat-${ts}.log`);
        const logFd = fs.openSync(logFile, 'a');

        // Spawn detached — unref so the MCP server doesn't wait for it
        const { spawn } = await import('child_process');
        const child = spawn(
          process.execPath,
          [entryPoint, 'team', goal.trim(), '--background'],
          {
            cwd: projectRoot,
            detached: true,
            stdio: ['ignore', logFd, logFd],
            env: { ...process.env },
          }
        );
        child.unref();
        fs.closeSync(logFd);

        const pid = child.pid ?? 0;
        const truncatedGoal = goal.trim().slice(0, 100) + (goal.trim().length > 100 ? '…' : '');

        return {
          started: true,
          goal: truncatedGoal,
          pid,
          log_file: logFile,
          state_dir: stateDir,
          message: `✅ PM team started (PID ${pid}):\n"${truncatedGoal}"`,
          next_steps: [
            'Call pm_standup() in ~30 seconds to see the task plan once Wave 1 begins',
            'Call get_team_context() for the full structured board state',
            'Run `roland bg-status` in your terminal to check background job health',
            `Logs: ${logFile}`,
          ],
          tip: 'The Lead PM is decomposing your goal now. Wave 1 kicks off in ~30 s — call pm_standup() to see the plan and any early blockers.',
        };
      },
      {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            description: 'The engineering goal for the PM team. Be specific: include scope, constraints, and what "done" looks like. Examples: "add JWT refresh token rotation — 15-min access, 7-day refresh, stored in Redis" or "fix the N+1 query in GET /users — use eager loading for the roles relation".',
          },
          state_dir: {
            type: 'string',
            description: 'Path to .roland state directory (default: .roland/ in project root). Omit to use the project default.',
          },
        },
        required: ['goal'],
      }
    );
  }

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

// ============================================================================
// Standalone MCP entry (node dist/server/mcp-server.js)
// ============================================================================

function isMcpMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

/** Run Roland as a stdio MCP server — used by `npm run mcp`, Cursor, and `roland serve`. */
export async function runMcpServer(): Promise<void> {
  const { loadConfig } = await import('../config/config-loader.js');

  if (process.env.ROLAND_QUIET === '1' || process.env.ROLAND_QUIET === 'true') {
    logger.setLevel('warn');
  }

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`, err.stack ? { stack: err.stack } : undefined);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error(`Unhandled rejection: ${message}`, stack ? { stack } : undefined);
  });

  logger.info('Starting Roland MCP server…');
  const config = await loadConfig();
  const server = new McpServer(config);

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: string) => {
    if (shutdownPromise) return;
    logger.info(`Received ${signal} — shutting down gracefully`);
    shutdownPromise = server.stop().finally(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await server.start();
  logger.info('Waiting for MCP client on stdio…');
}

if (isMcpMainModule()) {
  runMcpServer().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(`Fatal MCP startup error: ${message}`, stack ? { stack } : undefined);
    process.exit(1);
  });
}
