#!/usr/bin/env node
/**
 * Standalone PR cleanup script — formats legacy Roland PR titles and descriptions.
 *
 * Usage (after build):
 *   npm run build
 *   node scripts/pr-cleanup.ts              # dry-run batch scan
 *   node scripts/pr-cleanup.ts --apply      # apply via gh pr edit
 *   node scripts/pr-cleanup.ts --current    # current branch PR only
 *   node scripts/pr-cleanup.ts --goal "Implement rate limiting"  # preview without gh
 *
 * Equivalent: roland pr-cleanup [--apply] [--current] [--body]
 *
 * @see docs/guides/pr-title-convention.md
 */

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const builtCli = join(root, 'dist/rco/pr-cleanup-cli.js');

async function main(): Promise<void> {
  if (!existsSync(builtCli)) {
    process.stderr.write(
      '\n  Build required before running with node:\n'
      + '    npm run build\n'
      + '    node scripts/pr-cleanup.ts --apply\n\n'
      + '  Or use tsx without building:\n'
      + '    npx tsx scripts/pr-cleanup.ts --apply\n\n',
    );
    process.exit(1);
  }

  const builtUrl = new URL(`file:///${builtCli.replace(/\\/g, '/')}`);
  const { runPrCleanupCli } = await import(builtUrl.href) as {
    runPrCleanupCli: (argv: string[]) => void;
  };
  runPrCleanupCli(['pr-cleanup', ...process.argv.slice(2)]);
}

main().catch((e: unknown) => {
  process.stderr.write(`\n❌ pr-cleanup failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
