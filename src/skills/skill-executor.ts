/**
 * Skill Executor
 * 
 * Provides execution wrapper and MCP tool metadata for skills
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Skill } from './skill-framework.js';
import { SkillRegistry, skillRegistry } from './skill-framework.js';
import { SkillResult, SkillMetadata, SkillParameter } from '../utils/types.js';

export class SkillExecutor {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry = skillRegistry) {
    this.registry = registry;
  }

  /**
   * Execute a skill with timing and error handling
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Promise<SkillResult> {
    const start = Date.now();
    try {
      const result = await this.registry.executeSkill(name, input, context);
      return {
        ...result,
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Generate MCP tool definitions for all skills
   */
  getToolDefinitions(): Tool[] {
    const skills = Array.from(this.registry.getAllSkills().values());
    return skills.map((skill) => this.toMcpTool(skill));
  }

  /**
   * Build a tool handler for MCP
   */
  getToolHandler(name: string): (args: Record<string, unknown>) => Promise<SkillResult> {
    return async (args: Record<string, unknown>) => {
      return this.execute(name, args);
    };
  }

  /**
   * Convert Skill metadata to MCP Tool schema
   */
  toMcpTool(skill: Skill): Tool {
    const metadata = skill.metadata as SkillMetadata;
    const inputSchema = this.buildInputSchema(metadata.parameters || []);

    return {
      name: metadata.name,
      description: metadata.description,
      inputSchema,
    };
  }

  /**
   * Build JSON schema input from Skill parameters
   */
  private buildInputSchema(parameters: SkillParameter[]): Tool['inputSchema'] {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const param of parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
        ...(param.enum ? { enum: param.enum } : {}),
        ...(param.default !== undefined ? { default: param.default } : {}),
      } as object;

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object' as const,
      properties,
      required: required.length > 0 ? required : [],
    };
  }
}

// Singleton helper
let skillExecutorInstance: SkillExecutor | null = null;

export function getSkillExecutor(): SkillExecutor {
  if (!skillExecutorInstance) {
    skillExecutorInstance = new SkillExecutor();
  }
  return skillExecutorInstance;
}
