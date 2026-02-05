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
 * Check for missing API keys and prompt user to enter them
 */
async function checkAndPromptAPIKeys(): Promise<void> {
  const requiredKeys = [
    { env: 'SAMWISE_API_KEYS_XAI', name: 'xAI (Grok)', url: 'https://console.x.ai' },
    { env: 'SAMWISE_API_KEYS_ANTHROPIC', name: 'Anthropic (Claude)', url: 'https://console.anthropic.com' },
    { env: 'SAMWISE_API_KEYS_OPENAI', name: 'OpenAI (GPT)', url: 'https://platform.openai.com/api-keys' },
    { env: 'SAMWISE_API_KEYS_GOOGLE', name: 'Google (Gemini)', url: 'https://ai.google.dev' },
  ];

  const missingKeys = requiredKeys.filter(key => !process.env[key.env]);

  if (missingKeys.length === 0) {
    return; // All keys present
  }

  // Only prompt if running in interactive mode (has TTY)
  if (!process.stdin.isTTY) {
    return; // Skip prompting in non-interactive mode
  }

  console.log('');
  console.log('⚠️  Missing API keys for some providers');
  console.log('');
  console.log('The following providers are not configured:');
  missingKeys.forEach(key => {
    console.log(`  • ${key.name}`);
  });
  console.log('');
  console.log('You can configure them in multiple ways:');
  console.log('  1. Create a .env file in your home directory with your API keys');
  console.log('  2. Set environment variables (e.g., export SAMWISE_API_KEYS_XAI=...)');
  console.log('  3. Enter them now when prompted');
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

  let shouldSave = false;
  const newEnvVars: Record<string, string> = {};

  console.log('Do you want to enter API keys now? (y/n): ');
  const response = await question('> ');

  if (response.toLowerCase() !== 'y' && response.toLowerCase() !== 'yes') {
    rl.close();
    console.log('');
    console.log('You can add API keys later by creating a .env file in your home directory.');
    console.log('');
    return;
  }

  console.log('');
  console.log('Enter your API keys (press Enter to skip):');
  console.log('');

  for (const key of missingKeys) {
    const apiKey = await question(`${key.name} API key: `);
    if (apiKey.trim()) {
      newEnvVars[key.env] = apiKey.trim();
      process.env[key.env] = apiKey.trim();
      shouldSave = true;
    }
  }

  rl.close();

  if (shouldSave) {
    // Save to home directory .env file
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const envPath = path.join(homeDir, '.env');

    try {
      let envContent = '';
      
      // Read existing .env if it exists
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }

      // Add new keys
      for (const [key, value] of Object.entries(newEnvVars)) {
        // Check if key already exists in file
        if (!envContent.includes(key + '=')) {
          envContent += (envContent.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
        }
      }

      fs.writeFileSync(envPath, envContent, 'utf-8');
      console.log(`✅ API keys saved to ${envPath}`);
      console.log('');
    } catch (error) {
      console.log(`⚠️  Could not save API keys to ${envPath}: ${error}`);
      console.log('   You can manually add them to your .env file later.');
      console.log('');
    }
  }
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
    await initializeAgents('./agents');

    // Start interactive CLI
    await runInteractiveCLI();
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

main();
