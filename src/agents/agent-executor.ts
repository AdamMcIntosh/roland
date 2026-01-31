/**
 * Agent Executor
 * Executes agents and manages their outputs
 */

import { Agent, AgentExecutionContext, AgentExecutionResult } from './types';
import { logger } from '../utils/logger';

export class AgentExecutor {
  /**
   * Execute an agent with given context
   * Note: This is a placeholder for actual Goose session integration
   */
  async execute(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const { agent, task, user_input, session_id, mode } = context;

    try {
      logger.debug(`Executing agent: ${agent.name} (mode: ${mode})`);

      // TODO: Integrate with Goose MCP for actual execution
      // For now, this is a placeholder that would:
      // 1. Create a Goose session with the agent configuration
      // 2. Send the user input and task
      // 3. Collect the output
      // 4. Track tokens and cost

      const executionTime = Date.now() - startTime;

      // Placeholder result
      const result: AgentExecutionResult = {
        agent_id: agent.id,
        agent_name: agent.name,
        output: `[Placeholder] ${agent.name} processed: ${user_input.substring(0, 50)}...`,
        status: 'success',
        execution_time_ms: executionTime,
        timestamp: new Date(),
      };

      logger.debug(`Agent ${agent.name} completed in ${executionTime}ms`);
      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error(`Agent ${agent.name} failed:`, error);

      return {
        agent_id: agent.id,
        agent_name: agent.name,
        output: '',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        execution_time_ms: executionTime,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeMultiple(
    agents: Agent[],
    context: Omit<AgentExecutionContext, 'agent'>
  ): Promise<AgentExecutionResult[]> {
    const promises = agents.map(agent =>
      this.execute({ ...context, agent })
    );

    return Promise.all(promises);
  }

  /**
   * Execute agents sequentially (for pipeline mode)
   */
  async executeSequential(
    agents: Agent[],
    initialContext: Omit<AgentExecutionContext, 'agent' | 'parent_result'>
  ): Promise<AgentExecutionResult[]> {
    const results: AgentExecutionResult[] = [];

    for (const agent of agents) {
      const context: AgentExecutionContext = {
        ...initialContext,
        agent,
        parent_result: results[results.length - 1]?.output,
      };

      const result = await this.execute(context);
      results.push(result);

      // Stop if any agent fails in pipeline mode
      if (result.status === 'error' && initialContext.mode === 'pipeline') {
        logger.warn(`Pipeline stopped at ${agent.name} due to error`);
        break;
      }
    }

    return results;
  }

  /**
   * Format execution result for display
   */
  formatResult(result: AgentExecutionResult): string {
    let output = `\n${'═'.repeat(60)}\n`;
    output += `Agent: ${result.agent_name}\n`;
    output += `Status: ${result.status}\n`;
    output += `Time: ${result.execution_time_ms}ms\n`;

    if (result.tokens_used) {
      output += `Tokens: ${result.tokens_used.input} in, ${result.tokens_used.output} out\n`;
    }

    if (result.cost) {
      output += `Cost: $${result.cost.toFixed(6)}\n`;
    }

    output += `${'─'.repeat(60)}\n`;
    output += `${result.output}\n`;
    output += `${'═'.repeat(60)}\n`;

    return output;
  }

  /**
   * Validate that agent can execute in given mode
   */
  canExecuteInMode(agent: Agent, mode: string): boolean {
    // All agents can theoretically execute in any mode
    // This is where mode-specific restrictions would go
    return true;
  }

  /**
   * Select appropriate model based on mode
   */
  selectModel(agent: Agent, mode: string): string {
    if (mode === 'ecomode') {
      // Use cheapest available model for ecomode
      // This would be implemented with actual model pricing
      return agent.model; // Placeholder
    }

    return agent.model;
  }
}

// Singleton instance
let executorInstance: AgentExecutor | null = null;

/**
 * Get or create the agent executor singleton
 */
export function getAgentExecutor(): AgentExecutor {
  if (!executorInstance) {
    executorInstance = new AgentExecutor();
  }
  return executorInstance;
}
