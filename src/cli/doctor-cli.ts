/**
 * roland doctor — install diagnostics with --fresh-check and --fix modes.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { resolveRolandInstallRoot } from '../utils/project-root.js';
import { readPackageVersion } from '../utils/package-version.js';
import { Roster } from '../pm/roster.js';
import { TeamRecipes } from '../pm/team-recipes.js';
import { loadEnvFiles, writeEnvTemplateIfMissing } from '../utils/env-loader.js';
import { getWorktreeStatus, platformLabel } from '../utils/worktree-guard.js';
import { runLoopReadinessCheck, formatLoopReadinessReport } from '../loop-engine/loop-readiness.js';
import { captureMessage, hasConsent } from '../telemetry.js';
import { buildCursorMcpServerEntry } from '../server/mcp-server.js';

export interface DoctorCheck {
  ok: boolean;
  label: string;
  hint?: string;
}

const CURSOR_CONFIG = path.join(os.homedir(), '.cursor', 'mcp.json');

/** Verify @cursor/sdk is installable for `roland team` on this platform. */
function checkCursorSdkRuntime(installRoot: string): DoctorCheck {
  const platform = process.platform;
  const arch = process.arch;
  const abi = process.versions.modules;
  const sdkPkgPath = path.join(installRoot, 'node_modules', '@cursor', 'sdk', 'package.json');
  const sdkDist = path.join(installRoot, 'node_modules', '@cursor', 'sdk', 'dist');

  if (!fs.existsSync(sdkPkgPath)) {
    return {
      ok: false,
      label: `@cursor/sdk (${platform}/${arch}, Node ABI ${abi})`,
      hint: 'Run `npm ci` from the Roland install root.',
    };
  }

  let sdkMeta: { optionalDependencies?: Record<string, string> } = {};
  try {
    sdkMeta = JSON.parse(fs.readFileSync(sdkPkgPath, 'utf-8')) as typeof sdkMeta;
  } catch {
    // Fall through.
  }

  const platformPkgName = `@cursor/sdk-${platform}-${arch}`;
  if (sdkMeta.optionalDependencies?.[platformPkgName]) {
    const platformDir = path.join(installRoot, 'node_modules', '@cursor', `sdk-${platform}-${arch}`);
    const platformOk = fs.existsSync(path.join(platformDir, 'package.json'));
    return {
      ok: platformOk,
      label: `@cursor/sdk platform package (${platformPkgName})`,
      hint: platformOk ? undefined : `Run \`npm ci\` from repo root to install ${platformPkgName}.`,
    };
  }

  const sqliteRoot = path.join(installRoot, 'node_modules', 'sqlite3');
  if (fs.existsSync(path.join(sqliteRoot, 'package.json'))) {
    const sqliteBinding = path.join(sqliteRoot, 'lib', 'binding', `node-v${abi}-${platform}-${arch}`, 'node_sqlite3.node');
    const sqliteRelease = path.join(sqliteRoot, 'build', 'Release', 'node_sqlite3.node');
    const sqliteOk = fs.existsSync(sqliteBinding) || fs.existsSync(sqliteRelease);
    return {
      ok: sqliteOk,
      label: `@cursor/sdk sqlite3 binding (${platform}/${arch}, Node ABI ${abi})`,
      hint: sqliteOk
        ? undefined
        : 'Install VS "Desktop development with C++", then `npm rebuild sqlite3`.',
    };
  }

  const distOk = fs.existsSync(sdkDist);
  return {
    ok: distOk,
    label: `@cursor/sdk (${platform}/${arch}, Node ABI ${abi})`,
    hint: distOk ? undefined : 'Run `npm ci` from the Roland install root.',
  };
}

function cursorApiKeyHint(): string {
  const plat = platformLabel();
  if (process.platform === 'win32') {
    return [
      `Set in PowerShell profile ($PROFILE) or ~/.roland/.env:`,
      '  $env:CURSOR_API_KEY = "your_key_here"   # current session',
      '  [System.Environment]::SetEnvironmentVariable("CURSOR_API_KEY","your_key", "User")',
      'Or run: roland init',
      'Get a key: https://cursor.com/settings → API Keys',
    ].join('\n     ');
  }
  return [
    `Set in shell profile (.zshrc / .bashrc) or ~/.roland/.env:`,
    '  export CURSOR_API_KEY=your_key_here',
    'Or run: roland init',
    'Get a key: https://cursor.com/settings → API Keys',
  ].join('\n     ');
}

