/**
 * ## P1 Honesty & Consolidation
 *
 * Cost routing, budget, analytics, and quality signal tools.
 */

import { McpToolError } from '../../utils/errors.js';
import { ComplexityClassifier, classifyWithSemantic } from '../../orchestrator/complexity-classifier.js';
import { ModelRouter } from '../../orchestrator/model-router.js';
import { BudgetManager } from '../../utils/budget-manager.js';
import type { McpToolContext, McpToolRegistrar } from './types.js';

export const OPENROUTER_MODELS: Record<string, string> = {
  simple: 'deepseek/deepseek-v3-0324',
  medium: 'qwen/qwen3-coder-next',
  complex: 'minimax/minimax-m2.5',
  explain: 'deepseek/deepseek-v3-0324',
};

export const FREE_MODELS = {
  primary: 'qwen/qwen3-coder:free',
  secondary: 'nvidia/nemotron-3-super-120b-a12b:free',
  coding: 'qwen/qwen3-coder:free',
  reasoning: 'nvidia/nemotron-3-super-120b-a12b:free',
  light: 'mistralai/mistral-small-3.1-24b-instruct:free',
  fallbacks: [
    'minimax/minimax-m2.5:free',
    'arcee-ai/trinity-large-preview:free',
    'z-ai/glm-4.5-air:free',
  ],
};

export const AGENT_OPENROUTER_MODELS: Record<string, string> = {
  architect: 'minimax/minimax-m2.5',
  'security-reviewer': 'minimax/minimax-m2.5',
  planner: 'minimax/minimax-m2.5',
  critic: 'minimax/minimax-m2.5',
  'code-reviewer': 'minimax/minimax-m2.5',
  executor: 'qwen/qwen3-coder-next',
  researcher: 'qwen/qwen3-coder-next',
  designer: 'qwen/qwen3-coder-next',
  'build-fixer': 'qwen/qwen3-coder-next',
  'tdd-guide': 'qwen/qwen3-coder-next',
  analyst: 'qwen/qwen3-coder-next',
  scientist: 'qwen/qwen3-coder-next',
  vision: 'qwen/qwen3-coder-next',
  'test-author': 'deepseek/deepseek-v3-0324',
  'test-executor': 'deepseek/deepseek-v3-0324',
  writer: 'deepseek/deepseek-v3-0324',
  explore: 'deepseek/deepseek-v3-0324',
};

const BUDGET_DEGRADATION_THRESHOLD = 0.8;

export function getBudgetDegradedModel(agentName?: string): string | null {
  const status = BudgetManager.getStatus();
  if (!status.enabled) return null;

  const usagePercent = status.maxBudget > 0
    ? status.currentSpending / status.maxBudget
    : 0;

  if (usagePercent < BUDGET_DEGRADATION_THRESHOLD) return null;

  if (agentName) {
    if (['architect', 'security-reviewer', 'planner', 'critic', 'code-reviewer'].includes(agentName)) {
      return FREE_MODELS.reasoning;
    }
    if (['executor', 'build-fixer', 'test-executor', 'tdd-guide', 'designer'].includes(agentName)) {
      return FREE_MODELS.coding;
    }
  }
  return FREE_MODELS.primary;
}

export function registerCostTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registerRouteModel(registrar, ctx);
  registerTrackCost(registrar, ctx);
  registerManageBudget(registrar);
  registerGetAnalytics(registrar, ctx);
  registerSuggestMode(registrar);
  registerQualitySignal(registrar, ctx);
}

function registerRouteModel(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'route_model',
    'Analyze query complexity and recommend the cheapest adequate model. Call this before making an LLM request to optimize cost.',
    async (args: Record<string, unknown>) => {
      const query = args.query as string;
      if (!query) throw new McpToolError('route_model', 'query is required');

      const budgetHint = (args.budget as string) || 'moderate';
      const analysis = await classifyWithSemantic(query, ctx.config);

      let routing;
      try {
        routing = ModelRouter.routeByComplexity(query);
      } catch {
        routing = null;
      }

      let recommendedModel = analysis.suggestedModel;
      if (budgetHint === 'minimal' && analysis.complexity !== 'simple') {
        recommendedModel = 'claude-haiku-4-5';
      } else if (budgetHint === 'unlimited' && analysis.complexity === 'simple') {
        recommendedModel = 'claude-sonnet-4-6';
      }

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

      const estimatedCost = ModelRouter.estimateCost(
        recommendedModel,
        analysis.tokenEstimate,
        analysis.tokenEstimate * 2,
      );

      let openrouterModel = OPENROUTER_MODELS[analysis.complexity] || 'google/gemini-2.5-flash';
      const degradedModel = getBudgetDegradedModel();
      const budgetDegraded = degradedModel !== null;
      if (budgetDegraded) openrouterModel = degradedModel;

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
        query: { type: 'string', description: 'The query or task description to analyze for complexity' },
        budget: { type: 'string', enum: ['minimal', 'moderate', 'unlimited'], description: 'Budget preference (default: moderate)' },
      },
      required: ['query'],
    },
  );
}

