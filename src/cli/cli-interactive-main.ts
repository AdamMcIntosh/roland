/**
 * Interactive CLI Entry Point
 * 
 * Starts the GitHub Copilot-style interactive REPL
 */

import { runInteractiveCLI } from './interactive-cli.js';
import { loadConfig } from '../config/config-loader.js';
import { initializeAgents } from '../agents/index.js';
import { initializeSkills } from '../skills/index.js';
import { logger } from '../utils/logger.js';

async function main() {
  try {
    // Load configuration silently
    await loadConfig();
    
    // Initialize components
    await initializeSkills();
    await initializeAgents('./agents');

    // Start interactive CLI
    await runInteractiveCLI();
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

main();
