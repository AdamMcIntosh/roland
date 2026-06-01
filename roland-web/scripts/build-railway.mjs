/**
 * Railway build orchestrator — runs from roland-web/ (Railway rootDirectory).
 * Uses explicit cwd options so there are no shell `cd` working-directory assumptions.
 */
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot  = resolve(__dirname, '..');
const repoRoot = resolve(webRoot,   '..');

function run(cmd, cwd) {
  console.log(`\n[railway-build] ${cmd}  (${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// 1. Compile Roland core TypeScript → dist/
// `npm install` (not `npm ci`) because the repo root package-lock.json may not
// be committed — install generates it if missing; ci would error without it.
run('npm install',   repoRoot);
run('npm run build', repoRoot);

// 2. Sync dist/ + agents/ + recipes/ into roland-web/@roland-core/
run('node scripts/setup-core.mjs', webRoot);

// 3. Reinstall roland-web deps so the @roland/core binary resolves correctly.
// `npm ci` (not `npm install`) because roland-web has a committed lockfile and
// we want a clean, reproducible install — not an accidental upgrade.
run('npm ci', webRoot);

// 4. Build Next.js app + compile server TypeScript
run('npm run build', webRoot);