function registerTrackCost(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'track_cost',
    'Log token usage from an LLM call and return session totals with budget status. Call this after each LLM interaction to track spending.',
    async (args: Record<string, unknown>) => {
      const model = args.model as string;
      const inputTokens = (args.input_tokens as number) || 0;
      const outputTokens = (args.output_tokens as number) || 0;
      const agent = (args.agent as string) || 'unknown';
      const task = (args.task as string) || 'unnamed';

      if (!model) throw new McpToolError('track_cost', 'model is required');

      let cost: number;
      try {
        cost = ModelRouter.estimateCost(model, inputTokens, outputTokens);
      } catch {
        cost = 0;
      }

      ctx.costTracker.recordCost(model, 'ide', agent, inputTokens, outputTokens, cost, {
        query: task,
        cached: false,
      });
      BudgetManager.recordSpending(cost);

      const summary = ctx.costTracker.getSummary();
      const budgetStatus = BudgetManager.getStatus();

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
        recorded: { model, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost, agent, task },
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
        model: { type: 'string', description: 'The model that was used' },
        input_tokens: { type: 'number', description: 'Number of input tokens consumed' },
        output_tokens: { type: 'number', description: 'Number of output tokens generated' },
        agent: { type: 'string', description: 'Name of the agent that made the call' },
        task: { type: 'string', description: 'Brief description of the task for cost attribution' },
      },
      required: ['model'],
    },
  );
}

function registerManageBudget(registrar: McpToolRegistrar): void {
  registrar.registerTool(
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
          return { action: 'set_limit', new_limit: limit, message: `Budget limit set to $${limit.toFixed(2)}` };
        }
        case 'reset': {
          BudgetManager.reset();
          const status = BudgetManager.getStatus();
          return { action: 'reset', max_budget: status.maxBudget, current_spending: 0, message: 'Budget spending reset to $0.00' };
        }
        case 'enable': {
          const maxBudget = args.daily_limit as number | undefined;
          BudgetManager.enable(maxBudget);
          return { action: 'enable', max_budget: BudgetManager.getStatus().maxBudget, message: 'Budget enforcement enabled' };
        }
        case 'disable': {
          BudgetManager.disable();
          return { action: 'disable', message: 'Budget enforcement disabled' };
        }
        default:
          throw new McpToolError('manage_budget', `Unknown action: ${action}. Use: get_status, set_limit, reset, enable, disable`);
      }
    },
    {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get_status', 'set_limit', 'reset', 'enable', 'disable'], description: 'Action to perform (default: get_status)' },
        daily_limit: { type: 'number', description: 'Budget limit in USD (required for set_limit, optional for enable)' },
      },
      required: [],
    },
  );
}

