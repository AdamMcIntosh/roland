/**
 * Tool Registry
 * Registers all available tools for the agent loop
 * Includes skills, file operations, terminal commands, modes, and workflows
 */

import { ToolDefinition, ToolCall, ToolResult } from './types.js';
import { logger } from '../utils/logger.js';
import { FileTools } from './file-tools.js';
import { TerminalTools } from './terminal-tools.js';
import { SkillTools } from './skill-tools.js';
import { ModeTools } from './mode-tools.js';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private handlers: Map<string, (input: Record<string, unknown>) => Promise<string>> = new Map();
  private fileTools?: FileTools;
  private terminalTools?: TerminalTools;
  private skillTools?: SkillTools;
  private modeTools?: ModeTools;

  /**
   * Register a tool with its handler
   */
  registerTool(
    definition: ToolDefinition,
    handler: (input: Record<string, unknown>) => Promise<string>
  ): void {
    this.tools.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
    logger.debug(`[ToolRegistry] Registered tool: ${definition.name}`);
  }

  /**
   * Initialize file tools
   */
  setFileTools(fileTools: FileTools): void {
    this.fileTools = fileTools;
  }

  /**
   * Initialize terminal tools
   */
  setTerminalTools(terminalTools: TerminalTools): void {
    this.terminalTools = terminalTools;
  }

  /**
   * Initialize skill tools
   */
  setSkillTools(skillTools: SkillTools): void {
    this.skillTools = skillTools;
  }

  /**
   * Initialize mode tools
   */
  setModeTools(modeTools: ModeTools): void {
    this.modeTools = modeTools;
  }

  /**
   * Get all registered tools
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const { tool_name, tool_input, tool_use_id } = toolCall;

    const handler = this.handlers.get(tool_name);
    if (!handler) {
      return {
        tool_use_id,
        content: `Tool not found: ${tool_name}`,
        is_error: true,
      };
    }

    try {
      logger.debug(`[ToolRegistry] Executing tool: ${tool_name}`);
      const result = await handler(tool_input);
      return {
        tool_use_id,
        content: result,
        is_error: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[ToolRegistry] Tool execution failed: ${tool_name}`, message);
      return {
        tool_use_id,
        content: `Error executing tool: ${message}`,
        is_error: true,
      };
    }
  }

  /**
   * Get tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if tool exists
   */
  hasToolCategory(category: string): boolean {
    return Array.from(this.tools.values()).some(t => t.category === category);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }
}

/**
 * Global tool registry instance
 */
let registryInstance: ToolRegistry | null = null;

/**
 * Get or create tool registry
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}
