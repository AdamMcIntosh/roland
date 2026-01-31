/**
 * Base Mode Class - Foundation for all execution modes
 * 
 * Modes define how multiple agents coordinate and execute tasks
 */

import { logger } from '../utils/logger.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { LLMClient, LLMResponse } from '../orchestrator/llm-client.js';
import { agentLoader, LoadedAgentConfig } from '../agents/agent-loader.js';
import { ApiError } from '../utils/errors.js';
import { PerformanceMonitor } from '../utils/performance-monitor.js';

export interface ModeConfig {
  name: string;
  description: string;
  agents: string[];
  leadAgent?: string;
  keyword: string;
  degradeTo?: string; // Fallback mode on critical failure
}

export interface AgentTaskInput {
  originalQuery: string;
  specialization?: string;
  context?: Record<string, unknown>;
}

export interface AgentTaskOutput {
  agentName: string;
  result: string;
  cost: number;
  duration: number;
  model: string;
  cachedHit: boolean;
}

export interface ModeExecutionResult {
  mode: string;
  query: string;
  agentResults: AgentTaskOutput[];
  synthesizedResult: string;
  totalCost: number;
  totalDuration: number;
  startTime: number;
  endTime: number;
}

/**
 * Base class for all execution modes
 */
export abstract class BaseMode {
  protected config: ModeConfig;
  protected modelRouter: ModelRouter;
  protected costCalculator: CostCalculator;
  protected cacheManager: CacheManager;

  constructor(
    config: ModeConfig,
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    this.config = config;
    this.modelRouter = modelRouter;
    this.costCalculator = costCalculator;
    this.cacheManager = cacheManager;
  }

  /**
   * Get mode configuration
   */
  getConfig(): ModeConfig {
    return this.config;
  }

  /**
   * Specialize query based on agent's role/specialization
   * Override in subclasses for custom behavior
   */
  protected specializeQueryForAgent(
    originalQuery: string,
    agent: LoadedAgentConfig,
    context?: Record<string, unknown>
  ): AgentTaskInput {
    // Default: Add agent context to query
    const specialization = `[${agent.name}] `;
    
    return {
      originalQuery,
      specialization: specialization + agent.role_prompt,
      context
    };
  }

  /**
   * Format task input for API execution
   */
  protected formatTaskInput(taskInput: AgentTaskInput): string {
    return `${taskInput.specialization}\n\nTask: ${taskInput.originalQuery}`;
  }

  /**
   * Execute task with actual LLM API call
   * @param agent Agent configuration
   * @param taskInput Task input for the agent
   * @param complexity Query complexity for model selection
   * @returns Agent execution result with real API call
   */
  protected async executeTaskWithAPI(
    agent: LoadedAgentConfig,
    taskInput: AgentTaskInput,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<AgentTaskOutput> {
    const startTime = Date.now();

    // Normalize complexity
    const normalizedComplexity: 'simple' | 'medium' | 'complex' =
      complexity === 'explain' ? 'complex' : complexity;

    // Enhanced cache key with metadata
    const cacheMetadata = {
      mode: this.config.name,
      agent: agent.name,
      complexity: normalizedComplexity,
    };

    // Check cache first with metadata
    const cachedResult = this.cacheManager.get(taskInput.originalQuery, cacheMetadata);
    if (cachedResult) {
      logger.debug(`[Cache HIT] ${agent.name} in ${this.config.name} mode`);
      return {
        agentName: agent.name,
        result: cachedResult,
        cost: 0, // Cached results have no cost
        duration: Date.now() - startTime,
        model: 'cached',
        cachedHit: true,
      };
    }

    try {
      // Normalize complexity for routing (explain maps to complex)
      const routingComplexity: 'simple' | 'medium' | 'complex' =
        complexity === 'explain' ? 'complex' : complexity;

      // Select model based on complexity
      const modelSelection = ModelRouter.selectCheapestModel({
        queryLength: taskInput.originalQuery.length,
        complexity: routingComplexity,
      });

      // Get fallback models from the same complexity tier
      const fallbackModels = ModelRouter.getModelsForComplexity(routingComplexity).slice(1, 3);

      // Format the full prompt
      const systemPrompt = agent.system_prompt || agent.role_prompt;
      const prompt = this.formatTaskInput(taskInput);

      logger.debug(
        `[API CALL] Agent: ${agent.name}, Model: ${modelSelection.model}, Complexity: ${complexity}`
      );

      // Make actual API call with fallbacks
      const llmResponse = await LLMClient.call({
        model: modelSelection.model,
        prompt,
        systemPrompt,
        temperature: complexity === 'simple' ? 0.5 : complexity === 'complex' ? 0.8 : 0.7,
        maxTokens: complexity === 'simple' ? 500 : complexity === 'explain' ? 3000 : 2000,
        fallbackModels,
      });

      // Record cost
      this.costCalculator.recordCost(
        modelSelection.model,
        llmResponse.inputTokens,
        llmResponse.outputTokens,
        `${this.config.name}-${agent.name}`
      );

      // Estimate cost for caching
      const estimatedCost = (modelSelection.costPer1kTokens / 1000) * llmResponse.totalTokens;
      const duration = Date.now() - startTime;

      // Record performance metrics
      const provider = modelSelection.model.includes('grok') ? 'xai' :
                       modelSelection.model.includes('claude') ? 'anthropic' :
                       modelSelection.model.includes('gpt') ? 'openai' :
                       modelSelection.model.includes('gemini') ? 'google' : 'unknown';
      
      PerformanceMonitor.record(
        agent.name,
        this.config.name,
        provider,
        duration,
        llmResponse.totalTokens,
        estimatedCost,
        true // success
      );

      // Cache the result with metadata
      this.cacheManager.set(
        taskInput.originalQuery,
        llmResponse.content,
        modelSelection.model,
        estimatedCost,
        cacheMetadata
      );

      return {
        agentName: agent.name,
        result: llmResponse.content,
        cost: estimatedCost,
        duration: duration,
        model: modelSelection.model,
        cachedHit: false,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const provider = 'unknown';
      
      // Record failed performance metrics
      PerformanceMonitor.record(
        agent.name,
        this.config.name,
        provider,
        duration,
        0,
        0,
        false // failure
      );
      
      logger.error(`[API ERROR] ${agent.name}: ${error}`);
      throw error; // Propagate error - no simulation fallback
    }
  }

  /**
   * Synthesize results from multiple agents
   * Override in subclasses for custom synthesis
   */
  protected synthesizeResults(results: AgentTaskOutput[]): string {
    logger.debug(`Synthesizing results from ${results.length} agents`);

    if (results.length === 0) {
      return 'No results from agents';
    }

    if (results.length === 1) {
      return results[0].result;
    }

    // Default synthesis: concatenate with headers
    const synthesis = results
      .map(
        (result) =>
          `## ${result.agentName}\n${result.result}\n\nCost: $${result.cost.toFixed(6)} | Model: ${result.model}`
      )
      .join('\n\n---\n\n');

    return synthesis;
  }

  /**
   * Execute the mode - abstract method for subclasses
   */
  abstract execute(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ModeExecutionResult>;
}