function registerGetAnalytics(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'get_analytics',
    'Get cost and token usage analytics for the current session, grouped by model, agent, or provider.',
    async (args: Record<string, unknown>) => {
      const groupBy = (args.group_by as string) || 'summary';
      const summary = ctx.costTracker.getSummary();
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
          result.breakdown = ctx.costTracker.getModelBreakdown().map(m => ({
            model: m.model, cost: m.cost, percentage: `${m.percentage.toFixed(1)}%`,
          }));
          break;
        case 'agent':
          result.breakdown = ctx.costTracker.getAgentBreakdown().map(a => ({
            agent: a.agent, cost: a.cost, percentage: `${a.percentage.toFixed(1)}%`,
          }));
          break;
        case 'provider':
          result.breakdown = ctx.costTracker.getProviderBreakdown().map(p => ({
            provider: p.provider, cost: p.cost, percentage: `${p.percentage.toFixed(1)}%`,
          }));
          break;
        default:
          result.by_model = summary.modelCosts;
          result.by_agent = summary.agentCosts;
          result.by_provider = summary.providerCosts;
      }

      const budgetStatus = BudgetManager.getStatus();
      if (budgetStatus.enabled) {
        result.budget = {
          limit: budgetStatus.maxBudget,
          spent: budgetStatus.currentSpending,
          remaining: Math.max(0, budgetStatus.maxBudget - budgetStatus.currentSpending),
          usage_percent: `${((budgetStatus.currentSpending / budgetStatus.maxBudget) * 100).toFixed(1)}%`,
        };
      }

      const expensive = ctx.costTracker.getMostExpensiveQueries(3);
      if (expensive.length > 0) {
        result.most_expensive = expensive.map(r => ({
          model: r.model, agent: r.agent, cost: r.cost, tokens: r.inputTokens + r.outputTokens,
        }));
      }

      const allQuality = ctx.qualityTracker.getModelQuality() as import('../../orchestrator/quality-tracker.js').ModelQuality[];
      let qualityRecommendation: string | null = null;
      const worstModel = allQuality.filter(q => q.total_tasks > 10).sort((a, b) => a.accept_rate - b.accept_rate)[0];

      if (worstModel) {
        for (const tier of worstModel.worst_task_types) {
          const recs = ctx.qualityTracker.getRecommendation(tier);
          const best = recs[0];
          if (best && best.model !== worstModel.model && best.score - worstModel.accept_rate > 0.2) {
            qualityRecommendation = `Consider switching ${tier} tasks from ${worstModel.model} to ${best.model} (accept rate: ${(worstModel.accept_rate * 100).toFixed(0)}% → ${(best.score * 100).toFixed(0)}%)`;
            break;
          }
        }
      }

      result.quality = { models: allQuality, recommendation: qualityRecommendation };
      return result;
    },
    {
      type: 'object',
      properties: {
        group_by: { type: 'string', enum: ['summary', 'model', 'agent', 'provider'], description: 'How to group the analytics breakdown (default: summary)' },
      },
      required: [],
    },
  );
}

function registerSuggestMode(registrar: McpToolRegistrar): void {
  registrar.registerTool(
    'suggest_mode',
    'Analyze a task and suggest the appropriate depth level (quick/standard/deep) with recommended agent chain. Use this to decide how much effort to invest in a task.',
    async (args: Record<string, unknown>) => {
      const query = args.query as string;
      if (!query) throw new McpToolError('suggest_mode', 'query is required');

      const analysis = ComplexityClassifier.getDetailedAnalysis(query);
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
        query: { type: 'string', description: 'The task or query to analyze for appropriate depth level' },
      },
      required: ['query'],
    },
  );
}

function registerQualitySignal(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'quality_signal',
    'Record quality feedback for a model response. Call after each agent response with accept/retry/reject/manual_fix to help Roland learn which models work best for your codebase.',
    async (args: Record<string, unknown>) => {
      const model = args.model as string;
      const signal = args.signal as 'accept' | 'retry' | 'reject' | 'manual_fix';

      if (!model) throw new McpToolError('quality_signal', 'model is required');
      if (!signal || !['accept', 'retry', 'reject', 'manual_fix'].includes(signal)) {
        throw new McpToolError('quality_signal', 'signal must be one of: accept, retry, reject, manual_fix');
      }

      const provider = (args.provider as string) || 'openrouter';
      const task_type = (args.task_type as string) || 'unknown';
      const complexity_tier = (args.complexity_tier as string) || 'unknown';
      const retry_model = args.retry_model as string | undefined;

      await ctx.qualityTracker.recordSignal(model, provider, task_type, complexity_tier, signal, retry_model);
      const quality = ctx.qualityTracker.getModelQuality(model);
      return { recorded: true, model, signal, quality };
    },
    {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'The model that generated the response' },
        signal: { type: 'string', enum: ['accept', 'retry', 'reject', 'manual_fix'], description: 'Quality signal for the response' },
        provider: { type: 'string', description: 'Provider for the model (default: openrouter)' },
        task_type: { type: 'string', description: 'Complexity tier or task category' },
        complexity_tier: { type: 'string', description: 'Complexity tier: local, simple, medium, complex' },
        retry_model: { type: 'string', description: 'If signal is retry, which model was used instead' },
      },
      required: ['model', 'signal'],
    },
  );
}
