#!/usr/bin/env node

/**
 * Fetch available models from OpenAI API
 * 
 * This script lists all available models from OpenAI so we can add them to config
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

const apiKey = process.env.ROLAND_API_KEYS_OPENAI;

if (!apiKey) {
  console.error('❌ Error: ROLAND_API_KEYS_OPENAI not found in environment');
  console.error('   Please set the OpenAI API key in your .env file');
  process.exit(1);
}

async function fetchOpenAIModels() {
  try {
    console.log('🔍 Fetching available models from OpenAI API...\n');

    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      console.log('✅ Available OpenAI Models:\n');
      
      // Filter for GPT models (exclude embeddings, moderation, etc)
      const gptModels = data.data
        .filter(m => {
          const id = m.id || '';
          return id.includes('gpt') && !id.includes('embedding') && !id.includes('moderation');
        })
        .sort((a, b) => (b.id || '').localeCompare(a.id || ''));
      
      if (gptModels.length === 0) {
        console.log('No GPT models found. Showing all models:\n');
        data.data.slice(0, 20).forEach(model => {
          console.log(`  • ${model.id}`);
          if (model.owned_by) {
            console.log(`    Owner: ${model.owned_by}`);
          }
        });
      } else {
        gptModels.forEach(model => {
          console.log(`  • ${model.id}`);
          if (model.owned_by) {
            console.log(`    Owner: ${model.owned_by}`);
          }
        });
      }
      
      console.log(`\n📊 Total models available: ${data.data.length}`);
    } else {
      console.log('📋 Raw API Response:\n');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error fetching models:', error.message);
    console.log('\n💡 Known GPT models (from OpenAI documentation):\n');
    printKnownModels();
  }
}

function printKnownModels() {
  const knownModels = [
    { name: 'gpt-4-turbo', description: 'GPT-4 Turbo with 128K context' },
    { name: 'gpt-4-turbo-2024-04-09', description: 'GPT-4 Turbo (Apr 2024)' },
    { name: 'gpt-4o', description: 'GPT-4o (Omni) - Latest' },
    { name: 'gpt-4o-2024-11-20', description: 'GPT-4o (Nov 2024)' },
    { name: 'gpt-4o-mini', description: 'GPT-4o Mini - Lightweight' },
    { name: 'gpt-4-vision-preview', description: 'GPT-4 with vision' },
    { name: 'gpt-4', description: 'GPT-4' },
    { name: 'gpt-3.5-turbo', description: 'GPT-3.5 Turbo' },
    { name: 'gpt-3.5-turbo-instruct', description: 'GPT-3.5 Turbo Instruct' },
  ];

  knownModels.forEach(model => {
    console.log(`  • ${model.name}`);
    console.log(`    ${model.description}`);
  });

  console.log('\n📝 To verify available models, visit: https://platform.openai.com/docs/models/');
  console.log('   or check: https://platform.openai.com/account/billing/overview\n');
}

fetchOpenAIModels();
