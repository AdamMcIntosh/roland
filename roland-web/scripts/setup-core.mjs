/**
 * Syncs the compiled Roland dist into @roland-core so the roland binary
 * and its required assets are available after `npm install`.
 *
 * Run this after building the parent Roland package:
 *   cd .. && npm run build && cd roland-web && node scripts/setup-core.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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

function syncCorePackageJson() {
  const rootPkg = JSON.parse(readFileSync(resolve(rolandRoot, 'package.json'), 'utf8'));
  const corePkgPath = resolve(coreDir, 'package.json');
  const corePkg = JSON.parse(readFileSync(corePkgPath, 'utf8'));
  const depKeys = ['@cursor/sdk', '@modelcontextprotocol/sdk', 'js-yaml', 'yaml', 'zod', 'ws'];
  for (const key of depKeys) {
    if (rootPkg.dependencies?.[key]) {
      corePkg.dependencies[key] = rootPkg.dependencies[key];
    }
  }
  if (rootPkg.overrides) {
    const { next: _next, ...coreOverrides } = rootPkg.overrides;
    corePkg.overrides = {
      ...coreOverrides,
      sqlite3: rootPkg.overrides.sqlite3 ?? {
        tar: '^7.5.16',
        'node-gyp': '^12.3.0',
      },
    };
  }
  writeFileSync(corePkgPath, `${JSON.stringify(corePkg, null, 2)}\n`);
  console.log('  ✓ package.json → @roland-core/package.json (deps + overrides synced)');
}

console.log('Syncing Roland core into @roland-core/ …');
sync(resolve(rolandRoot, 'dist'),    resolve(coreDir, 'dist'));
sync(resolve(rolandRoot, 'agents'),  resolve(coreDir, 'agents'));
sync(resolve(rolandRoot, 'recipes'), resolve(coreDir, 'recipes'));
syncCorePackageJson();
console.log('Done. Run `npm install` if this is the first sync.');
