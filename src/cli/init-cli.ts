/**
 * roland init — interactive first-run setup for new users.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';
import { loadEnvFiles, writeEnvTemplateIfMissing, ENV_TEMPLATE } from '../utils/env-loader.js';
import { resolveRolandInstallRoot } from '../utils/project-root.js';
import { setConsent, hasConsent, captureMessage } from '../telemetry.js';

export interface InitOptions {
  targetDir?: string;
  nonInteractive?: boolean;
  skipMcp?: boolean;
  skipScaffold?: boolean;
  moduleUrl?: string;
}

export interface InitResult {
  targetDir: string;
  envPath: string;
  envCreated: boolean;
  mcpConfigured: boolean;
  telemetryConsent: boolean;
  scaffoldRan: boolean;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askYesNo(rl: readline.Interface, question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return ask(rl, `${question} (${hint}): `).then((a) => {
    if (!a) return defaultYes;
    return /^y(es)?/i.test(a);
  });
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function writeUserEnv(envPath: string, entries: Record<string, string>): void {
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const lines = ENV_TEMPLATE.split('\n').filter((l) => !l.startsWith('CURSOR_API_KEY='));
  const body = [
    ...lines,
    `CURSOR_API_KEY=${entries.CURSOR_API_KEY ?? ''}`,
  ];
  if (entries.GITHUB_TOKEN) {
    body.push(`GITHUB_TOKEN=${entries.GITHUB_TOKEN}`);
  }
  if (entries.RCO_TELEMETRY_CONSENT) {
    body.push(`RCO_TELEMETRY_CONSENT=${entries.RCO_TELEMETRY_CONSENT}`);
  }
  fs.writeFileSync(envPath, body.join('\n') + '\n', 'utf-8');
}

function applyEnvEntries(entries: Record<string, string>): void {
  for (const [k, v] of Object.entries(entries)) {
    if (v) process.env[k] = v;
  }
}

function runProjectScaffold(installRoot: string, targetDir: string): void {
  const initScript = path.join(installRoot, 'scripts', 'init.ts');
  if (!fs.existsSync(initScript)) {
    console.error('  ⚠️  scripts/init.ts not found — skipping project scaffold');
    return;
  }
  execSync(`npx tsx "${initScript}" "${targetDir}"`, {
    cwd: installRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

function mergeCursorMcp(installRoot: string, projectRoot: string): boolean {
  try {
    const mcpConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const bootstrapPath = path.join(installRoot, 'dist', 'cli', 'dispatch.js');
    if (!fs.existsSync(bootstrapPath)) {
      execSync('roland mcp-config --write', { stdio: 'pipe', cwd: projectRoot });
      return true;
    }
    execSync('roland mcp-config --write', { stdio: 'pipe', cwd: projectRoot });
    return fs.existsSync(mcpConfigPath);
  } catch {
    return false;
  }
}

/**
 * Run interactive or non-interactive Roland setup.
 */
