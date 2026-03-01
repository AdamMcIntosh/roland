#!/usr/bin/env node
/**
 * Zip dist-plugin for Claude plugin distribution (Phase 4). Cross-platform (Node only).
 * Run after build-plugin. Output: dist-plugin/roland-plugin-0.1.0.zip
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distPlugin = path.join(root, 'dist-plugin');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version || '0.1.0';
const zipName = `roland-plugin-${version}.zip`;
const outPath = path.join(distPlugin, zipName);

if (!fs.existsSync(distPlugin)) {
  console.error('dist-plugin not found. Run npm run build-plugin first.');
  process.exit(1);
}
if (!fs.existsSync(path.join(distPlugin, 'plugin.js'))) {
  console.error('dist-plugin/plugin.js not found.');
  process.exit(1);
}

const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✓ RCO plugin zip: dist-plugin/${zipName} (${archive.pointer()} bytes)`);
});

archive.on('error', (err) => {
  console.error('Zip failed:', err.message);
  process.exit(1);
});

archive.pipe(output);
archive.directory(distPlugin, false);
archive.finalize();
