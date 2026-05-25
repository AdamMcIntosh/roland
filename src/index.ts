#!/usr/bin/env node
/**
 * Roland MCP Server Entry Point + CLI.
 *
 * Subcommands (Phase 4):
 *   roland serve        Start the stdio MCP server (default if no subcommand).
 *   roland mcp-config    Print the ~/.cursor/mcp.json entry. --write merges it in.
 *   roland doctor        Diagnose the install (binary, assets, Cursor config, .roland write).
 *   roland pm-log        Print the PM event timeline for the current project.
 *
 * Only `serve` speaks the JSON-RPC protocol on stdout; the CLI subcommands print
 * human output and exit, so they are free to use stdout/console.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
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
  const here = path.dirname(new URL(import.meta.url).pathname);
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

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
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
        // Delegate to the team CLI — import is safe because team-cli.ts guards
        // its main() with a fileURLToPath(import.meta.url) === process.argv[1] check.
        const { runTeamCli } = await import('./rco/team-cli.js');
        await runTeamCli(['team', ...rest]);
        break;
      }
      case 'status': {
        // Live TUI observer — watches .roland/run-state.json from a separate terminal.
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { TuiRenderer } = await import('./dashboard/tui.js');
        await TuiRenderer.watch(stateDir);
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}\nUsage: roland [serve|mcp-config|doctor|pm-log|team|status]`);
        process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    console.error(error);
    process.exit(1);
  }
}

main();
