/**
 * Agent Manager
 * Loads, validates, and manages agent configurations from YAML files
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { Agent, AgentConfig, AgentConfigSchema, AgentRegistryEntry, AgentStats } from './types.js';
import { logger } from '../utils/logger.js';
import { ConfigError } from '../utils/errors.js';

export class AgentManager {
  private agents: Map<string, Agent> = new Map();
  private registry: Map<string, AgentRegistryEntry> = new Map();
  private stats: Map<string, AgentStats> = new Map();
  private agentsDir: string;

  constructor(agentsDir: string = './agents') {
    this.agentsDir = agentsDir;
  }

  /**
   * Load all agents from YAML files in the agents directory
   */
  async loadAgents(): Promise<Agent[]> {
    try {
      if (!fs.existsSync(this.agentsDir)) {
        logger.warn(`Agents directory not found: ${this.agentsDir}`);
        return [];
      }

      const files = fs.readdirSync(this.agentsDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      logger.info(`Found ${files.length} agent configuration files`);

      for (const file of files) {
        try {
          const agentName = path.basename(file, path.extname(file));
          await this.loadAgent(agentName);
        } catch (error) {
          logger.error(`Failed to load agent ${file}:`, error);
        }
      }

      logger.success(`✅ Loaded ${this.agents.size} agents`);
      return Array.from(this.agents.values());

    } catch (error) {
      throw new ConfigError(`Failed to load agents: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load a single agent by name
   */
  async loadAgent(agentName: string): Promise<Agent> {
    try {
      const filePath = path.join(this.agentsDir, `${agentName}.yaml`);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Agent file not found: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const config = yaml.parse(content) as AgentConfig;

      // Validate configuration
      const validatedConfig = AgentConfigSchema.parse(config);

      // Create agent with metadata
      const agent: Agent = {
        ...validatedConfig,
        id: `agent_${agentName}_${Date.now()}`,
        loaded_at: new Date(),
      };

      // Store in agents map
      this.agents.set(agentName, agent);

      // Add to registry
      this.registry.set(agentName, {
        id: agent.id,
        name: agent.name,
        agent,
        provider: agent.provider,
        model: agent.model,
        capabilities: agent.capabilities || [],
        loaded_at: agent.loaded_at,
      });

      // Initialize stats
      if (!this.stats.has(agentName)) {
        this.stats.set(agentName, {
          name: agentName,
          total_executions: 0,
          successful_executions: 0,
          failed_executions: 0,
          average_execution_time_ms: 0,
          total_tokens_used: 0,
          total_cost: 0,
          error_rate: 0,
        });
      }

      logger.debug(`Loaded agent: ${agentName} (model: ${agent.model})`);
      return agent;

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ConfigError(`Invalid agent configuration for ${agentName}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get a specific agent by name
   */
  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all loaded agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by provider
   */
  getAgentsByProvider(provider: string): Agent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.provider === provider);
  }

  /**
   * Get agents by model
   */
  getAgentsByModel(model: string): Agent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.model === model);
  }

  /**
   * Get agents with specific capability
   */
  getAgentsByCapability(capability: string): Agent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.capabilities?.includes(capability));
  }

  /**
   * Get registry entry for an agent
   */
  getRegistryEntry(name: string): AgentRegistryEntry | undefined {
    return this.registry.get(name);
  }

  /**
   * Get all registry entries
   */
  getAllRegistry(): AgentRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Record agent execution
   */
  recordExecution(
    agentName: string,
    success: boolean,
    executionTimeMs: number,
    tokensUsed?: { input: number; output: number },
    cost?: number
  ): void {
    const stats = this.stats.get(agentName);
    if (!stats) return;

    stats.total_executions += 1;
    if (success) {
      stats.successful_executions += 1;
    } else {
      stats.failed_executions += 1;
    }

    stats.average_execution_time_ms =
      (stats.average_execution_time_ms * (stats.total_executions - 1) + executionTimeMs) /
      stats.total_executions;

    if (tokensUsed) {
      stats.total_tokens_used += tokensUsed.input + tokensUsed.output;
    }

    if (cost) {
      stats.total_cost += cost;
    }

    stats.error_rate = stats.failed_executions / stats.total_executions;
    stats.last_execution_time = new Date();
  }

  /**
   * Get statistics for an agent
   */
  getStats(agentName: string): AgentStats | undefined {
    return this.stats.get(agentName);
  }

  /**
   * Get all statistics
   */
  getAllStats(): AgentStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Get summary statistics
   */
  getSummaryStats(): {
    total_agents: number;
    total_executions: number;
    average_success_rate: number;
    total_tokens_used: number;
    total_cost: number;
  } {
    const allStats = Array.from(this.stats.values());
    const totalExecutions = allStats.reduce((sum, s) => sum + s.total_executions, 0);
    const totalSuccessful = allStats.reduce((sum, s) => sum + s.successful_executions, 0);
    const totalTokens = allStats.reduce((sum, s) => sum + s.total_tokens_used, 0);
    const totalCost = allStats.reduce((sum, s) => sum + s.total_cost, 0);

    return {
      total_agents: this.agents.size,
      total_executions: totalExecutions,
      average_success_rate: totalExecutions > 0 ? totalSuccessful / totalExecutions : 0,
      total_tokens_used: totalTokens,
      total_cost: totalCost,
    };
  }

  /**
   * Clear all loaded agents
   */
  clear(): void {
    this.agents.clear();
    this.registry.clear();
    this.stats.clear();
    logger.debug('Cleared all agents');
  }

  /**
   * Generate a report of all agents
   */
  generateReport(): string {
    const agents = Array.from(this.agents.values());
    if (agents.length === 0) {
      return 'No agents loaded';
    }

    let report = '═══════════════════════════════════════════════════════════\n';
    report += '                      AGENT REGISTRY REPORT\n';
    report += '═══════════════════════════════════════════════════════════\n\n';

    report += `📊 SUMMARY\n`;
    report += `   Total Agents: ${agents.length}\n`;
    report += `   Agents Loaded: ${new Date().toISOString()}\n\n`;

    report += `🤖 AGENTS BY PROVIDER\n`;
    const byProvider = agents.reduce((acc, agent) => {
      acc[agent.provider] = (acc[agent.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [provider, count] of Object.entries(byProvider)) {
      report += `   ${provider}: ${count} agents\n`;
    }

    report += `\n📋 AGENT DETAILS\n`;
    agents.forEach(agent => {
      report += `\n   ${agent.name.toUpperCase()}\n`;
      report += `   ├─ Model: ${agent.model}\n`;
      report += `   ├─ Provider: ${agent.provider}\n`;
      report += `   ├─ Temperature: ${agent.temperature}\n`;
      report += `   ├─ Tools: ${agent.tools?.join(', ') || 'None'}\n`;
      report += `   └─ Role: ${agent.role_prompt}\n`;
    });

    report += '\n═══════════════════════════════════════════════════════════\n';

    return report;
  }
}

// Singleton instance
let agentManagerInstance: AgentManager | null = null;

/**
 * Get or create the agent manager singleton
 */
export function getAgentManager(agentsDir?: string): AgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new AgentManager(agentsDir);
  }
  return agentManagerInstance;
}

// Import z for ZodError handling
import { z } from 'zod';
