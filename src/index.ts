#!/usr/bin/env node
/**
 * samwise MCP Server Entry Point
 * Starts the Model Context Protocol server for agent orchestration
 */

import { McpServer } from './server/mcp-server.js';
import { loadConfig } from './config/config-loader.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('🚀 Starting Samwise MCP Server v2...');

    // Load configuration
    const config = await loadConfig();
    logger.info('✅ Configuration loaded');

    // Initialize MCP server
    const server = new McpServer(config);
    await server.start();

    logger.info('🔗 Waiting for client connection...');

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
    console.error(error);
    process.exit(1);
  }
}

main();
