/**
 * Ask Mode - General Conversational Assistant
 * 
 * Simple single-agent mode for general questions, Q&A, and conversations
 * Uses the most capable available model for thoughtful responses
 * No complex orchestration - just answer the question
 * 
 * Keyword: "ask:" or "ask"
 * Example: "ask: what is machine learning?"
 */

import { BaseMode, ModeConfig, ModeExecutionResult, AgentTaskOutput } from './base-mode.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { LLMClient } from '../orchestrator/llm-client.js';
import { logger } from '../utils/logger.js';

const ASK_CONFIG: ModeConfig = {
  name: 'Ask',
  description: 'General conversational assistant for Q&A',
  agents: ['analyst'],
  leadAgent: 'analyst',
  keyword: 'ask:',
  degradeTo: 'eco',
};

export class AskMode extends BaseMode {
  constructor(
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    super(ASK_CONFIG, modelRouter, costCalculator, cacheManager);
  }

  /**
   * Execute a conversational Q&A
   * 
   * Flow:
   * 1. Check cache
   * 2. Route to best available model for conversational quality
   * 3. Return direct answer without synthesis
   */
  async execute(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ModeExecutionResult> {
    const startTime = Date.now();
    logger.info(`[Ask] Answering question: "${query.substring(0, 60)}..."`);

    try {
      // Try cache first
      const cacheKey = `ask:${this.generateCacheKey(query)}`;
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        logger.debug('[Ask] Cache hit');
        const endTime = Date.now();
        const result: AgentTaskOutput = {
          agentName: 'cached',
          result: cached,
          cost: 0,
          duration: endTime - startTime,
          model: 'cached',
          cachedHit: true,
        };

        return {
          mode: 'ask',
          query,
          agentResults: [result],
          synthesizedResult: cached,
          totalCost: 0,
          totalDuration: endTime - startTime,
          startTime,
          endTime,
        };
      }

      // Select the best model for conversational quality
      // For ask mode, use complex routing for best model
      const modelSelection = ModelRouter.selectCheapestModel({
        queryLength: query.length,
        complexity: 'complex', // Use best available model for conversational quality
      });

      logger.debug(`[Ask] Using model: ${modelSelection.model}`);

      // Create conversational prompt
      const systemPrompt = `You are a helpful, knowledgeable assistant. Answer questions clearly and concisely. 
If the question is complex, break down your answer into logical parts.
If you need more context, ask for clarification.
Be friendly and engaging in your responses.`;

      // Execute the query
      const response = await LLMClient.call({
        model: modelSelection.model,
        prompt: query,
        systemPrompt,
        temperature: 0.7, // Slightly creative for conversational tone
        maxTokens: 2000,
      });

      const result = response.content;
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Calculate cost
      const cost = this.costCalculator.recordCost(
        modelSelection.model,
        response.inputTokens,
        response.outputTokens,
        'ask'
      );

      // Cache the result with full metadata
      this.cacheManager.set(
        cacheKey,
        result,
        modelSelection.model,
        cost,
        {
          agent: 'analyst',
          mode: 'ask',
          complexity: complexity === 'explain' ? 'complex' : complexity,
        }
      );

      const agentResult: AgentTaskOutput = {
        agentName: 'analyst',
        result,
        cost,
        duration,
        model: modelSelection.model,
        cachedHit: false,
      };

      logger.info(
        `[Ask] Completed in ${duration}ms, Cost: $${cost.toFixed(6)}`
      );

      return {
        mode: 'ask',
        query,
        agentResults: [agentResult],
        synthesizedResult: result,
        totalCost: cost,
        totalDuration: duration,
        startTime,
        endTime,
      };
    } catch (error) {
      logger.error('[Ask] Execution failed:', error);
      throw new Error(
        `Ask mode execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Generate a simple cache key from query
   */
  private generateCacheKey(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `query_${Math.abs(hash).toString(16)}`;
  }
}
