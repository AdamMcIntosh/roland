#!/usr/bin/env node
/**
 * Roland CLI entry point.
 *
 * Primary commands:
 *   roland "goal"       Run a PM team on a goal (shortcut for `roland team`)
 *   roland team         PM-first parallel agent execution with live TUI
 *   roland watch        Monitor git commits / file changes; auto-run on change
 *   roland pr [number]  Review (and optionally fix) a GitHub PR via `gh`
 *   roland status       Live TUI observer for a running job
 *
 * Utility commands:
 *   roland serve        Start the stdio MCP server (default when no subcommand)
 *   roland mcp-config   Print / merge the ~/.cursor/mcp.json entry
 *   roland doctor       Diagnose the install
 *   roland pm-log       Print the PM event timeline for the current project
 *
 * Global environment:
 *   ROLAND_NOTIFY=1     Enable desktop/webhook notifications for all commands
 *   CURSOR_API_KEY      Required for agent execution
 *   ROLAND_AGENT_TIMEOUT_MS  Override agent timeout (default: 25 min)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from './server/mcp-server.js';
import { loadConfig } from './config/config-loader.js';
import { logger } from './utils/logger.js';
import { Roster } from './pm/roster.js';
import { TeamRecipes } from './pm/team-recipes.js';
import { PMEventLog } from './pm/event-log.js';
import { renderTimeline } from './pm/render.js';

const CURSOR_CONFIG = path.join(os.homedir(), '.cursor', 'mcp.json');
const ROLAND_ENTRY = { command: 'roland', args: ['serve'] };

async function serve(): Promise<void> {
  logger.info('🚀 Starting Roland MCP Server v2...');
  const config = await loadConfig();
  logger.info('✅ Configuration loaded');
  const server = new McpServer(config);
  await server.start();
  logger.info('🔗 Waiting for client connection...');

  const shutdown = async () => {
    logger.info('\n📡 Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function mcpConfig(write: boolean): void {
  const block = { mcpServers: { roland: ROLAND_ENTRY } };
  if (!write) {
    console.log('Add this to ~/.cursor/mcp.json (merge into any existing mcpServers):\n');
    console.log(JSON.stringify(block, null, 2));
    console.log('\nThen restart Cursor. Or run `roland mcp-config --write` to merge it automatically.');
    return;
  }
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(CURSOR_CONFIG, 'utf-8'));
  } catch {
    // No config yet — create one.
  }
  const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
  servers.roland = ROLAND_ENTRY;
  existing.mcpServers = servers;
  fs.mkdirSync(path.dirname(CURSOR_CONFIG), { recursive: true });
  fs.writeFileSync(CURSOR_CONFIG, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  console.log(`✅ Merged the "roland" MCP server into ${CURSOR_CONFIG}. Restart Cursor to activate.`);
}

function doctor(): void {
  const checks: Array<{ ok: boolean; label: string; hint?: string }> = [];
  const add = (ok: boolean, label: string, hint?: string) => checks.push({ ok, label, hint });

  // dist build present (this file is running, so the dir it lives in exists)
  const here = path.dirname(fileURLToPath(import.meta.url));
  add(fs.existsSync(here), `Build present (${here})`);

  // agents/
  const agentsDir = Roster.resolveAgentsDir();
  const agentCount = (() => {
    try {
      return fs.readdirSync(agentsDir).filter((f) => f.endsWith('.yaml')).length;
    } catch {
      return 0;
    }
  })();
  add(agentCount > 0, `Engineer personas: ${agentCount} in ${agentsDir}`, agentCount === 0 ? 'Run npm run build to copy agents/.' : undefined);

  // recipes/teams/
  const teamsDir = TeamRecipes.resolveTeamsDir();
  const recipeCount = new TeamRecipes(teamsDir).list().length;
  add(recipeCount > 0, `Team recipes: ${recipeCount} in ${teamsDir}`, recipeCount === 0 ? 'Run npm run build to copy recipes/.' : undefined);

  // ~/.cursor/mcp.json has roland
  let hasEntry = false;
  try {
    const cfg = JSON.parse(fs.readFileSync(CURSOR_CONFIG, 'utf-8'));
    hasEntry = Boolean(cfg?.mcpServers?.roland);
  } catch {
    hasEntry = false;
  }
  add(hasEntry, `Cursor MCP entry in ${CURSOR_CONFIG}`, hasEntry ? undefined : 'Run `roland mcp-config --write`.');

  // .roland write access in cwd
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

  console.log('🩺 Roland doctor\n');
  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '❌'} ${c.label}`);
    if (!c.ok && c.hint) console.log(`   → ${c.hint}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  if (failed > 0) process.exit(1);
}

function pmLog(limit: number): void {
  const events = new PMEventLog().tail(limit);
  console.log(renderTimeline(events).replace(/^## /gm, '# '));
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const d = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const cy = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const ln = (s = '') => console.error(s);

  ln();
  ln('  ' + b('🚀  Roland') + '  — PM-first AI Engineering Team');
  ln();
  ln('  ' + b('USAGE'));
  ln(`    ${cy('roland')} ${b('"goal"')}                      Run a PM team on a goal ${d('(shortcut)')}`);
  ln(`    ${cy('roland')} ${b('team')} "goal"               Run a PM team with live dashboard`);
  ln(`    ${cy('roland')} ${b('watch')}                      Watch git commits, auto-run on change`);
  ln(`    ${cy('roland')} ${b('pr')} [number]               Review (and optionally fix) a GitHub PR`);
  ln(`    ${cy('roland')} ${b('status')}                     Live dashboard for a running job`);
  ln();
  ln('  ' + b('OPTIONS') + '  ' + d('(team / watch / pr)'));
  ln(`    ${b('--notify')}, -n               Desktop notification on complete`);
  ln(`    ${b('--webhook')} <url>            POST to URL on complete ${d('(ntfy.sh, Slack, Discord…)')}`);
  ln(`    ${b('--state-dir')} <dir>          Persistence directory  ${d('(default: .roland)')}`);
  ln(`    ${b('--quiet')}, -q               Suppress progress; only print synthesis to stdout`);
  ln(`    ${b('--no-tui')}                  Scrolling log instead of live dashboard`);
  ln(`    ${b('--simple-tui')}, --no-fancy  Simple ASCII output for mobile SSH / limited terminals`);
  ln();
  ln('  ' + b('TEAM FLAGS'));
  ln(`    ${b('--stream')}, -s              Print task output snippets as each agent completes`);
  ln();
  ln('  ' + b('WATCH FLAGS'));
  ln(`    ${b('--task')} "description"       Fixed goal instead of commit message`);
  ln(`    ${b('--pattern')} "src/**/*.ts"   Watch file changes instead of git commits`);
  ln(`    ${b('--interval')} <sec>           Poll interval  ${d('(default: 60)')}`);
  ln(`    ${b('--once')}                    Run once on first change, then exit`);
  ln();
  ln('  ' + b('PR FLAGS'));
  ln(`    ${b('--fix')}                     Review + commit + push fixes`);
  ln(`    ${b('--branch')} <name>            Create a named branch for fixes`);
  ln();
  ln('  ' + b('BACKGROUND MODE'));
  ln(`    ${cy('roland')} team "goal" ${b('--background')}   Run detached; returns immediately`);
  ln(`    ${cy('roland')} ${b('bg-status')}                  Show if a background run is active`);
  ln(`    ${cy('roland')} ${b('bg-logs')}                    Tail the most recent background log`);
  ln(`    ${cy('roland')} ${b('bg-stop')}                    Kill the background run`);
  ln();
  ln('  ' + b('HUMAN-IN-THE-LOOP') + '  ' + d('(while a run is active)'));
  ln(`    ${cy('roland')} ${b('pause')}                      Pause before the next wave`);
  ln(`    ${cy('roland')} ${b('resume')}                     Resume a paused run`);
  ln(`    ${cy('roland')} ${b('unblock')} <task-id> [msg]    Send guidance to a blocked agent`);
  ln(`    ${cy('roland')} ${b('inject')} "directive"         Post a directive to the Lead PM`);
  ln(`    ${cy('roland')} ${b('replan')}                     Ask PM to re-evaluate the plan`);
  ln(`    ${cy('roland')} ${b('abort')}                      Stop the run after current wave`);
  ln();
  ln('  ' + b('UTILITY COMMANDS'));
  ln(`    ${cy('roland')} doctor              Diagnose your Roland install`);
  ln(`    ${cy('roland')} pm-log              Print the PM event timeline`);
  ln(`    ${cy('roland')} mcp-config          Print Cursor MCP config entry`);
  ln(`    ${cy('roland')} serve               Start the MCP server (Cursor / VS Code)`);
  ln();
  ln('  ' + b('ENVIRONMENT'));
  ln(`    ${b('ROLAND_NOTIFY=1')}            Enable notifications for all commands`);
  ln(`    ${b('ROLAND_SIMPLE_TUI=1')}        Simple ASCII output  ${d('(mobile SSH, Termius, limited terminals)')}`);
  ln(`    ${b('CURSOR_API_KEY')}             Required for agent execution`);
  ln(`    ${b('ROLAND_AGENT_TIMEOUT_MS')}    Agent timeout  ${d('(default: 25 min)')}`);
  ln(`    ${b('ROLAND_AGENT_RETRIES')}       Max retries per agent  ${d('(default: 2)')}`);
  ln();
  ln('  ' + b('EXAMPLES'));
  ln(`    ${d('# Run a team session')}`);
  ln(`    roland "add rate limiting to the Express API"`);
  ln();
  ln(`    ${d('# Watch git and notify on phone via ntfy')}`);
  ln(`    roland watch --webhook https://ntfy.sh/my-alerts`);
  ln();
  ln(`    ${d('# Review a PR and push fixes')}`);
  ln(`    roland pr 42 --fix --notify`);
  ln();
  ln(`    ${d('# Always notify (set once in shell profile)')}`);
  ln(`    export ROLAND_NOTIFY=1`);
  ln();
}

