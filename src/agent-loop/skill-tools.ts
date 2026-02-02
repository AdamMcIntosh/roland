import { getSkillExecutor } from '../skills/skill-executor';
import { logger } from '../utils/logger';
import { SessionConfig } from './types';

export interface SkillToolsConfig {
  config: SessionConfig;
  onConfirmation?: (action: string) => Promise<boolean>;
}

/**
 * Wraps existing skills as agent tools
 */
export class SkillTools {
  private config: SkillToolsConfig;
  private skillExecutor = getSkillExecutor();

  constructor(config: SkillToolsConfig) {
    this.config = config;
  }

  /**
   * List available skills
   */
  async listSkills(): Promise<
    Array<{
      name: string;
      category?: string;
      description: string;
      parameters?: Record<string, any>;
    }>
  > {
    try {
      const tools = this.skillExecutor.getToolDefinitions();

      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: (tool.inputSchema as any)?.properties || {},
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to list skills: ${message}`);
      throw error;
    }
  }

  /**
   * Execute a skill
   */
  async executeSkill(skillName: string, parameters: Record<string, any>): Promise<any> {
    try {
      // Request confirmation if configured
      if (this.config.config.autoConfirm?.skills !== true) {
        if (this.config.onConfirmation) {
          const confirmed = await this.config.onConfirmation(
            `Execute skill: ${skillName}?`
          );
          if (!confirmed) {
            throw new Error(`Skill execution cancelled by user: ${skillName}`);
          }
        }
      }

      logger.info(`Executing skill: ${skillName}`, { parameters });

      const result = await this.skillExecutor.execute(skillName, parameters);

      logger.info(`Skill executed successfully: ${skillName}`, { result });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to execute skill ${skillName}: ${message}`);
      throw error;
    }
  }

  /**
   * Get skill details
   */
  async getSkillDetails(skillName: string): Promise<{
    name: string;
    description: string;
    parameters?: Record<string, any>;
  }> {
    try {
      const tools = this.skillExecutor.getToolDefinitions();
      const tool = tools.find((t) => t.name === skillName);

      if (!tool) {
        throw new Error(`Skill not found: ${skillName}`);
      }

      return {
        name: tool.name,
        description: tool.description || '',
        parameters: (tool.inputSchema as any)?.properties || {},
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get skill details for ${skillName}: ${message}`);
      throw error;
    }
  }

  /**
   * Get skill categories - not available, return empty
   */
  async getSkillCategories(): Promise<string[]> {
    return [];
  }
}
