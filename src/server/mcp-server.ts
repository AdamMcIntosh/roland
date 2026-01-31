/**
 * MCP Server Implementation
 * Implements the Model Context Protocol server for Goose integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppConfig } from '../utils/types.js';
import { McpServerError, McpToolError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// MCP Server Implementation
// ============================================================================

export class McpServer {
  private server: Server;
  private config: AppConfig;
  private tools: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  private toolDefinitions: Map<string, Tool>;

  constructor(config: AppConfig) {
    this.config = config;
    this.tools = new Map();
    this.toolDefinitions = new Map();
    this.registerTools();

    // Initialize MCP server with stdio transport
    this.server = new Server({
      name: 'oh-my-goose',
      version: '0.1.0',
    });

    this.setupHandlers();
  }

  /**
   * Register available tools
   */
  private registerTools(): void {
    // Health check tool
    this.registerTool(
      'health_check',
      'Check the health status of the oh-my-goose MCP server',
      async () => {
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        };
      },
      {
        type: 'object',
        properties: {},
        required: [],
      }
    );

    // Get models tool
    this.registerTool(
      'get_models',
      'Get available models for a given complexity level',
      async (args: Record<string, unknown>) => {
        const complexity = args.complexity as string;
        if (!['simple', 'medium', 'complex', 'explain'].includes(complexity)) {
          throw new McpToolError('get_models', 'Invalid complexity level');
        }

        const models = this.config.routing[complexity as keyof typeof this.config.routing];
        return {
          complexity,
          models: models || [],
          default: models?.[0] || null,
        };
      },
      {
        type: 'object',
        properties: {
          complexity: {
            type: 'string',
            enum: ['simple', 'medium', 'complex', 'explain'],
            description: 'Complexity level to get models for',
          },
        },
        required: ['complexity'],
      }
    );

    // Get config tool (safe - no API keys)
    this.registerTool(
      'get_config',
      'Get current routing configuration (safe, no API keys)',
      async () => {
        return {
          routing: this.config.routing,
          mcp_defaults: this.config.goose.mcp_defaults,
          configPath: this.config.configPath,
        };
      },
      {
        type: 'object',
        properties: {},
        required: [],
      }
    );
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('📋 ListTools request received');
      return {
        tools: Array.from(this.toolDefinitions.values()),
      };
    });

    // Handle call tool request
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      try {
        logger.debug(`🔧 CallTool request: ${toolName}`);

        const toolHandler = this.tools.get(toolName);
        if (!toolHandler) {
          throw new McpToolError(toolName, 'Tool not found');
        }

        const result = await toolHandler(args);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`❌ Tool error (${toolName}):`, message);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    // Setup error handler
    this.server.onerror = (error) => {
      logger.error('❌ MCP Server error:', error);
    };

    // Setup close handler
    this.server.onclose = () => {
      logger.info('🔌 MCP Server closed');
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      logger.info('🚀 Starting MCP Server...');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.success('✅ MCP Server connected and ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpServerError(`Failed to start MCP server: ${message}`);
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      logger.info('🛑 Stopping MCP Server...');
      await this.server.close();
      logger.success('✅ MCP Server stopped');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`⚠️ Error stopping server: ${message}`);
    }
  }

  /**
   * Register a custom tool (for future skill integration)
   */
  registerTool(
    name: string,
    description: string,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
    inputSchema?: Record<string, unknown>
  ): void {
    this.tools.set(name, handler);
    this.toolDefinitions.set(name, {
      name,
      description,
      inputSchema: (inputSchema as Tool['inputSchema']) || {
        type: 'object',
        properties: {},
        required: [],
      },
    });
    logger.debug(`✅ Registered tool: ${name}`);
  }

  /**
   * Get a registered tool
   */
  getTool(name: string): ((args: Record<string, unknown>) => Promise<unknown>) | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get the configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get the MCP server instance (for advanced usage)
   */
  getServer(): Server {
    return this.server;
  }
}
