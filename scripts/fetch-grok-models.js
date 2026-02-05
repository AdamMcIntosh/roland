#!/usr/bin/env node

/**
 * Fetch available Grok models from xAI API
 * 
 * This script lists all available models from xAI so we can add them to config
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

const apiKey = process.env.SAMWISE_API_KEYS_XAI;

if (!apiKey) {
  console.error('❌ Error: SAMWISE_API_KEYS_XAI not found in environment');
  console.error('   Please set the xAI API key in your .env file');
  process.exit(1);
}

async function fetchGrokModels() {
  try {
    console.log('🔍 Fetching available Grok models from xAI API...\n');

    const response = await fetch('https://api.x.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('⚠️  Models endpoint not available. Using known Grok models:\n');
        printKnownModels();
        return;
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      console.log('✅ Available Grok Models:\n');
      
      const grokModels = data.data.filter(m => m.id && m.id.includes('grok'));
      
      if (grokModels.length === 0) {
        console.log('No Grok models found in API response. Showing all models:\n');
        data.data.forEach(model => {
          console.log(`  • ${model.id || model.name}`);
        });
      } else {
        grokModels.forEach(model => {
          console.log(`  • ${model.id || model.name}`);
          if (model.description) {
            console.log(`    ${model.description}`);
          }
        });
      }
    } else {
      console.log('📋 Raw API Response:\n');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error fetching models:', error.message);
    console.log('\n💡 Known Grok models (from xAI documentation):\n');
    printKnownModels();
  }
}

function printKnownModels() {
  const knownModels = [
    { name: 'grok-2-1212', description: 'Latest Grok model (2-1212)' },
    { name: 'grok-2-vision-1212', description: 'Grok with vision capabilities' },
    { name: 'grok-1', description: 'Grok v1' },
    { name: 'grok-1-vision-100k', description: 'Grok v1 with vision, 100k context' },
  ];

  knownModels.forEach(model => {
    console.log(`  • ${model.name}`);
    console.log(`    ${model.description}`);
  });

  console.log('\n📝 To verify available models, visit: https://console.x.ai/');
  console.log('   or check: https://docs.x.ai/api/endpoints#models\n');
}

fetchGrokModels();
