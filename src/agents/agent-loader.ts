/**
 * Agent Loader - Load and Manage Agent Configurations
 * 
 * Loads agent YAML definitions from the agents/ directory
 * Provides agent registry for runtime access
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';
import { AgentConfig } from '../utils/types.js';
import { logger } from '../utils/logger.js';
import { AgentError, AgentLoadError, AgentNotFoundError } from '../utils/errors.js';

// ============================================================================
// Zod Schema for Agent Configuration Validation
// ============================================================================

const AgentConfigSchema = z.object({
  name: z.string().min(1),
  role_prompt: z.string().min(1),
  description: z.string().optional(),
  recommended_model: z.string().optional(),
  model: z.string().optional(),
  provider: z.enum(['anthropic', 'openai', 'google', 'xai']).optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().optional(),
  tools: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  system_prompt: z.string().optional(),
});

type RawAgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Agent Configuration with defaults and computed properties
 */
export interface LoadedAgentConfig extends RawAgentConfig {
  filePath: string;
  loadedAt: number;
}

// ============================================================================
// Agent Loader
// ============================================================================

export class AgentLoader {
  private agents: Map<string, LoadedAgentConfig> = new Map();
  private agentDir: string;
  private loaded: boolean = false;

  constructor(agentDir: string = './agents') {
    this.agentDir = agentDir;
  }

  /**
   * Load all agents from the agents directory
   * 
   * @param agentDir - Optional custom agents directory
   * @returns Map of loaded agents by name
   */
  async loadAgents(agentDir?: string): Promise<Map<string, LoadedAgentConfig>> {
    const dir = agentDir || this.agentDir;

    if (!fs.existsSync(dir)) {
      throw new AgentLoadError('agents', `Directory not found: ${dir}`);
    }

    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'));
      logger.info(`Found ${files.length} agent definitions`);

      for (const file of files) {
        try {
          const agentConfig = await this.loadAgent(path.join(dir, file));
          this.agents.set(agentConfig.name, agentConfig);
          logger.debug(`Loaded agent: ${agentConfig.name}`);
        } catch (error) {
          logger.warn(`Failed to load agent from ${file}: ${error}`);
        }
      }

      this.loaded = true;
      logger.info(`Successfully loaded ${this.agents.size} agents`);

      return this.agents;
    } catch (error) {
      throw new AgentLoadError('agents', `Failed to load agents: ${error}`);
    }
  }

  /**
   * Load a single agent from a YAML file
   * 
   * @param filePath - Path to YAML file
   * @returns Loaded agent configuration
   */
  private async loadAgent(filePath: string): Promise<LoadedAgentConfig> {
    try {
      const yaml = fs.readFileSync(filePath, 'utf-8');
      const parsed = YAML.parse(yaml);

      // Validate with Zod
      const validated = AgentConfigSchema.parse(parsed);

      return {
        ...validated,
        filePath,
        loadedAt: Date.now(),
      };
    } catch (error) {
      const fileName = path.basename(filePath);
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        throw new AgentLoadError(fileName, `Invalid config:\n${errors.join('\n')}`);
      }
      throw new AgentLoadError(fileName, `Failed to load: ${error}`);
    }
  }

  /**
   * Get a specific agent by name
   * 
   * @param name - Agent name
   * @returns Agent configuration or null
   */
  getAgent(name: string): LoadedAgentConfig | null {
    return this.agents.get(name) || null;
  }

  /**
   * Get all loaded agents
   * 
   * @returns Map of all agents
   */
  getAllAgents(): Map<string, LoadedAgentConfig> {
    return new Map(this.agents);
  }

  /**
   * Get agent names by skill
   * 
   * @param skill - Skill name
   * @returns Array of agent names that support this skill
   */
  getAgentsBySkill(skill: string): string[] {
    const matching: string[] = [];
    this.agents.forEach((agent, name) => {
      if (agent.skills && agent.skills.includes(skill)) {
        matching.push(name);
      }
    });
    return matching;
  }

  /**
   * Get agent names by tool
   * 
   * @param tool - Tool name
   * @returns Array of agent names that support this tool
   */
  getAgentsByTool(tool: string): string[] {
    const matching: string[] = [];
    this.agents.forEach((agent, name) => {
      if (agent.tools && agent.tools.includes(tool)) {
        matching.push(name);
      }
    });
    return matching;
  }

  /**
   * Check if agent is loaded
   * 
   * @param name - Agent name
   * @returns True if agent exists
   */
  hasAgent(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Get agent count
   * 
   * @returns Number of loaded agents
   */
  count(): number {
    return this.agents.size;
  }

  /**
   * List all agent names
   * 
   * @returns Array of agent names
   */
  listAgentNames(): string[] {
    return Array.from(this.agents.keys()).sort();
  }

  /**
   * Generate agent list report
   * 
   * @returns Formatted report
   */
  generateReport(): string {
    let report = '\n🤖 Loaded Agents:\n';
    report += `  Total: ${this.agents.size}\n\n`;

    const agents = Array.from(this.agents.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    agents.forEach((agent) => {
      report += `  • ${agent.name}\n`;
      report += `    Role: ${agent.role_prompt}\n`;
      report += `    Model: ${agent.model || agent.recommended_model || 'default'}\n`;
      if (agent.tools && agent.tools.length > 0) {
        report += `    Tools: ${agent.tools.join(', ')}\n`;
      }
      if (agent.skills && agent.skills.length > 0) {
        report += `    Skills: ${agent.skills.join(', ')}\n`;
      }
      report += '\n';
    });

    return report;
  }

  /**
   * Clear loaded agents (useful for testing)
   */
  clear(): void {
    this.agents.clear();
    this.loaded = false;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const agentLoader = new AgentLoader();
