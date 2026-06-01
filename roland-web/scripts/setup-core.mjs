/**
 * Syncs the compiled Roland dist into @roland-core so the roland binary
 * and its required assets are available after `npm install`.
 *
 * Run this after building the parent Roland package:
 *   cd .. && npm run build && cd roland-web && node scripts/setup-core.mjs
 */
import { cpSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rolandRoot = resolve(__dirname, '..', '..');     // repo root (../roland-web/../)
const coreDir   = resolve(__dirname, '..', '@roland-core');

function sync(src, dest) {
  if (!existsSync(src)) {
    console.error(`✗  Missing: ${src} — run 'npm run build' in the repo root first`);
    process.exit(1);
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`  ✓ ${src.replace(rolandRoot + '/', '')} → @roland-core/${dest.replace(coreDir + '/', '')}`);
}

console.log('Syncing Roland core into @roland-core/ …');
sync(resolve(rolandRoot, 'dist'),    resolve(coreDir, 'dist'));
sync(resolve(rolandRoot, 'agents'),  resolve(coreDir, 'agents'));
sync(resolve(rolandRoot, 'recipes'), resolve(coreDir, 'recipes'));
console.log('Done. Run `npm install` if this is the first sync.');
