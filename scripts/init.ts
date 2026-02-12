#!/usr/bin/env node
/**
 * roland init — Set up Roland in any project directory.
 *
 * Usage:
 *   npx roland init                  # init current directory
 *   npx roland init /path/to/project # init a specific directory
 *
 * Or from the roland repo:
 *   npx tsx scripts/init.ts [target-dir]
 *
 * What it does:
 *   1. Exports agent configs (.github/agents/, .cursor/rules/)
 *   2. Generates IDE MCP configs (.vscode/mcp.json, .cursor/mcp.json)
 *      with absolute paths pointing back to this Roland installation
 *   3. Generates .github/copilot-instructions.md
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rolandRoot = path.resolve(__dirname, '..');

function main() {
  const targetDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.cwd();

  // Verify roland is built
  const distIndex = path.join(rolandRoot, 'dist', 'index.js');
  if (!fs.existsSync(distIndex)) {
    console.error('❌ Roland is not built. Run this first:');
    console.error(`   cd ${rolandRoot} && npm run build`);
    process.exit(1);
  }

  console.log(`\n🤖 Roland Init`);
  console.log(`   Roland:   ${rolandRoot}`);
  console.log(`   Target:   ${targetDir}\n`);

  // Run export-ide-configs with --target
  const exportScript = path.join(rolandRoot, 'scripts', 'export-ide-configs.ts');
  try {
    execSync(
      `npx tsx "${exportScript}" --target "${targetDir}"`,
      { cwd: rolandRoot, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('\n❌ Init failed. See errors above.');
    process.exit(1);
  }

  console.log(`\n🎉 Roland is ready in ${targetDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open ${targetDir} in Cursor or VS Code`);
  console.log(`  2. Verify MCP server: Settings → MCP (Cursor) or MCP: List Servers (VS Code)`);
  console.log(`  3. In chat, try: "Use the health_check tool"`);
}

main();
