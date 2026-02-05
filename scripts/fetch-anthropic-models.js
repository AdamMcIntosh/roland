#!/usr/bin/env node

/**
 * Fetch available models from Anthropic API
 * 
 * This script lists all available models from Anthropic so we can add them to config
 */

import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=');
    if (key && value) {
      process.env[key] = value;
    }
  }
}

const apiKey = process.env.SAMWISE_API_KEYS_ANTHROPIC;

if (!apiKey) {
  console.error('❌ Error: SAMWISE_API_KEYS_ANTHROPIC not found in environment');
  console.error('   Please set the Anthropic API key in your .env file');
  process.exit(1);
}

async function fetchAnthropicModels() {
  try {
    console.log('🔍 Fetching available models from Anthropic API...\n');

    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('⚠️  Models endpoint not available. Using known Claude models:\n');
        printKnownModels();
        return;
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      console.log('✅ Available Anthropic Claude Models:\n');
      
      data.data.forEach(model => {
        const modelId = model.id || model.name;
        console.log(`  • ${modelId}`);
        if (model.display_name) {
          console.log(`    Display: ${model.display_name}`);
        }
        if (model.created_at) {
          console.log(`    Created: ${model.created_at}`);
        }
      });
    } else {
      console.log('📋 Raw API Response:\n');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error fetching models:', error.message);
    console.log('\n💡 Known Claude models (from Anthropic documentation):\n');
    printKnownModels();
  }
}

function printKnownModels() {
  const knownModels = [
    { name: 'claude-3-5-sonnet-20241022', description: 'Latest Claude 3.5 Sonnet (Oct 2024)' },
    { name: 'claude-3-5-sonnet-20240620', description: 'Claude 3.5 Sonnet (Jun 2024)' },
    { name: 'claude-3-opus-20240229', description: 'Claude 3 Opus (Feb 2024)' },
    { name: 'claude-3-sonnet-20240229', description: 'Claude 3 Sonnet (Feb 2024)' },
    { name: 'claude-3-haiku-20240307', description: 'Claude 3 Haiku (Mar 2024)' },
    { name: 'claude-2.1', description: 'Claude 2.1' },
    { name: 'claude-2', description: 'Claude 2' },
    { name: 'claude-instant-1.2', description: 'Claude Instant 1.2' },
  ];

  knownModels.forEach(model => {
    console.log(`  • ${model.name}`);
    console.log(`    ${model.description}`);
  });

  console.log('\n📝 To verify available models, visit: https://console.anthropic.com/');
  console.log('   or check: https://docs.anthropic.com/claude/reference/getting-started-with-the-api\n');
}

fetchAnthropicModels();
