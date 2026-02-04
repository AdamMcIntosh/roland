/**
 * Ecomode - Single-Agent Cheapest-Model Execution
 * 
 * MVP Implementation:
 * - Forces selection of cheapest available model
 * - Executes a single agent with minimal overhead
 * - Checks cache before execution
 * - Tracks and reports cost savings
 * - Simple progress indicator
 * 
 * Keyword: "eco:" or "ecomode:"
 * Example: "eco: refactor this function for performance"
 */

import { BaseMode, ModeConfig, ModeExecutionResult, AgentTaskOutput } from './base-mode.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { LLMClient } from '../orchestrator/llm-client.js';
import { logger } from '../utils/logger.js';
import { RoutingContext } from '../utils/types.js';
import { agentLoader } from '../agents/agent-loader.js';
import { skillRegistry } from '../skills/skill-framework.js';
import { loadConfig } from '../config/config-loader.js';
import ora from 'ora';

export interface EcomodeOptions {
  useCache?: boolean;
  showCost?: boolean;
  verbose?: boolean;
  agent?: string;
}

/**
 * Ecomode - Cost-optimized single-agent execution
 */
export class Ecomode extends BaseMode {
  constructor(
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    const config: ModeConfig = {
      name: 'Ecomode',
      description: 'Single-agent execution with cheapest model',
      agents: ['architect', 'researcher'], // Lead agents for routing
      leadAgent: 'architect',
      keyword: 'eco:',
      degradeTo: 'default',
    };
    super(config, modelRouter, costCalculator, cacheManager);
  }

