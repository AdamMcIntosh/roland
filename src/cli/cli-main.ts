/**
 * CLI Entry Point - DEPRECATED
 * 
 * This non-interactive CLI is deprecated. Use the interactive CLI instead:
 * 
 *   npm run samwise
 *   or
 *   samwise (if installed globally)
 * 
 * The interactive CLI provides better UX and supports all features including
 * automatic file generation for code and design documents.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runCli } from './cli-interface.js';
import { loadConfig } from '../config/config-loader.js';
import { initializeAgents } from '../agents/index.js';
import { initializeSkills } from '../skills/index.js';
import { logger } from '../utils/logger.js';

/**
 * Load .env file into process.env
 */
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue; // Skip empty lines and comments
      
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('='); // Handle values with '='
      
      if (key && value) {
        process.env[key] = value;
      }
    }
    
    logger.debug('✅ Environment variables loaded from .env');
  }
}

async function main() {
  try {
    // Load .env file first
    loadEnvFile();
    
    logger.info(' Initializing samwise CLI...');

    // Load configuration
    await loadConfig();
    logger.debug('✅ Configuration loaded');

    // Initialize Phase 3 components
    await initializeSkills();
    logger.debug('✅ Skills loaded');

    await initializeAgents();
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
