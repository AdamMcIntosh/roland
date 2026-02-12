/**
 * MCP Server Implementation (v2)
 *
 * Samwise MCP Server — exposes cost routing, analytics, budget management,
 * and recipe execution as MCP tools for IDE agents (VS Code, Cursor, etc.).
 *
 * Tools provided:
 *   health_check    — server status
 *   route_model     — complexity-based model recommendation
 *   track_cost      — log token usage and return session totals
 *   manage_budget   — get/set/reset spending limits
 *   get_analytics   — session cost & token breakdowns
 *   suggest_mode    — advisory: quick vs. standard vs. deep
 *   list_recipes    — available workflow recipes
 *   start_recipe    — begin a recipe session, return first step prompt
 *   advance_recipe  — submit step output, get next step or summary
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
import { ComplexityClassifier } from '../orchestrator/complexity-classifier.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { AdvancedCostTracker, getGlobalTracker } from '../orchestrator/advanced-cost-tracker.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { RecipeSessionManager, ParsedRecipe, SubagentDef, RecipeStepDef } from './recipe-session.js';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

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
  private recipesDir: string;

  constructor(config: AppConfig) {
    this.config = config;
    this.tools = new Map();
    this.toolDefinitions = new Map();

    // Recipes directory
    this.recipesDir = path.join(process.cwd(), 'recipes');

    // Initialize cost tracker
    this.costTracker = getGlobalTracker();

    // Initialize recipe session manager (for IDE-driven recipe execution)
    this.recipeSessionManager = new RecipeSessionManager();

    // Initialize budget manager
    BudgetManager.initialize();

    this.registerTools();

    // Initialize MCP server with stdio transport
    this.server = new Server(
      {
        name: 'samwise',
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
    this.registerRouteModel();
    this.registerTrackCost();
    this.registerManageBudget();
    this.registerGetAnalytics();
    this.registerSuggestMode();
    this.registerListRecipes();
    this.registerStartRecipe();
    this.registerAdvanceRecipe();
  }

  // --------------------------------------------------------------------------
  // health_check
  // --------------------------------------------------------------------------
  private registerHealthCheck(): void {
    this.registerTool(
      'health_check',
      'Check the health status of the Samwise MCP server',
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
          recommendedModel = 'meta-llama/llama-3.2-3b-instruct:free';
        } else if (budgetHint === 'unlimited' && analysis.complexity === 'simple') {
          // Allow upgrading simple queries for higher quality
          recommendedModel = 'nousresearch/hermes-3-llama-3.1-405b:free';
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

        return {
          recommended_model: recommendedModel,
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
        this.costTracker.recordCost(model, 'openrouter', agent, inputTokens, outputTokens, cost, {
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
      'Start a multi-agent recipe session. Returns the first step\'s system prompt and user prompt for you to execute. Then call advance_recipe with your output to get the next step. Available recipes: BugFix, RESTfulAPI, SecurityAudit, WebAppFullStack, MicroservicesArchitecture, PlanExecRevEx, DocumentationRefactor.',
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

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async start(): Promise<void> {
    try {
      logger.info('🚀 Starting Samwise MCP Server v2...');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.success('✅ MCP Server connected and ready');
      logger.info(`📦 Tools: ${this.getTools().join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpServerError(`Failed to start MCP server: ${message}`);
    }
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
}