  /**
   * Execute task in Ecomode (implements abstract method)
   * 
   * Flow:
   * 1. Check cache (skip execution if hit)
   * 2. Select cheapest model with fallback support
   * 3. Choose default agent if none specified
   * 4. Execute agent with cheapest model
   * 5. Track cost and cache result
   * 6. Report savings
   */
  async execute(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ModeExecutionResult> {
    const startTime = Date.now();
    const spinner = ora('Starting Ecomode...').start();

    try {
      // Step 1: Try cache
      const cachedResult = this.cacheManager.get(query);
      if (cachedResult) {
        spinner.succeed('✨ Cache hit! Saved execution time and cost.');
        
        const endTime = Date.now();
        const agentResult: AgentTaskOutput = {
          agentName: 'cached',
          result: cachedResult,
          cost: 0,
          duration: endTime - startTime,
          model: 'cached',
          cachedHit: true,
        };

        return {
          mode: 'ecomode',
          query,
          agentResults: [agentResult],
          synthesizedResult: cachedResult,
          totalCost: 0,
          totalDuration: endTime - startTime,
          startTime,
          endTime,
        };
      }

      spinner.text = 'Selecting cheapest model...';

      // Step 2: Select cheapest model
      const routingContext: RoutingContext = {
        queryLength: query.length,
        complexity: (complexity === 'explain' ? 'complex' : complexity) as 'simple' | 'medium' | 'complex',
      };

      const modelSelection = ModelRouter.selectCheapestModel(routingContext);
      if (!modelSelection) {
        throw new Error('No available models found');
      }

      spinner.text = `Using model: ${modelSelection.model}`;
      logger.debug(`Selected model: ${modelSelection.model} ($${modelSelection.costPer1kTokens?.toFixed(4)}/1K tokens)`);

      // Step 3: Validate API key
      const config = await loadConfig();
      const apiKeys = config?.samwise.api_keys as Record<string, string>;
      if (!apiKeys || !apiKeys[modelSelection.provider]) {
        throw new Error(
          `Missing API key for ${modelSelection.provider}. ` +
          `Set environment variable: SAMWISE_API_KEYS_${modelSelection.provider.toUpperCase()}`
        );
      }

      // Step 4: Choose agent
      const agentName = this.config.leadAgent || 'architect';
      spinner.text = `Loading agent: ${agentName}`;
      
      const agent = agentLoader.getAgent(agentName);
      if (!agent) {
        throw new Error(`Agent not found: ${agentName}`);
      }

      // Step 5: Execute agent
      spinner.text = `Executing ${agentName} with ${modelSelection.model}...`;

      const result = await this.executeAgentWithModel(
        query,
        agent,
        modelSelection.model
      );

      // Step 6: Estimate and track cost
      const inputTokens = Math.ceil(query.length / 4);
      const outputTokens = Math.ceil(result.length / 4);
      const estimatedCost = ModelRouter.estimateCost(
        modelSelection.model,
        inputTokens,
        outputTokens
      );

      this.costCalculator.recordCost(
        modelSelection.model,
        inputTokens,
        outputTokens,
        agentName
      );

      // Step 7: Calculate savings
      const standardCost = this.calculateStandardCost(inputTokens, outputTokens);
      const savings = standardCost - estimatedCost;

      // Step 8: Cache result
      this.cacheManager.set(query, result, modelSelection.model, estimatedCost);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Success message with cost savings
      const costMessage = `💰 Cost: $${estimatedCost.toFixed(4)} (saved $${Math.max(0, savings).toFixed(4)})`;
      
      spinner.succeed(`✅ Ecomode complete! ${costMessage}`);

      const agentResult: AgentTaskOutput = {
        agentName,
        result,
        cost: estimatedCost,
        duration,
        model: modelSelection.model,
        cachedHit: false,
      };

      return {
        mode: 'ecomode',
        query,
        agentResults: [agentResult],
        synthesizedResult: result,
        totalCost: estimatedCost,
        totalDuration: duration,
        startTime,
        endTime,
      };

    } catch (error) {
      spinner.fail(`❌ Ecomode failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Execute task in Ecomode with additional options
   * Optional method for CLI integration
   */
  async executeTask(
    query: string,
    options: EcomodeOptions = {}
  ): Promise<ModeExecutionResult> {
    const complexity = this.estimateComplexity(query) as 'simple' | 'medium' | 'complex' | 'explain';
    return this.execute(query, complexity);
  }

  /**
   * Execute agent with specified model using real LLM API
   */
  private async executeAgentWithModel(
    query: string,
    agent: any,
    model: string
  ): Promise<string> {
    // Try to detect and use relevant skill
    const skillName = this.detectSkillFromQuery(query);
    if (skillName && skillRegistry.hasSkill(skillName)) {
      try {
        const result = await skillRegistry.executeSkill(skillName, { code: query });
        if (result.success && result.data) {
          return JSON.stringify(result.data);
        }
      } catch (error) {
        logger.debug(`Skill execution failed: ${error}`);
      }
    }

    // Call real LLM API (no fallback - let errors propagate)
    const systemPrompt = agent.system_prompt || agent.role_prompt || `You are ${agent.name}. Provide helpful and accurate responses.`;
    
    const response = await LLMClient.call({
      model: model,
      prompt: query,
      systemPrompt: systemPrompt,
      temperature: 0.7,
      maxTokens: 2000,
    });

    return response.content;
  }

  /**
   * Detect skill from query keywords
   */
  private detectSkillFromQuery(query: string): string | null {
    const lower = query.toLowerCase();
    
    const skillKeywords: Record<string, string> = {
      'refactor|improve code|optimize': 'refactoring',
      'document|docs|docstring': 'documentation',
      'test|unit test|integration test': 'testing',
      'security|scan|vulnerability': 'security_scan',
      'performance|profile|optimize': 'performance',
    };

    for (const [keywords, skill] of Object.entries(skillKeywords)) {
      const pattern = new RegExp(keywords);
      if (pattern.test(lower)) {
        return skill;
      }
    }

    return null;
  }

  /**
   * Estimate task complexity from query
   */
  private estimateComplexity(query: string): 'simple' | 'medium' | 'complex' {
    // Simple heuristic based on query length and keywords
    const length = query.length;
    const lower = query.toLowerCase();

    // Complex indicators
    if (
      lower.includes('analyze') ||
      lower.includes('design') ||
      lower.includes('architecture') ||
      length > 500
    ) {
      return 'complex';
    }

    // Medium indicators
    if (
      lower.includes('refactor') ||
      lower.includes('implement') ||
      length > 200
    ) {
      return 'medium';
    }

    return 'simple';
  }

  /**
   * Calculate what cost would be with standard model
   * Used for displaying savings
   */
  private calculateStandardCost(inputTokens: number, outputTokens: number): number {
    // Standard model pricing (GPT-4 level)
    const standardInputPrice = 0.03 / 1000;
    const standardOutputPrice = 0.06 / 1000;
    return inputTokens * standardInputPrice + outputTokens * standardOutputPrice;
  }

  /**
   * Get progress indicator (progress bar representation)
   */
  getProgress(): string {
    const filled = '█';
    const empty = '░';
    const total = 20;
    const current = Math.floor(total * 0.5); // Placeholder
    return `${filled.repeat(current)}${empty.repeat(total - current)}`;
  }
}

/**
 * Create and return Ecomode instance
 */
export function createEcomode(
  modelRouter: ModelRouter,
  costCalculator: CostCalculator,
  cacheManager: CacheManager
): Ecomode {
  return new Ecomode(modelRouter, costCalculator, cacheManager);
}