// ── Known subcommands (used for bare-goal shortcut detection) ─────────────────

const KNOWN_CMDS = new Set([
  'serve', 'mcp-config', 'doctor', 'pm-log',
  'team', 'status', 'watch', 'pr',
  // HITL controls
  'pause', 'resume', 'unblock', 'inject', 'replan', 'abort',
  // Background supervisor
  'bg-status', 'bg-logs', 'bg-stop',
  '--help', '-h', '--version',
]);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // --help / -h (check before any parsing)
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0 && process.stdin.isTTY) {
    // Only show help for -h/--help; no-arg case still starts the MCP server.
    if (argv.includes('--help') || argv.includes('-h')) {
      printHelp();
      process.exit(0);
    }
  }

  let [cmd, ...rest] = argv;

  // `roland "goal"` shortcut: bare non-flag string that isn't a known subcommand
  if (cmd && !cmd.startsWith('-') && !KNOWN_CMDS.has(cmd)) {
    rest = [cmd, ...rest];
    cmd = 'team';
  }

  // Global --notify: inject into team/watch/pr when ROLAND_NOTIFY env var is set
  const globalNotify = process.env.ROLAND_NOTIFY === '1' || process.env.ROLAND_NOTIFY === 'true';
  if (globalNotify && ['team', 'watch', 'pr'].includes(cmd) && !rest.includes('--notify') && !rest.includes('-n')) {
    rest = ['--notify', ...rest];
  }

  try {
    switch (cmd) {
      case undefined:
      case 'serve':
        await serve();
        break;
      case 'mcp-config':
        mcpConfig(rest.includes('--write'));
        break;
      case 'doctor':
        doctor();
        break;
      case 'pm-log': {
        const idx = rest.indexOf('--limit');
        const limit = idx >= 0 ? Number(rest[idx + 1]) || 50 : 50;
        pmLog(limit);
        break;
      }
      case 'team': {
        const { runTeamCli } = await import('./rco/team-cli.js');
        await runTeamCli(['team', ...rest]);
        break;
      }
      case 'status': {
        const stateDir    = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const simpleFlag  = rest.includes('--simple-tui') || rest.includes('--no-fancy');
        const { isSimpleTui, SimpleTuiRenderer } = await import('./dashboard/simple-tui.js');
        if (simpleFlag || isSimpleTui()) {
          await SimpleTuiRenderer.watch(stateDir);
        } else {
          const { TuiRenderer } = await import('./dashboard/tui.js');
          await TuiRenderer.watch(stateDir);
        }
        break;
      }
      case 'watch': {
        const { runWatchCli } = await import('./rco/watch-cli.js');
        await runWatchCli(['watch', ...rest]);
        break;
      }
      case 'pr': {
        const { runPrCli } = await import('./rco/pr-cli.js');
        await runPrCli(['pr', ...rest]);
        break;
      }

      // ── HITL controls ───────────────────────────────────────────────────────
      case 'pause': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand } = await import('./rco/hitl.js');
        writeHitlCommand(stateDir, { cmd: 'pause' });
        console.error('⏸  Pause sent — run will pause before the next wave starts.');
        console.error('   Resume with: roland resume');
        break;
      }
      case 'resume': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand } = await import('./rco/hitl.js');
        writeHitlCommand(stateDir, { cmd: 'resume' });
        console.error('▶  Resume sent — run will continue shortly.');
        break;
      }
      case 'unblock': {
        // roland unblock <task-id> [message...] [--state-dir X]
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const sdIdx    = rest.indexOf('--state-dir');
        const filtered = sdIdx >= 0 ? [...rest.slice(0, sdIdx), ...rest.slice(sdIdx + 2)] : rest;
        const taskId   = filtered[0];
        const message  = filtered.slice(1).join(' ') || undefined;
        if (!taskId) {
          console.error('Usage: roland unblock <task-id> [message]');
          process.exit(1);
        }
        const { writeHitlCommand } = await import('./rco/hitl.js');
        writeHitlCommand(stateDir, { cmd: 'unblock', taskId, message });
        console.error(`↑  Unblock sent for task: ${taskId}${message ? ` — "${message}"` : ''}`);
        break;
      }
      case 'inject': {
        // roland inject "directive text" [--state-dir X]
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const sdIdx    = rest.indexOf('--state-dir');
        const filtered = sdIdx >= 0 ? [...rest.slice(0, sdIdx), ...rest.slice(sdIdx + 2)] : rest;
        const text     = filtered.join(' ').replace(/^['"]|['"]$/g, '');
        if (!text) {
          console.error('Usage: roland inject "directive text for the PM"');
          process.exit(1);
        }
        const { writeHitlCommand } = await import('./rco/hitl.js');
        writeHitlCommand(stateDir, { cmd: 'inject', text });
        console.error(`💉 Injected: "${text.slice(0, 80)}"`);
        console.error('   The Lead PM will see this directive on the next wave review.');
        break;
      }
      case 'replan': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand } = await import('./rco/hitl.js');
        writeHitlCommand(stateDir, { cmd: 'replan' });
        console.error('🔄 Replan requested — Lead PM will re-evaluate remaining tasks on the next wave review.');
        break;
      }
      case 'abort': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand } = await import('./rco/hitl.js');
        writeHitlCommand(stateDir, { cmd: 'abort' });
        console.error('🛑 Abort sent — run will stop after the current wave completes.');
        console.error('   For an immediate kill, use: roland bg-stop');
        break;
      }

      // ── Background supervisor ───────────────────────────────────────────────
      case 'bg-status': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { bgStatus } = await import('./rco/supervisor.js');
        bgStatus(stateDir);
        break;
      }
      case 'bg-logs': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const linesIdx = rest.indexOf('--lines');
        const lines    = linesIdx >= 0 ? Number(rest[linesIdx + 1]) || 50 : 50;
        const { bgLogs } = await import('./rco/supervisor.js');
        bgLogs(stateDir, lines);
        break;
      }
      case 'bg-stop': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { bgStop } = await import('./rco/supervisor.js');
        bgStop(stateDir);
        break;
      }

      default:
        console.error(`Unknown command: ${cmd}. Run \`roland --help\` for usage.`);
        process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    console.error(error);
    process.exit(1);
  }
}

main();
