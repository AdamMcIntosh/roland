#!/usr/bin/env node
/**
 * oh-my-goose MCP Server Entry Point
 * Starts the Model Context Protocol server for Goose integration
 */

import { McpServer } from './server/mcp-server.js';
import { loadConfig } from './config/config-loader.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('🦢 Starting oh-my-goose MCP Server...');

    // Load configuration
    const config = await loadConfig();
    logger.info(`✅ Configuration loaded from ${config.configPath}`);

    // Initialize MCP server
    const server = new McpServer(config);
    await server.start();

    logger.info('✅ MCP Server started successfully');
    logger.info('🔗 Waiting for Goose connection...');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\n📡 Shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('\n📡 Shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
