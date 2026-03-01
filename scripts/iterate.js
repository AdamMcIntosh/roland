#!/usr/bin/env node
/**
 * Phase 4: Bump version and append changelog entry.
 * Usage: node scripts/iterate.js [patch|minor|major] "Brief change description"
 * Default: patch bump, description from CLI or "Post-release iteration"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

const bump = process.argv[2] || 'patch';
const description = process.argv[3] || 'Post-release iteration';

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

let nextVersion;
if (bump === 'major') {
  nextVersion = `${major + 1}.0.0`;
} else if (bump === 'minor') {
  nextVersion = `${major}.${minor + 1}.0`;
} else {
  nextVersion = `${major}.${minor}.${patch + 1}`;
}

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`[iterate] Version bumped to ${nextVersion}`);

const changelog = fs.readFileSync(changelogPath, 'utf-8');
const today = new Date().toISOString().slice(0, 10);
const entry = `## [${nextVersion}] - ${today}\n\n### Changed\n- ${description}\n\n`;
const updated = changelog.replace(/\r?\n## \[Unreleased\]/i, `\n## [Unreleased]\n\n${entry}`);
fs.writeFileSync(changelogPath, updated, 'utf-8');
console.log(`[iterate] Changelog updated with ${nextVersion}`);
