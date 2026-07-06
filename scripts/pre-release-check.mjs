#!/usr/bin/env node
/**
 * ## P3 Release & Stabilization
 *
 * Pre-release gate: version consistency, hot-path TODO scan, build sanity.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const HOT_PATH_FILES = [
  'src/loop-engine/loop-engine.ts',
  'src/loop-engine/closed-loop.ts',
  'src/rco/loop-orchestrator.ts',
  'src/rco/team-cli.ts',
  'src/cli/dispatch.ts',
  'src/cli/program.ts',
  'src/index.ts',
  'bin/roland.js',
];

let failed = 0;

function fail(msg) {
  console.error(`❌ ${msg}`);
  failed += 1;
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

// ── Version consistency ───────────────────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
ok(`package.json version: ${version}`);

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
if (!changelog.includes(`## [${version}]`)) {
  fail(`CHANGELOG.md missing section for [${version}]`);
} else {
  ok(`CHANGELOG.md has [${version}] section`);
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf-8');
if (!readme.includes(`v${version}`)) {
  fail(`README.md does not mention v${version}`);
} else {
  ok(`README.md references v${version}`);
}

// ── Hot-path TODO scan ────────────────────────────────────────────────────────

for (const rel of HOT_PATH_FILES) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const content = fs.readFileSync(abs, 'utf-8');
  const todoMatches = content.match(/\bTODO\b/g);
  if (todoMatches?.length) {
    fail(`${rel}: ${todoMatches.length} TODO(s) in hot path`);
  } else {
    ok(`${rel}: no TODO markers`);
  }
}

// ── Required artifacts ────────────────────────────────────────────────────────

for (const rel of ['CHANGELOG.md', 'ONBOARDING.md', 'config.yaml', '.github/workflows/release.yml']) {
  if (fs.existsSync(path.join(root, rel))) {
    ok(`${rel} present`);
  } else {
    fail(`Missing ${rel}`);
  }
}

console.log('');
if (failed > 0) {
  console.error(`Pre-release check failed: ${failed} issue(s).`);
  process.exit(1);
}
console.log('Pre-release checks passed.');
