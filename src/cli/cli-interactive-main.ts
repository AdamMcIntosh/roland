#!/usr/bin/env node

/**
 * Interactive CLI Entry Point
 * 
 * Starts the GitHub Copilot-style interactive REPL
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { runInteractiveCLI } from './interactive-cli.js';
import { loadConfig } from '../config/config-loader.js';
import { initializeAgents } from '../agents/index.js';
import { initializeSkills } from '../skills/index.js';
import { logger } from '../utils/logger.js';

/**
 * Load .env file into process.env from multiple locations
 */
function loadEnvFile() {
  // Search in multiple locations
  const searchPaths = [
    path.join(process.cwd(), '.env'),
    path.join(path.dirname(process.argv[1]), '..', '.env'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.env'),
  ];

  for (const envPath of searchPaths) {
    if (fs.existsSync(envPath)) {
      try {
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
        
        logger.debug(`✅ Environment variables loaded from ${envPath}`);
        return;
      } catch (error) {
        logger.debug(`Failed to load ${envPath}: ${error}`);
      }
    }
  }
}

/**
 * Check for OpenRouter API key and prompt user to enter one if missing
 */
async function checkAndPromptAPIKeys(): Promise<void> {
  const requiredKey = { 
    env: 'SAMWISE_API_KEYS_OPENROUTER', 
    name: 'OpenRouter (Free Tier)', 
    url: 'https://openrouter.ai/settings/keys' 
  };

  // Check if OpenRouter API key is configured
  const hasKey = !!process.env[requiredKey.env];

  if (hasKey) {
    return; // Key is present, we're good
  }

  // Only prompt if running in interactive mode (has TTY)
  if (!process.stdin.isTTY) {
    return; // Skip prompting in non-interactive mode
  }

  console.log('');
  console.log('⚠️  OpenRouter API key not configured');
  console.log('');
  console.log('Samwise requires an OpenRouter API key (free tier available):');
  console.log(`  • ${requiredKey.name}: ${requiredKey.url}`);
  console.log('');
  console.log('You can configure it in multiple ways:');
  console.log('  1. Create a .env file in your home directory with SAMWISE_API_KEYS_OPENROUTER=...');
  console.log('  2. Set environment variable (e.g., export SAMWISE_API_KEYS_OPENROUTER=...)');
  console.log('  3. Enter it now when prompted');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(prompt, resolve);
    });
  };

  console.log('Do you want to enter your OpenRouter API key now? (y/n): ');
  const response = await question('> ');

  if (response.toLowerCase() !== 'y' && response.toLowerCase() !== 'yes') {
    rl.close();
    console.log('');
    console.log('You can add your OpenRouter API key later by creating a .env file.');
    console.log('');
    return;
  }

  console.log('');
  const apiKey = await question(`${requiredKey.name} API key: `);

  if (apiKey.trim()) {
    process.env[requiredKey.env] = apiKey.trim();

    // Save to home directory .env file
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const envPath = path.join(homeDir, '.env');

    try {
      let envContent = '';
      
      // Read existing .env if it exists
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }

      // Add the key
      if (!envContent.includes(requiredKey.env + '=')) {
        envContent += (envContent.endsWith('\n') ? '' : '\n') + `${requiredKey.env}=${apiKey.trim()}\n`;
      }

      fs.writeFileSync(envPath, envContent, 'utf-8');
      console.log(`✅ API key saved to ${envPath}`);
      console.log('');
    } catch (error) {
      console.log(`⚠️  Could not save API key to ${envPath}: ${error}`);
      console.log('   You can manually add it to your .env file later.');
      console.log('');
    }
  }

  rl.close();
}

async function main() {
  try {
    // Load .env file first
    loadEnvFile();
    
    // Check and prompt for missing API keys
    await checkAndPromptAPIKeys();
    
    // Load configuration silently
    await loadConfig();
    
    // Initialize components
    await initializeSkills();
    await initializeAgents();

    // Start interactive CLI
    await runInteractiveCLI();
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

main();
