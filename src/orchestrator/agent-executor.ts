/**
 * Agent Executor - Single-Agent Execution for Ecomode MVP
 * 
 * MVP Version: Simple single-agent execution without orchestration
 * Executes a task using a single agent with the cheapest model
 */

import { ModelRouter } from './model-router.js';
import { CostCalculator, costCalculator } from './cost-calculator.js';
import { CacheManager, cacheManager } from './cache-manager.js';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../config/config-loader.js';
import { RoutingContext } from '../utils/types.js';
import { agentLoader } from '../agents/agent-loader.js';
import { skillRegistry } from '../skills/skill-framework.js';

export interface ExecutionRequest {
  query: string;
  complexity?: 'simple' | 'medium' | 'explain' | 'complex';
  agentName?: string;
  useCache?: boolean;
  mode?: 'ecomode' | 'autopilot' | 'ultrapilot' | 'swarm' | 'pipeline';
  skipCache?: boolean;
}

export interface ExecutionResult {
  query: string;
  result: string;
  model: string;
  cost: number;
  cachedHit: boolean;
  duration: number;
}

export class AgentExecutor {
  private startTime: number = 0;

  /**
   * Execute the agent with routing to appropriate mode
   * Supports: ecomode, autopilot, ultrapilot, swarm, pipeline
   * 
   * @param request - Execution request
   * @returns Execution result
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.startTime = Date.now();

    const {
      query,
      complexity = 'simple',
      agentName = 'default',
      useCache = true,
      mode = 'ecomode',
      skipCache = false,
    } = request;

    // Route to appropriate mode
    const normalizedMode = (mode || 'ecomode').toLowerCase();
    
    if (normalizedMode === 'ecomode' || normalizedMode === 'default') {
      return this.executeEcomode(query, complexity as any, agentName, useCache && !skipCache);
    } else if (normalizedMode === 'autopilot') {
      return this.executeAutopilot(query, complexity as any);
    } else if (normalizedMode === 'ultrapilot') {
      return this.executeUltrapilot(query, complexity as any);
    } else if (normalizedMode === 'swarm') {
      return this.executeSwarm(query, complexity as any);
    } else if (normalizedMode === 'pipeline') {
      return this.executePipeline(query, complexity as any);
    } else {
      throw new Error(`Unknown execution mode: ${normalizedMode}`);
    }
  }

  /**
   * Execute in Ecomode (cheapest single-agent execution)
   * MVP: Uses cheapest model, checks cache first, tracks cost
   */
  private async executeEcomode(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain',
    agentName: string,
    useCache: boolean
  ): Promise<ExecutionResult> {
    logger.info(`[Ecomode] Executing: "${query.substring(0, 50)}..."`);

    // Step 1: Try cache
    if (useCache) {
      const cachedResult = cacheManager.get(query);
      if (cachedResult) {
        logger.info(`[Cache] Hit! Returning cached result`);
        const duration = Date.now() - this.startTime;
        return {
          query,
          result: cachedResult,
          model: 'cached',
          cost: 0,
          cachedHit: true,
          duration,
        };
      }
    }

    // Step 2: Select cheapest model with fallback
    const routingContext: RoutingContext = { 
      queryLength: query.length, 
      complexity: (complexity as 'simple' | 'medium' | 'complex') || 'simple'
    };

    const { selected: modelSelection, fallbacks } = ModelRouter.selectModelWithFallback(
      routingContext,
      { requireApiKey: true }
    );
    logger.info(`[Router] Selected: ${modelSelection.model}`);
    if (fallbacks.length > 0) {
      logger.debug(`[Router] Fallbacks: ${fallbacks.map(f => f.model).join(', ')}`);
    }

    // Step 3: Validate API key
    const config = await loadConfig();
    if (!config || !config.goose.api_keys[modelSelection.provider]) {
      throw new Error(
        `Missing API key for ${modelSelection.provider}. ` +
        `Set SAMWISE_API_KEYS_${modelSelection.provider.toUpperCase()} environment variable`
      );
    }

    // Step 4: Call the model (mock for MVP - would call actual API)
    const result = await this.callModel(
      query,
      modelSelection.model,
      agentName
    );

    // Step 5: Estimate cost (using mock token counts)
    const inputTokens = Math.ceil(query.length / 4); // Rough estimate
    const outputTokens = Math.ceil(result.length / 4);
    const cost = ModelRouter.estimateCost(
      modelSelection.model,
      inputTokens,
      outputTokens
    );

    // Step 6: Track cost
    costCalculator.recordCost(
      modelSelection.model,
      inputTokens,
      outputTokens,
      agentName
    );

    // Step 7: Cache result
    if (useCache) {
      cacheManager.set(query, result, modelSelection.model, cost);
    }

    const duration = Date.now() - this.startTime;

    return {
      query,
      result,
      model: modelSelection.model,
      cost,
      cachedHit: false,
      duration,
    };
  }