export function collectDoctorChecks(moduleUrl: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const add = (ok: boolean, label: string, hint?: string) => checks.push({ ok, label, hint });

  loadEnvFiles({ projectRoot: process.cwd() });

  const version = readPackageVersion(moduleUrl);
  add(true, `Roland version: ${version}`);
  add(true, `Platform: ${platformLabel()}`);

  const nodeMajor = Number(process.version.slice(1).split('.')[0]);
  add(nodeMajor >= 22, `Node.js ${process.version} (requires 22+)`, nodeMajor >= 22 ? undefined : 'Upgrade Node: https://nodejs.org/');

  try {
    execSync('git --version', { stdio: 'pipe' });
    add(true, 'Git available');
  } catch {
    add(false, 'Git not found', 'Install git — required for team runs, watch mode, and PR tools.');
  }

  try {
    const inGit = execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe', cwd: process.cwd() })
      .toString()
      .trim();
    add(inGit === 'true', `Git repo at ${process.cwd()}`, inGit === 'true' ? undefined : 'Run from a git project directory for full Roland features.');
  } catch {
    add(false, `Git repo at ${process.cwd()}`, 'Not inside a git work tree.');
  }

  const wt = getWorktreeStatus(process.cwd());
  if (wt) {
    add(
      !wt.dirty,
      wt.dirty
        ? `Git worktree dirty (${wt.staged.length + wt.unstaged.length + wt.untracked.length} changes) — missions will refuse to start`
        : 'Git worktree clean',
      wt.dirty
        ? 'Commit or stash changes, or use --auto-stash / --force on roland team'
        : undefined,
    );
  }

  const userEnv = path.join(os.homedir(), '.roland', '.env');
  const projectEnv = path.join(process.cwd(), '.env');
  const envFiles: string[] = [];
  if (fs.existsSync(userEnv)) envFiles.push('~/.roland/.env');
  if (fs.existsSync(projectEnv)) envFiles.push('.env');
  add(
    envFiles.length > 0 || Boolean(process.env.CURSOR_API_KEY?.trim()),
    envFiles.length > 0
      ? `Env files: ${envFiles.join(', ')}`
      : 'No .env file found (~/.roland/.env or project .env)',
    envFiles.length === 0 && !process.env.CURSOR_API_KEY?.trim()
      ? 'Run `roland init` or create ~/.roland/.env with CURSOR_API_KEY'
      : undefined,
  );

  const installRoot = resolveRolandInstallRoot(moduleUrl);
  const distDir = path.join(installRoot, 'dist');
  add(fs.existsSync(distDir), `Build present (${distDir})`, fs.existsSync(distDir) ? undefined : 'Run npm run build.');
  const mcpEntry = path.join(distDir, 'server', 'mcp-server.js');
  add(fs.existsSync(mcpEntry), `MCP server entry (${mcpEntry})`, fs.existsSync(mcpEntry) ? undefined : 'Run npm run build.');
  const binEntry = path.join(installRoot, 'bin', 'roland.js');
  add(fs.existsSync(binEntry), `Global CLI shim (${binEntry})`, fs.existsSync(binEntry) ? undefined : 'Missing bin/roland.js — reinstall or npm link from repo.');
  add(true, `Install root: ${installRoot}`);
  add(true, `Project root: ${process.env.ROLAND_PROJECT_ROOT ?? process.cwd()}`);

  const globalRoland = (() => {
    try {
      return execSync(process.platform === 'win32' ? 'where roland' : 'command -v roland', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim().split('\n')[0];
    } catch {
      return null;
    }
  })();
  add(
    Boolean(globalRoland),
    globalRoland ? `roland on PATH (${globalRoland})` : 'roland not found on PATH',
    globalRoland ? undefined : 'Run npm install -g . from the Roland repo, or npm link',
  );

  const agentsDir = Roster.resolveAgentsDir();
  const agentCount = (() => {
    try {
      return fs.readdirSync(agentsDir).filter((f) => f.endsWith('.yaml')).length;
    } catch {
      return 0;
    }
  })();
  add(agentCount > 0, `Engineer personas: ${agentCount} in ${agentsDir}`, agentCount === 0 ? 'Run npm run build to copy agents/.' : undefined);

  const teamsDir = TeamRecipes.resolveTeamsDir();
  const recipeCount = new TeamRecipes(teamsDir).list().length;
  add(recipeCount > 0, `Team recipes: ${recipeCount} in ${teamsDir}`, recipeCount === 0 ? 'Run npm run build to copy recipes/.' : undefined);

  let hasEntry = false;
  try {
    const cfg = JSON.parse(fs.readFileSync(CURSOR_CONFIG, 'utf-8'));
    hasEntry = Boolean(cfg?.mcpServers?.roland);
  } catch {
    hasEntry = false;
  }
  add(hasEntry, `Cursor MCP entry in ${CURSOR_CONFIG}`, hasEntry ? undefined : 'Run `roland mcp-config --write` or `roland init`.');

  let canWrite = false;
  try {
    const dir = path.join(process.cwd(), '.roland');
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.doctor-probe');
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    canWrite = true;
  } catch {
    canWrite = false;
  }
  add(canWrite, `Writable .roland/ in ${process.cwd()}`, canWrite ? undefined : 'Check directory permissions.');

  const sdkCheck = checkCursorSdkRuntime(installRoot);
  add(sdkCheck.ok, sdkCheck.label, sdkCheck.hint);

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  add(
    Boolean(apiKey),
    apiKey
      ? `CURSOR_API_KEY set (${apiKey.slice(0, 4)}…${apiKey.slice(-4)})`
      : 'CURSOR_API_KEY is not set — missions will refuse to start',
    apiKey ? undefined : cursorApiKeyHint(),
  );

  const settleMs = process.env.ROLAND_SDK_SETTLE_MS ?? '3500 (default)';
  const heavySettleMs = process.env.ROLAND_SDK_HEAVY_SETTLE_MS ?? '8000 (default)';
  const terminalWaitMs = process.env.ROLAND_SDK_TERMINAL_WAIT_MS ?? '30000 (default)';
  add(true, `SDK cleanup: ROLAND_SDK_SETTLE_MS=${settleMs}, ROLAND_SDK_HEAVY_SETTLE_MS=${heavySettleMs}`);
  add(
    true,
    `SDK cleanup: ROLAND_SDK_TERMINAL_WAIT_MS=${terminalWaitMs}`,
    'Raise settle if you see [shell-exec] Close event warnings during team runs.',
  );

  return checks;
}

export interface DoctorFixResult {
  actions: string[];
  warnings: string[];
}

/** Auto-fix safe onboarding issues. Never touches git state. */
export function runDoctorFix(moduleUrl: string): DoctorFixResult {
  const actions: string[] = [];
  const warnings: string[] = [];

  const userEnv = path.join(os.homedir(), '.roland', '.env');
  if (writeEnvTemplateIfMissing(userEnv)) {
    actions.push(`Created template ${userEnv} — add your CURSOR_API_KEY`);
  }

  const projectRoland = path.join(process.cwd(), '.roland');
  if (!fs.existsSync(projectRoland)) {
    fs.mkdirSync(projectRoland, { recursive: true });
    actions.push(`Created ${projectRoland}/`);
  }

  const projectEnv = path.join(process.cwd(), '.env');
  if (writeEnvTemplateIfMissing(projectEnv)) {
    actions.push(`Created template ${projectEnv}`);
  }

  try {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(fs.readFileSync(CURSOR_CONFIG, 'utf-8'));
    } catch {
      // New file.
    }
    const installRoot = resolveRolandInstallRoot(moduleUrl);
    const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
    servers.roland = buildCursorMcpServerEntry({
      rolandRoot: installRoot,
      projectRoot: process.env.ROLAND_PROJECT_ROOT?.trim() || process.cwd(),
    });
    existing.mcpServers = servers;
    fs.mkdirSync(path.dirname(CURSOR_CONFIG), { recursive: true });
    fs.writeFileSync(CURSOR_CONFIG, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    actions.push(`Merged roland MCP entry into ${CURSOR_CONFIG}`);
  } catch (err) {
    warnings.push(`MCP config fix failed: ${err instanceof Error ? err.message : err}`);
  }

  if (!process.env.CURSOR_API_KEY?.trim()) {
    warnings.push('CURSOR_API_KEY still unset — run `roland init` to configure interactively');
  }

  const distDir = path.join(resolveRolandInstallRoot(moduleUrl), 'dist');
  if (!fs.existsSync(distDir)) {
    warnings.push('dist/ missing — run `npm run build` from the Roland install directory');
  }

  if (hasConsent('user')) {
    captureMessage('roland doctor --fix', 'info');
  }

  return { actions, warnings };
}

function printChecks(checks: DoctorCheck[]): number {
  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '❌'} ${c.label}`);
    if (!c.ok && c.hint) {
      for (const line of c.hint.split('\n')) {
        console.log(`   → ${line.trim()}`);
      }
    }
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  return failed;
}

/** Run doctor CLI; returns exit code. */
export function runDoctorCli(moduleUrl: string, rest: string[]): number {
  const freshCheck = rest.includes('--fresh-check');
  const fixMode = rest.includes('--fix');

  if (fixMode) {
    console.log('🔧 Roland doctor — fix mode\n');
    const { actions, warnings } = runDoctorFix(moduleUrl);
    for (const a of actions) console.log(`  ✅ ${a}`);
    for (const w of warnings) console.log(`  ⚠️  ${w}`);
    if (actions.length === 0 && warnings.length === 0) {
      console.log('  Nothing to fix.');
    }
    console.log('\nRe-run: roland doctor --fresh-check\n');
  }

  const checks = collectDoctorChecks(moduleUrl);
  const failed = printChecks(checks);

  if (freshCheck) {
    console.log('\n── Fresh-machine / loop readiness ──\n');
    const report = runLoopReadinessCheck();
    console.log(formatLoopReadinessReport(report));
    if (!report.ready) {
      console.log('\n❌ Loop readiness failed — fix errors above before your first mission.');
      return 1;
    }
    console.log('\n✅ Fresh-check passed — ready for first mission.');
  }

  if (hasConsent('user')) {
    captureMessage(`roland doctor${freshCheck ? ' --fresh-check' : ''}${fixMode ? ' --fix' : ''}`, 'info');
  }

  return failed > 0 ? 1 : 0;
}
