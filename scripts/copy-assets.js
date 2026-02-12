#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy config.yaml
const configSrc = path.join(__dirname, '..', 'config.yaml');
const configDest = path.join(distDir, 'config.yaml');
if (fs.existsSync(configSrc)) {
  fs.copyFileSync(configSrc, configDest);
  console.log(`✓ Copied config.yaml to ${configDest}`);
}

// Copy agents directory
const agentsSrc = path.join(__dirname, '..', 'agents');
const agentsDest = path.join(distDir, 'agents');
if (fs.existsSync(agentsSrc)) {
  if (!fs.existsSync(agentsDest)) {
    fs.mkdirSync(agentsDest, { recursive: true });
  }
  
  // Use platform-agnostic glob pattern
  const pattern = agentsSrc.replace(/\\/g, '/') + '/**/*.yaml';
  const agentFiles = globSync(pattern);
  agentFiles.forEach(file => {
    const filename = path.basename(file);
    fs.copyFileSync(file, path.join(agentsDest, filename));
  });
  console.log(`✓ Copied ${agentFiles.length} agent files to ${agentsDest}`);
} else {
  console.warn(`⚠ Agents directory not found at ${agentsSrc}`);
}

// Copy recipes directory
const recipesSrc = path.join(__dirname, '..', 'recipes');
const recipesDest = path.join(distDir, 'recipes');
if (fs.existsSync(recipesSrc)) {
  if (!fs.existsSync(recipesDest)) {
    fs.mkdirSync(recipesDest, { recursive: true });
  }
  
  const recipePattern = recipesSrc.replace(/\\/g, '/') + '/**/*.yaml';
  const recipeFiles = globSync(recipePattern);
  recipeFiles.forEach(file => {
    const filename = path.basename(file);
    fs.copyFileSync(file, path.join(recipesDest, filename));
  });
  console.log(`✓ Copied ${recipeFiles.length} recipe files to ${recipesDest}`);
} else {
  console.warn(`⚠ Recipes directory not found at ${recipesSrc}`);
}

console.log('✓ Assets copied successfully');


