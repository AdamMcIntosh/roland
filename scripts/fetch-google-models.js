#!/usr/bin/env node

/**
 * Fetch available models from Google AI API
 * 
 * This script lists all available models from Google so we can add them to config
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

const apiKey = process.env.ROLAND_API_KEYS_GOOGLE;

if (!apiKey) {
  console.error('❌ Error: ROLAND_API_KEYS_GOOGLE not found in environment');
  console.error('   Please set the Google API key in your .env file');
  process.exit(1);
}

async function fetchGoogleModels() {
  try {
    console.log('🔍 Fetching available models from Google AI API...\n');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.models && Array.isArray(data.models)) {
      console.log('✅ Available Google Gemini Models:\n');
      
      data.models.forEach(model => {
        const modelName = model.name ? model.name.replace('models/', '') : model.displayName;
        console.log(`  • ${modelName}`);
        if (model.displayName && model.displayName !== modelName) {
          console.log(`    Display: ${model.displayName}`);
        }
        if (model.description) {
          console.log(`    ${model.description}`);
        }
        if (model.inputTokenLimit) {
          console.log(`    Input limit: ${(model.inputTokenLimit / 1000).toFixed(0)}K tokens`);
        }
      });
    } else {
      console.log('📋 Raw API Response:\n');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error fetching models:', error.message);
    console.log('\n💡 Known Gemini models (from Google documentation):\n');
    printKnownModels();
  }
}

function printKnownModels() {
  const knownModels = [
    { name: 'gemini-2.0-flash', description: 'Gemini 2.0 Flash - Latest' },
    { name: 'gemini-2.0-flash-exp', description: 'Gemini 2.0 Flash (Experimental)' },
    { name: 'gemini-1.5-pro', description: 'Gemini 1.5 Pro - Most capable' },
    { name: 'gemini-1.5-flash', description: 'Gemini 1.5 Flash - Fast & efficient' },
    { name: 'gemini-1.0-pro', description: 'Gemini 1.0 Pro' },
    { name: 'gemini-1.0-pro-vision', description: 'Gemini 1.0 Pro with vision' },
  ];

  knownModels.forEach(model => {
    console.log(`  • ${model.name}`);
    console.log(`    ${model.description}`);
  });

  console.log('\n📝 To verify available models, visit: https://ai.google.dev/');
  console.log('   or check: https://ai.google.dev/models/gemini\n');
}

fetchGoogleModels();
