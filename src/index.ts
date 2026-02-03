#!/usr/bin/env node
/**
 * samwise MCP Server Entry Point
 * Starts the Model Context Protocol server for Goose integration
 */

import { McpServer } from './server/mcp-server.js';
import { loadConfig } from './config/config-loader.js';
import { logger } from './utils/logger.js';
import { initializeAgents } from './agents/index.js';
import { initializeSkills, registerSkillsAsTools } from './skills/index.js';

async function main() {
  try {
    logger.info('🦢 Starting samwise MCP Server...');

    // Load configuration
    const config = await loadConfig();
    logger.info(`✅ Configuration loaded`);

    // Initialize Phase 3 components
    logger.info('Initializing Phase 3 components...');
    await initializeSkills();
    await initializeAgents('./agents');
    logger.info('✅ Phase 3 components initialized');

    // Initialize MCP server
    const server = new McpServer(config);

    // Register skills as MCP tools
    registerSkillsAsTools(server.registerTool.bind(server));

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
