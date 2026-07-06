/**
 * Transform copied team-orchestrator into legacy-pm-engine.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcFile = path.join(root, 'src/rco/team-orchestrator.ts');
const destFile = path.join(root, 'src/legacy/pm-team/legacy-pm-engine.ts');

let src = fs.readFileSync(srcFile, 'utf8');

src = src
  .replace(/\.\.\/utils\//g, '../../utils/')
  .replace(/\.\.\/coordination\//g, '../../coordination/')
  .replace(/\.\.\/loop-engine\//g, '../../loop-engine/')
  .replace(/\.\.\/models\//g, '../../models/')
  .replace(/from '\.\//g, "from '../../rco/");

// Drop router-only imports
src = src.replace(
  /import \{ hasLoopTemplate, runClosedLoopMission \} from '\.\.\/\.\.\/rco\/loop-orchestrator\.js';\n/,
  '',
);

// Remove runTeam wrapper entirely
src = src.replace(
  /\/\/ ── Main export ──[\s\S]*?^async function runTeamInner/m,
  'async function runLegacyPmTeam',
);
src = src.replace('async function runLegacyPmTeam', 'export async function runLegacyPmTeam');

// Remove ClosedLoop early return inside legacy engine
src = src.replace(
  /\n  \/\/ Loop Engineering pivot — ClosedLoop is the single source of truth for loop-template missions\.\n  if \(hasLoopTemplate\(loopTemplate\)\) \{\n    return runClosedLoopMission\(opts\);\n  \}\n/,
  '\n',
);

// Hygiene label without hasLoopTemplate
src = src.replace(
  /const label = hasLoopTemplate\(loopTemplate\) \? '\[Loop\]' : '\[Team\]'/g,
  "const label = '[Team]'",
);

// Remove configureSdkProcessLimits side effect (router owns this)
src = src.replace(
  /\/\/ Team CLI and supervisor import this module directly \(not via index\.ts\)\.\nconfigureSdkProcessLimits\(\);\n/,
  '',
);

// Remove trailing router comment block
src = src.replace(
  /\n\/\*\*\n \* ## Final Legacy Cleanup[\s\S]*$/,
  '\n',
);

const header = `/**
 * ## P1 Final Consolidation (v1.4.0)
 *
 * [DEPRECATED] Legacy PM Team engine — plan → waves → synthesis.
 * Opt-in via \`roland team "goal" --legacy-pm\` only.
 * Scheduled for removal in v1.6.0 — use Pure ClosedLoop (\`--loop-template\`) instead.
 */

`;

src = src.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, header);

fs.writeFileSync(destFile, src);
console.log('legacy-pm-engine.ts written:', src.split('\n').length, 'lines');
