#!/usr/bin/env node
/**
 * roland-setup — One-command setup for Roland Code Orchestrator
 *
 * Usage:
 *   npx roland-setup
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import prompts from 'prompts';
import chalk from 'chalk';

const VERSION = '0.1.0';
const ROLAND_REPO = 'https://github.com/AdamMcIntosh/roland.git';
const ROLAND_DIR = path.join(os.homedir(), '.roland', 'roland');
const ROLAND_CONFIG_PATH = path.join(os.homedir(), '.roland', 'config.yaml');
const IS_WIN = process.platform === 'win32';

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(msg + '\n');
}

function success(msg: string) {
  log(chalk.green('  ✓ ' + msg));
}

function warn(msg: string) {
  log(chalk.yellow('  ! ' + msg));
}

function error(msg: string) {
  log(chalk.red('  ✗ ' + msg));
}

function step(msg: string) {
  log(chalk.bold.cyan('\n── ' + msg));
}

function run(cmd: string, cwd?: string): void {
  child_process.execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
}

function runSilent(cmd: string, cwd?: string): string {
  return child_process.execSync(cmd, {
    cwd,
    env: process.env,
  }).toString().trim();
}

// ── Step 1: Banner ────────────────────────────────────────────────────────────

function printBanner() {
  log('');
  log(chalk.bold.magenta('╔═══════════════════════════════════════╗'));
  log(chalk.bold.magenta('║        Roland Setup  v' + VERSION + '           ║'));
  log(chalk.bold.magenta('║   One-command Roland Code Orchestrator ║'));
  log(chalk.bold.magenta('╚═══════════════════════════════════════╝'));
  log('');
}

// ── Step 2: Node.js version check ────────────────────────────────────────────

function checkNodeVersion(): void {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    error(`Node.js >= 18 is required. You have v${process.versions.node}.`);
    error('Download the latest LTS at https://nodejs.org/');
    process.exit(1);
  }
  success(`Node.js v${process.versions.node}`);
}

// ── Step 3: Check for Goose ───────────────────────────────────────────────────

async function checkGoose(): Promise<void> {
  step('Checking for Goose');
  const cmd = IS_WIN ? 'where goose' : 'which goose';
  try {
    runSilent(cmd);
    success('Goose found');
  } catch {
    warn('Goose not found.');
    log(chalk.yellow('  Install it from https://block.github.io/goose/ then re-run this setup.'));
    const { continueAnyway } = await prompts({
      type: 'confirm',
      name: 'continueAnyway',
      message: 'Continue setup without Goose? (you can install it later)',
      initial: true,
    });
    if (!continueAnyway) {
      log('\nSetup cancelled. Install Goose then re-run roland-setup.');
      process.exit(0);
    }
    warn('Continuing without Goose — you can wire it up after installing.');
  }
}

// ── Step 4: Prompt for OpenRouter API key ─────────────────────────────────────

function validateApiKey(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'openrouter.ai',
        path: '/api/v1/models',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://github.com/AdamMcIntosh/roland',
        },
      },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume(); // drain
      }
    );
    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function promptApiKey(): Promise<string | null> {
  step('OpenRouter API Key');
  log(chalk.dim('  Roland uses OpenRouter for model routing. Get a key at https://openrouter.ai/'));

  let apiKey: string | null = null;
  let attempts = 0;

  while (attempts < 3) {
    const { key } = await prompts({
      type: 'password',
      name: 'key',
      message: attempts === 0 ? 'Enter your OpenRouter API key' : 'Try again (or leave blank to skip)',
    });

    if (!key) {
      warn('No API key provided — skipping. Roland will not be able to route models via OpenRouter.');
      return null;
    }

    log(chalk.dim('  Validating key...'));
    const valid = await validateApiKey(key as string);
    if (valid) {
      success('API key validated');
      apiKey = key as string;
      break;
    } else {
      error('Key appears invalid (request returned non-200). Check the key and try again.');
      attempts++;
    }
  }

  if (!apiKey) {
    const { skipKey } = await prompts({
      type: 'confirm',
      name: 'skipKey',
      message: 'Continue without a valid API key?',
      initial: true,
    });
    if (!skipKey) {
      log('\nSetup cancelled.');
      process.exit(0);
    }
    warn('Continuing without API key.');
  }

  return apiKey;
}

// ── Step 5: Clone or update Roland ───────────────────────────────────────────

async function cloneOrUpdateRoland(): Promise<void> {
  step('Roland Installation');

  const rolandParent = path.join(os.homedir(), '.roland');
  if (!fs.existsSync(rolandParent)) {
    fs.mkdirSync(rolandParent, { recursive: true });
  }

  if (fs.existsSync(path.join(ROLAND_DIR, '.git'))) {
    log(chalk.dim(`  Updating existing clone at ${ROLAND_DIR}`));
    try {
      run('git pull', ROLAND_DIR);
      success('Roland updated');
    } catch {
      warn('git pull failed — continuing with existing clone.');
    }
  } else {
    log(chalk.dim(`  Cloning Roland into ${ROLAND_DIR}`));
    try {
      run(`git clone ${ROLAND_REPO} "${ROLAND_DIR}"`);
      success('Roland cloned');
    } catch (err) {
      error(`Clone failed: ${err instanceof Error ? err.message : String(err)}`);
      const { cont } = await prompts({
        type: 'confirm',
        name: 'cont',
        message: 'Continue anyway?',
        initial: false,
      });
      if (!cont) process.exit(1);
    }
  }
}

// ── Step 6: Build Roland ──────────────────────────────────────────────────────

async function buildRoland(): Promise<void> {
  step('Building Roland');
  log(chalk.dim('  Running npm install...'));
  try {
    run('npm install', ROLAND_DIR);
    success('npm install complete');
  } catch (err) {
    error(`npm install failed: ${err instanceof Error ? err.message : String(err)}`);
    const { cont } = await prompts({
      type: 'confirm',
      name: 'cont',
      message: 'Continue anyway?',
      initial: false,
    });
    if (!cont) process.exit(1);
    return;
  }

  log(chalk.dim('  Running npm run build...'));
  try {
    run('npm run build', ROLAND_DIR);
    success('Build complete');
  } catch (err) {
    error(`Build failed: ${err instanceof Error ? err.message : String(err)}`);
    const { cont } = await prompts({
      type: 'confirm',
      name: 'cont',
      message: 'Continue anyway?',
      initial: false,
    });
    if (!cont) process.exit(1);
  }
}

// ── Step 7: Init current project ─────────────────────────────────────────────

async function initProject(): Promise<void> {
  step('Initialising current project');
  const cwd = process.cwd();
  log(chalk.dim(`  Target: ${cwd}`));

  try {
    run(`npm run init -- "${cwd}"`, ROLAND_DIR);
    success('Project initialised');
  } catch (err) {
    error(`Init failed: ${err instanceof Error ? err.message : String(err)}`);
    const { cont } = await prompts({
      type: 'confirm',
      name: 'cont',
      message: 'Continue anyway?',
      initial: true,
    });
    if (!cont) process.exit(1);
  }
}

// ── Step 8: Save config ───────────────────────────────────────────────────────

function mergeYamlKey(existing: string, key: string, value: string): string {
  // Simple line-by-line merge: replace or append a key under its parent section.
  // We handle the specific shape: goose:\n  openrouter_api_key: <value>
  const lines = existing.split('\n');
  let inGoose = false;
  let keyLineIdx = -1;
  let gooseSectionIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^goose:/.test(lines[i])) {
      inGoose = true;
      gooseSectionIdx = i;
      continue;
    }
    if (inGoose) {
      if (/^\S/.test(lines[i]) && !/^\s/.test(lines[i])) {
        // New top-level key — left goose section
        inGoose = false;
      } else if (new RegExp(`^\\s+${key}:`).test(lines[i])) {
        keyLineIdx = i;
        break;
      }
    }
  }

  if (keyLineIdx !== -1) {
    lines[keyLineIdx] = `  ${key}: "${value}"`;
    return lines.join('\n');
  }

  if (gooseSectionIdx !== -1) {
    lines.splice(gooseSectionIdx + 1, 0, `  ${key}: "${value}"`);
    return lines.join('\n');
  }

  // No goose section at all — append one
  return existing.trimEnd() + `\ngoose:\n  ${key}: "${value}"\n`;
}

function saveConfig(apiKey: string | null): void {
  if (!apiKey) return;

  step('Saving configuration');

  const configDir = path.join(os.homedir(), '.roland');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  let content: string;
  if (fs.existsSync(ROLAND_CONFIG_PATH)) {
    content = fs.readFileSync(ROLAND_CONFIG_PATH, 'utf-8');
    content = mergeYamlKey(content, 'openrouter_api_key', apiKey);
  } else {
    content = [
      '# Roland configuration',
      '# Auto-generated by roland-setup',
      '',
      'goose:',
      `  openrouter_api_key: "${apiKey}"`,
      '',
    ].join('\n');
  }

  fs.writeFileSync(ROLAND_CONFIG_PATH, content, 'utf-8');
  success(`Config saved to ${ROLAND_CONFIG_PATH}`);
}

// ── Step 9: Success summary ───────────────────────────────────────────────────

function printSummary(apiKey: string | null): void {
  log('');
  log(chalk.bold.green('═══════════════════════════════════════'));
  log(chalk.bold.green('  Roland setup complete!'));
  log(chalk.bold.green('═══════════════════════════════════════'));
  log('');
  log(chalk.bold('What was set up:'));
  log(`  • Roland cloned/updated at ${chalk.cyan(ROLAND_DIR)}`);
  log(`  • Current project initialised with agent configs and MCP settings`);
  if (apiKey) {
    log(`  • OpenRouter API key saved to ${chalk.cyan(ROLAND_CONFIG_PATH)}`);
  }
  log('');
  log(chalk.bold('Next steps:'));
  log('  1. Open this project in Cursor or VS Code');
  log('  2. Verify: ask your IDE agent to "Use the health_check tool"');
  log('     You should get: ' + chalk.green('status: healthy'));
  log('  3. Start a Goose session:');
  log('     ' + chalk.cyan('goose session'));
  log('  4. Try a recipe:');
  log('     ' + chalk.cyan('goose run --recipe ~/.roland/roland/goose/recipes/roland-plan-exec-rev-ex.yaml --task "..."'));
  log('');
  log(chalk.dim('  Docs: https://github.com/AdamMcIntosh/roland'));
  log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  printBanner();

  step('Checking environment');
  checkNodeVersion();

  await checkGoose();

  const apiKey = await promptApiKey();

  await cloneOrUpdateRoland();
  await buildRoland();
  await initProject();
  saveConfig(apiKey);

  printSummary(apiKey);
}

main().catch((err) => {
  error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