export async function runInit(opts: InitOptions = {}): Promise<InitResult> {
  const moduleUrl = opts.moduleUrl ?? import.meta.url;
  const installRoot = resolveRolandInstallRoot(moduleUrl);
  const targetDir = path.resolve(opts.targetDir ?? process.cwd());
  const userEnvPath = path.join(os.homedir(), '.roland', '.env');
  const projectEnvPath = path.join(targetDir, '.env');

  loadEnvFiles({ projectRoot: targetDir });

  console.log('\n🤖 Roland Init — first-run setup\n');
  console.log(`   Install:  ${installRoot}`);
  console.log(`   Project:  ${targetDir}`);
  console.log(`   Platform: ${process.platform === 'win32' ? 'Windows' : process.platform}\n`);

  let envCreated = false;
  let mcpConfigured = false;
  let telemetryConsent = hasConsent('user');
  let scaffoldRan = false;

  const entries: Record<string, string> = {
    CURSOR_API_KEY: process.env.CURSOR_API_KEY?.trim() ?? '',
  };

  if (opts.nonInteractive) {
    envCreated = writeEnvTemplateIfMissing(userEnvPath);
    if (!entries.CURSOR_API_KEY) {
      writeEnvTemplateIfMissing(projectEnvPath);
    }
    if (!opts.skipMcp) mcpConfigured = mergeCursorMcp(installRoot, targetDir);
    fs.mkdirSync(path.join(targetDir, '.roland'), { recursive: true });
    if (!opts.skipScaffold) {
      runProjectScaffold(installRoot, targetDir);
      scaffoldRan = true;
    }
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      console.log('Step 1 — Cursor API key (required for missions)');
      console.log('  Get yours at: https://cursor.com/settings → API Keys\n');

      if (entries.CURSOR_API_KEY) {
        console.log(`  Found CURSOR_API_KEY in environment (${maskKey(entries.CURSOR_API_KEY)})`);
        const keep = await askYesNo(rl, '  Use this key?', true);
        if (!keep) entries.CURSOR_API_KEY = '';
      }

      if (!entries.CURSOR_API_KEY) {
        entries.CURSOR_API_KEY = await ask(rl, '  Enter CURSOR_API_KEY: ');
      }

      if (!entries.CURSOR_API_KEY) {
        console.error('\n  ❌ CURSOR_API_KEY is required. Re-run roland init after obtaining a key.\n');
        process.exit(1);
      }

      console.log('\nStep 2 — Optional GitHub token (PR automation)');
      const wantGh = await askYesNo(rl, '  Configure GITHUB_TOKEN?', false);
      if (wantGh) {
        entries.GITHUB_TOKEN = await ask(rl, '  Enter GITHUB_TOKEN (or leave blank): ');
      }

      console.log('\nStep 3 — Save to ~/.roland/.env');
      writeUserEnv(userEnvPath, entries);
      envCreated = true;
      applyEnvEntries(entries);
      console.log(`  ✅ Saved ${userEnvPath}`);

      console.log('\nStep 4 — Cursor MCP configuration');
      const wantMcp = !opts.skipMcp && await askYesNo(rl, '  Merge roland into ~/.cursor/mcp.json?', true);
      if (wantMcp) {
        mcpConfigured = mergeCursorMcp(installRoot, targetDir);
        console.log(mcpConfigured ? '  ✅ MCP config updated — restart Cursor' : '  ⚠️  MCP config step failed — run: roland mcp-config --write');
      }

      console.log('\nStep 5 — Telemetry (opt-in error reporting via Sentry)');
      const wantTelemetry = await askYesNo(rl, '  Enable anonymous telemetry?', false);
      if (wantTelemetry) {
        setConsent('user');
        process.env.RCO_TELEMETRY_CONSENT = '1';
        entries.RCO_TELEMETRY_CONSENT = '1';
        telemetryConsent = true;
        writeUserEnv(userEnvPath, entries);
        console.log('  ✅ Telemetry consent saved');
      } else {
        console.log('  Skipped — no telemetry without consent');
      }

      console.log('\nStep 6 — Project scaffold (.roland/, IDE configs)');
      const wantScaffold = !opts.skipScaffold && await askYesNo(rl, '  Scaffold this project for Roland?', true);
      if (wantScaffold) {
        runProjectScaffold(installRoot, targetDir);
        scaffoldRan = true;
      } else {
        fs.mkdirSync(path.join(targetDir, '.roland'), { recursive: true });
      }
    } finally {
      rl.close();
    }
  }

  console.log('\n🎉 Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Restart Cursor (if MCP was configured)');
  console.log('  2. roland doctor --fresh-check');
  console.log('  3. roland team "your first mission" --loop-template small-fix-loop');
  console.log('');

  if (hasConsent('user')) {
    captureMessage('roland init completed', 'info');
  }

  return {
    targetDir,
    envPath: userEnvPath,
    envCreated,
    mcpConfigured,
    telemetryConsent,
    scaffoldRan,
  };
}

/** CLI entry — returns exit code. */
export async function runInitCli(rest: string[]): Promise<number> {
  const nonInteractive = rest.includes('--yes') || rest.includes('-y');
  const skipMcp = rest.includes('--skip-mcp');
  const skipScaffold = rest.includes('--skip-scaffold');
  const targetIdx = rest.findIndex((a) => a === '--target' || a === '--cwd');
  const targetDir = targetIdx >= 0 ? rest[targetIdx + 1] : undefined;

  if (targetIdx >= 0 && !targetDir) {
    console.error('Usage: roland init [--target <dir>] [--yes] [--skip-mcp] [--skip-scaffold]');
    return 1;
  }

  try {
    await runInit({
      targetDir,
      nonInteractive,
      skipMcp,
      skipScaffold,
    });
    return 0;
  } catch (err) {
    console.error('Init failed:', err instanceof Error ? err.message : err);
    return 1;
  }
}
