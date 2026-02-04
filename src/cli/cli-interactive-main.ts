/**
 * Interactive CLI Entry Point
 * 
 * Starts the GitHub Copilot-style interactive REPL
 */

import * as fs from 'fs';
import * as path from 'path';
import { runInteractiveCLI } from './interactive-cli.js';
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
