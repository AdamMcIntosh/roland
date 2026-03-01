#!/usr/bin/env node
/**
 * Bundle RCO plugin for Claude (esbuild). Output: dist-plugin/plugin.js
 */

import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist-plugin');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'plugin.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(outDir, 'plugin.js'),
  target: 'node18',
  sourcemap: true,
  logLevel: 'info',
  // Keep .js extensions for ESM resolution in bundled deps
  mainFields: ['module', 'main'],
}).catch(() => process.exit(1));

console.log('✓ RCO plugin built: dist-plugin/plugin.js');