  /**
   * Call the actual model (mock implementation for MVP)
   * In Phase 3, this will integrate with actual Goose/MCP calls
   * 
   * @param query - Query/prompt
   * @param model - Model name
   * @param agentName - Agent name for context
   * @returns Model response
   */
  private async callModel(
    query: string,
    model: string,
    agentName: string
  ): Promise<string> {
    // MVP: Mock response based on agent type and skills
    logger.debug(
      `Calling ${model} with agent: ${agentName}`
    );

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Try to use skills if available
    const skillName = this.detectSkill(query);
    if (skillName && skillRegistry.hasSkill(skillName)) {
      logger.info(`Using skill: ${skillName}`);
      try {
        const result = await skillRegistry.executeSkill(skillName, { code: query });
        if (result.success && result.data) {
          return this.formatSkillResult(skillName, result.data);
        }
      } catch (error) {
        logger.warn(`Skill execution failed: ${error}`);
      }
    }

    // Fallback to agent-based mock response
    return this.generateAgentResponse(query, agentName);
  }

  /**
   * Detect which skill to use based on query
   */
  private detectSkill(query: string): string | null {
    const lower = query.toLowerCase();
    if (lower.includes('refactor') || lower.includes('improve')) {
      return 'refactoring';
    }
    if (lower.includes('document') || lower.includes('doc')) {
      return 'documentation';
    }
    if (lower.includes('test') || lower.includes('unit test')) {
      return 'testing';
    }
    return null;
  }

  /**
   * Format skill result for display
   */
  private formatSkillResult(skillName: string, data: any): string {
    let result = `\n✨ ${skillName.toUpperCase()} SKILL\n`;
    result += '='.repeat(50) + '\n\n';

    if (skillName === 'refactoring' && data.refactored) {
      result += `IMPROVEMENTS:\n`;
      (data.improvements as string[]).forEach((imp) => {
        result += `  • ${imp}\n`;
      });
      result += `\nREFACTORED CODE:\n${data.refactored}\n`;
    } else if (skillName === 'documentation' && data.documentation) {
      result += `${data.documentation}\n`;
    } else if (skillName === 'testing' && data.tests) {
      result += `TEST CASES (${data.testCases} tests):\n${data.tests}\n`;
    }

    return result;
  }

  /**
   * Generate agent-based response (fallback)
   */
  private generateAgentResponse(query: string, agentName: string): string {
    // Load agent if not already loaded
    if (agentLoader.count() === 0) {
      return this.mockGenericResponse(query);
    }

    const agent = agentLoader.getAgent(agentName);
    if (agent) {
      return `Agent: ${agent.name}\nRole: ${agent.role_prompt}\n\nResponse to: "${query}"\n\nThis is a mock response for MVP testing.`;
    }

    return this.mockGenericResponse(query);
  }

  /**
   * Mock refactoring response
   */
  private mockRefactorResponse(query: string): string {
    return `
// Refactored code based on: "${query}"
// 
// Key improvements:
// - Simplified logic flow
// - Better variable naming
// - Added error handling
// - Performance optimizations
// - Added comments for clarity

function optimizedFunction(input: any) {
  // Implementation here
  return processInput(input);
}
    `.trim();
  }

  /**
   * Mock documentation response
   */
  private mockDocResponse(query: string): string {
    return `
## Documentation

### Overview
${query}

### Parameters
- None specified

### Returns
The processed result

### Example Usage
\`\`\`
const result = process();
\`\`\`

### Notes
- Consider edge cases
- Add error handling
- Keep documentation updated
    `.trim();
  }

  /**
   * Mock test response
   */
  private mockTestResponse(query: string): string {
    return `
describe('Tests for: ${query}', () => {
  beforeEach(() => {
    // Setup
  });

  it('should handle basic case', () => {
    const input = { /* test data */ };
    const result = process(input);
    expect(result).toBeDefined();
  });

  it('should handle edge cases', () => {
    const input = null;
    expect(() => process(input)).toThrow();
  });

  afterEach(() => {
    // Cleanup
  });
});
    `.trim();
  }

  /**
   * Mock generic response
   */
  private mockGenericResponse(query: string): string {
    return `
Response to: "${query}"

This is a mock response for MVP testing. In Phase 3, this will be replaced 
with actual LLM API calls through Goose MCP integration.

Key points:
1. Models selected by cost optimization (Ecomode)
2. Results cached for repeated queries
3. Cost tracking for budget monitoring
4. Agent-specific behaviors applied

Expected behavior confirmed.
    `.trim();
  }

