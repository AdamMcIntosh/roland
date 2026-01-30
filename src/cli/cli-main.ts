/**
 * CLI Entry Point - Alternative to MCP server for direct CLI usage
 * 
 * Provides command-line interface for Ecomode tasks
 * Can run standalone or alongside MCP server
 */

import { runCli } from './cli-interface.js';
import { loadConfig } from '../config/config-loader.js';
import { initializeAgents } from '../agents/index.js';
import { initializeSkills } from '../skills/index.js';
import { logger } from '../utils/logger.js';

async function main() {
  try {
    logger.info('🦢 Initializing oh-my-goose CLI...');

    // Load configuration
    await loadConfig();
    logger.debug('✅ Configuration loaded');

    // Initialize Phase 3 components
    await initializeSkills();
    logger.debug('✅ Skills loaded');

    await initializeAgents('./agents');
    logger.debug('✅ Agents loaded');

    // Run CLI
    logger.debug('Starting CLI interface');
    await runCli();
  } catch (error) {
    logger.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

main();
