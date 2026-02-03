/**
 * Agent Executor
 * Executes agents and manages their outputs
 */

import {
  Agent,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentPromptBundle,
  SessionExecutor,
  SessionParams,
  SessionResult,
} from './types.js';
import { skillRegistry } from '../skills/skill-framework.js';
import { logger } from '../utils/logger.js';

export class AgentExecutor {
  private sessionExecutor: SessionExecutor;

  constructor(sessionExecutor?: SessionExecutor) {
    this.sessionExecutor = sessionExecutor ?? this.defaultExecutor.bind(this);
  }

  /**
   * Execute an agent with given context
   * Note: This is a placeholder for actual session adapter integration
   */
  async execute(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const { agent, task, user_input, session_id, mode } = context;

    try {
      logger.debug(`Executing agent: ${agent.name} (mode: ${mode})`);

      // Build prompt and session parameters
      const prompt = this.buildPrompt(context);
      const sessionParams = this.mapAgentToSessionParams(context, prompt);

      // Execute via session adapter (placeholder by default)
      const result = await this.sessionExecutor(sessionParams, prompt);

      const executionTime = Date.now() - startTime;

      const response: AgentExecutionResult = {
        agent_id: agent.id,
        agent_name: agent.name,
        output: result.output,
        status: result.status || 'success',
        error: result.error,
        tokens_used: result.tokens_used,
        cost: result.cost,
        execution_time_ms: executionTime,
        timestamp: new Date(),
      };

      logger.debug(`Agent ${agent.name} completed in ${executionTime}ms`);
      return response;

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
      return agent.model || agent.recommended_model || 'grok-3-mini';
    }

    return agent.model || agent.recommended_model || 'grok-3';
  }

  /**
   * Map agent configuration to session parameters
   */
  mapAgentToSessionParams(
    context: AgentExecutionContext,
    prompt: AgentPromptBundle
  ): SessionParams {
    const { agent, session_id, mode } = context;
    const model = this.selectModel(agent, mode);
    const tools = this.resolveTools(context);
    const skills = this.resolveSkills(context);

    return {
      session_id,
      agent_name: agent.name,
      provider: agent.provider,
      model,
      temperature: agent.temperature ?? 0.7,
      max_tokens: agent.max_tokens,
      system_prompt: prompt.system,
      tools,
      skills,
    };
  }

  /**
   * Build prompt bundle with templating support
   */
  buildPrompt(context: AgentExecutionContext): AgentPromptBundle {
    const { agent, task, user_input, mode, parent_result, promptTemplate } = context;

    const baseSystem = agent.system_prompt
      ? agent.system_prompt
      : `You are ${agent.name}. ${agent.role_prompt}`;

    const template = promptTemplate ||
      `Task: {{task}}\n` +
      `User Input: {{user_input}}\n` +
      `Mode: {{mode}}\n` +
      (parent_result ? `Previous Result: {{parent_result}}\n` : '');

    const userPrompt = this.applyTemplate(template, {
      task,
      user_input,
      mode,
      parent_result: parent_result || '',
      agent_name: agent.name,
    });

    return {
      system: baseSystem,
      user: userPrompt.trim(),
    };
  }

  /**
   * Resolve tools for the agent execution
   */
  resolveTools(context: AgentExecutionContext): string[] {
    const fromAgent = context.agent.tools || [];
    const fromContext = context.tools || [];
    const tools = [...fromAgent, ...fromContext];
    return Array.from(new Set(tools));
  }

  /**
   * Resolve skills for the agent execution
   */
  resolveSkills(context: AgentExecutionContext): string[] {
    const fromAgent = context.agent.skills || [];
    const fromContext = context.skills || [];

    const allSkills = skillRegistry.getSkillNames();
    const skills = [...fromAgent, ...fromContext];

    if (skills.length === 0) {
      return allSkills;
    }

    return Array.from(new Set(skills));
  }

  /**
   * Apply simple template variables
   */
  private applyTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => values[key] ?? '');
  }

  /**
   * Default placeholder executor until session adapter is wired
   */
  private async defaultExecutor(
    params: SessionParams,
    prompt: AgentPromptBundle
  ): Promise<SessionResult> {
    return {
      output: `[Placeholder] ${params.agent_name} processed: ${prompt.user.substring(0, 80)}...`,
      status: 'success',
    };
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
