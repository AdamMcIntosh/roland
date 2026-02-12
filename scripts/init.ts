#!/usr/bin/env node
/**
 * samwise init — Set up Samwise in any project directory.
 *
 * Usage:
 *   npx samwise init                  # init current directory
 *   npx samwise init /path/to/project # init a specific directory
 *
 * Or from the samwise repo:
 *   npx tsx scripts/init.ts [target-dir]
 *
 * What it does:
 *   1. Exports agent configs (.github/agents/, .cursor/rules/)
 *   2. Generates IDE MCP configs (.vscode/mcp.json, .cursor/mcp.json)
 *      with absolute paths pointing back to this Samwise installation
 *   3. Generates .github/copilot-instructions.md
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const samwiseRoot = path.resolve(__dirname, '..');

function main() {
  const targetDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.cwd();

  // Verify samwise is built
  const distIndex = path.join(samwiseRoot, 'dist', 'index.js');
  if (!fs.existsSync(distIndex)) {
    console.error('❌ Samwise is not built. Run this first:');
    console.error(`   cd ${samwiseRoot} && npm run build`);
    process.exit(1);
  }

  console.log(`\n🧙 Samwise Init`);
  console.log(`   Samwise:  ${samwiseRoot}`);
  console.log(`   Target:   ${targetDir}\n`);

  // Run export-ide-configs with --target
  const exportScript = path.join(samwiseRoot, 'scripts', 'export-ide-configs.ts');
  try {
    execSync(
      `npx tsx "${exportScript}" --target "${targetDir}"`,
      { cwd: samwiseRoot, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('\n❌ Init failed. See errors above.');
    process.exit(1);
  }

  console.log(`\n🎉 Samwise is ready in ${targetDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open ${targetDir} in Cursor or VS Code`);
  console.log(`  2. Verify MCP server: Settings → MCP (Cursor) or MCP: List Servers (VS Code)`);
  console.log(`  3. In chat, try: "Use the health_check tool"`);
}

main();