  /**
   * Execute in Autopilot mode (lead + 2 subagents)
   * Phase 7: Fully implemented
   */
  private async executeAutopilot(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ExecutionResult> {
    logger.info(`[Autopilot] Starting mode execution`);

    try {
      const { AutopilotMode } = await import('../modes/autopilot-mode.js');
      const autopilotMode = new AutopilotMode(
        new ModelRouter(),
        costCalculator,
        cacheManager
      );

      const modeResult = await autopilotMode.execute(query, complexity);

      const duration = Date.now() - this.startTime;

      return {
        query,
        result: modeResult.synthesizedResult,
        model: 'autopilot (multi-agent)',
        cost: modeResult.totalCost,
        cachedHit: false,
        duration,
        modeDetails: {
          mode: 'autopilot',
          agents: modeResult.agentResults.map((r) => r.agentName),
          totalCost: modeResult.totalCost,
        }
      } as any;
    } catch (error) {
      logger.error('[Autopilot] Mode execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute in Ultrapilot mode (5 parallel agents)
   * Phase 7: 5 agents work in parallel
   */
  private async executeUltrapilot(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ExecutionResult> {
    logger.info(`[Ultrapilot] Starting mode execution`);

    try {
      const { UltrapilotMode } = await import('../modes/ultrapilot-mode.js');
      const ultrapilotMode = new UltrapilotMode(
        new ModelRouter(),
        costCalculator,
        cacheManager
      );

      const modeResult = await ultrapilotMode.execute(query, complexity);

      const duration = Date.now() - this.startTime;

      return {
        query,
        result: modeResult.synthesizedResult,
        model: 'ultrapilot (5 parallel agents)',
        cost: modeResult.totalCost,
        cachedHit: false,
        duration,
        modeDetails: {
          mode: 'ultrapilot',
          agents: modeResult.agentResults.map((r) => r.agentName),
          totalCost: modeResult.totalCost,
        }
      } as any;
    } catch (error) {
      logger.error('[Ultrapilot] Mode execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute in Swarm mode (8 dynamic agents with shared memory)
   * Phase 7: 8 agents work in parallel with shared memory
   */
  private async executeSwarm(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ExecutionResult> {
    logger.info(`[Swarm] Starting mode execution`);

    try {
      const { SwarmMode } = await import('../modes/swarm-mode.js');
      const swarmMode = new SwarmMode(
        new ModelRouter(),
        costCalculator,
        cacheManager
      );

      const modeResult = await swarmMode.execute(query, complexity);

      const duration = Date.now() - this.startTime;

      return {
        query,
        result: modeResult.synthesizedResult,
        model: 'swarm (8 agents with shared memory)',
        cost: modeResult.totalCost,
        cachedHit: false,
        duration,
        modeDetails: {
          mode: 'swarm',
          agents: modeResult.agentResults.map((r) => r.agentName),
          totalCost: modeResult.totalCost,
        }
      } as any;
    } catch (error) {
      logger.error('[Swarm] Mode execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute in Pipeline mode (4-step sequential processing)
   * Phase 7: Each step feeds output as context into next step
   */
  private async executePipeline(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ExecutionResult> {
    logger.info(`[Pipeline] Starting mode execution`);

    try {
      const { PipelineMode } = await import('../modes/pipeline-mode.js');
      const pipelineMode = new PipelineMode(
        new ModelRouter(),
        costCalculator,
        cacheManager
      );

      const modeResult = await pipelineMode.execute(query, complexity);

      const duration = Date.now() - this.startTime;

      return {
        query,
        result: modeResult.synthesizedResult,
        model: 'pipeline (4-step sequential)',
        cost: modeResult.totalCost,
        cachedHit: false,
        duration,
        modeDetails: {
          mode: 'pipeline',
          agents: modeResult.agentResults.map((r) => r.agentName),
          totalCost: modeResult.totalCost,
        }
      } as any;
    } catch (error) {
      logger.error('[Pipeline] Mode execution failed:', error);
      throw error;
    }
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return {
      costs: costCalculator.getSessionSummary(),
      cache: cacheManager.getStats(),
    };
  }

  /**
   * Generate execution report
   */
  generateReport(): string {
    const costReport = costCalculator.generateReport(
      'grok-4-1-fast-reasoning',
      'gpt-4o'
    );
    const cacheReport = cacheManager.generateReport();

    return costReport + cacheReport;
  }

  /**
   * Reset executor state (for new session)
   */
  reset(): void {
    costCalculator.reset();
    cacheManager.clear();
    this.startTime = 0;
  }
}

// Export singleton instance
export const agentExecutor = new AgentExecutor();
