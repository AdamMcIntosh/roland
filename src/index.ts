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
 *   roland serve        Start stdio MCP (Cursor) or HTTP MCP with --mcp
 *   roland mcp          Streamable HTTP MCP server (Hermes / external clients)
 *   roland mcp-config   Print / merge ~/.cursor/mcp.json (or --general for HTTP)
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
import { buildCursorMcpServerEntry, buildGeneralMcpHttpEntry, runMcpServer } from './server/mcp-server.js';
import { runMcpHttpServer } from './server/mcp-http.js';
import { bootstrapRolandEnv, resolveRolandInstallRoot } from './utils/project-root.js';
import { configureSdkProcessLimits } from './utils/sdk-lifecycle.js';
import { logger } from './utils/logger.js';
import { Roster } from './pm/roster.js';
import { TeamRecipes } from './pm/team-recipes.js';
import { PMEventLog } from './pm/event-log.js';
import { renderTimeline } from './pm/render.js';

// Raise the global EventEmitter/EventTarget default before any SDK code runs.
configureSdkProcessLimits();

// When invoked via `node dist/index.js` (not bin/roland.js), still bootstrap env.
bootstrapRolandEnv({ binUrl: import.meta.url, cwd: process.cwd() });

const CURSOR_CONFIG = path.join(os.homedir(), '.cursor', 'mcp.json');

function rolandMcpEntry(): Record<string, unknown> {
  const rolandRoot = resolveRolandInstallRoot(import.meta.url);
  return buildCursorMcpServerEntry({
    rolandRoot,
    projectRoot: process.env.ROLAND_PROJECT_ROOT?.trim() || process.cwd(),
  });
}

async function serve(rest: string[]): Promise<void> {
  if (rest.includes('--mcp')) {
    const portIdx = rest.indexOf('--port');
    const hostIdx = rest.indexOf('--host');
    const port = portIdx >= 0 ? Number(rest[portIdx + 1]) || 8081 : 8081;
    const host = hostIdx >= 0 ? rest[hostIdx + 1] : '0.0.0.0';
    await runMcpHttpServer({ host, port });
    return;
  }
  await runMcpServer();
}

async function mcpHttp(rest: string[]): Promise<void> {
  const portIdx = rest.indexOf('--port');
  const hostIdx = rest.indexOf('--host');
  const port = portIdx >= 0 ? Number(rest[portIdx + 1]) || 8081 : 8081;
  const host = hostIdx >= 0 ? rest[hostIdx + 1] : '0.0.0.0';
  await runMcpHttpServer({ host, port });
}

/** Verify @cursor/sdk is installable for `roland team` / orchestrate on this platform. */
function checkCursorSdkRuntime(installRoot: string): { ok: boolean; label: string; hint?: string } {
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
    // Fall through to dist-only check.
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

  // Legacy @cursor/sdk releases shipped npm sqlite3 native bindings.
  const sqliteRoot = path.join(installRoot, 'node_modules', 'sqlite3');
  if (fs.existsSync(path.join(sqliteRoot, 'package.json'))) {
    const sqliteBinding = path.join(
      sqliteRoot,
      'lib',
      'binding',
      `node-v${abi}-${platform}-${arch}`,
      'node_sqlite3.node',
    );
    const sqliteRelease = path.join(sqliteRoot, 'build', 'Release', 'node_sqlite3.node');
    const sqliteOk = fs.existsSync(sqliteBinding) || fs.existsSync(sqliteRelease);
    return {
      ok: sqliteOk,
      label: `@cursor/sdk sqlite3 binding (${platform}/${arch}, Node ABI ${abi})`,
      hint: sqliteOk
        ? undefined
        : 'Install VS "Desktop development with C++", then `npm rebuild sqlite3`. See docs/guides/mini-pc-deployment.md.',
    };
  }

  const distOk = fs.existsSync(sdkDist);
  return {
    ok: distOk,
    label: `@cursor/sdk (${platform}/${arch}, Node ABI ${abi})`,
    hint: distOk ? undefined : 'Run `npm ci` from the Roland install root.',
  };
}

function mcpConfig(write: boolean, rest: string[]): void {
  const general = rest.includes('--general') || rest.includes('--http');
  const portIdx = rest.indexOf('--port');
  const port = portIdx >= 0 ? Number(rest[portIdx + 1]) || 8081 : 8081;
  const baseUrl = rest.find((a, i) => rest[i - 1] === '--url') ?? `http://127.0.0.1:${port}/mcp`;

  if (general) {
    const block = { mcpServers: { roland: buildGeneralMcpHttpEntry(baseUrl) } };
    if (!write) {
      console.log('General MCP (Streamable HTTP) — for Hermes and other HTTP MCP clients:\n');
      console.log(JSON.stringify(block, null, 2));
      console.log('\nHermes:');
      console.log(`  hermes mcp add roland --url ${baseUrl.replace(/\/$/, '')}`);
      console.log('\nHealth check:');
      console.log(`  curl ${baseUrl.replace(/\/$/, '')}/health`);
      console.log('\nCursor stdio (unchanged): roland mcp-config --write');
      return;
    }
    console.log('Note: --write applies Cursor stdio config only. For Hermes, use:');
    console.log(`  hermes mcp add roland --url ${baseUrl.replace(/\/$/, '')}`);
    return;
  }

  const block = { mcpServers: { roland: rolandMcpEntry() } };
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
  servers.roland = rolandMcpEntry();
  existing.mcpServers = servers;
  fs.mkdirSync(path.dirname(CURSOR_CONFIG), { recursive: true });
  fs.writeFileSync(CURSOR_CONFIG, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  console.log(`✅ Merged the "roland" MCP server into ${CURSOR_CONFIG}. Restart Cursor to activate.`);
}

function doctor(): void {
  const checks: Array<{ ok: boolean; label: string; hint?: string }> = [];
  const add = (ok: boolean, label: string, hint?: string) => checks.push({ ok, label, hint });

  const installRoot = resolveRolandInstallRoot(import.meta.url);
  const distDir = path.join(installRoot, 'dist');
  add(fs.existsSync(distDir), `Build present (${distDir})`, fs.existsSync(distDir) ? undefined : 'Run npm run build.');
  const mcpEntry = path.join(distDir, 'server', 'mcp-server.js');
  add(fs.existsSync(mcpEntry), `MCP server entry (${mcpEntry})`, fs.existsSync(mcpEntry) ? undefined : 'Run npm run build.');
  const binEntry = path.join(installRoot, 'bin', 'roland.js');
  add(fs.existsSync(binEntry), `Global CLI shim (${binEntry})`, fs.existsSync(binEntry) ? undefined : 'Missing bin/roland.js — reinstall or npm link from repo.');
  add(true, `Install root: ${installRoot}`);
  add(true, `Project root: ${process.env.ROLAND_PROJECT_ROOT ?? process.cwd()}`);

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

  // @cursor/sdk runtime (orchestrate + team mode)
  const sdkCheck = checkCursorSdkRuntime(installRoot);
  add(sdkCheck.ok, sdkCheck.label, sdkCheck.hint);

  // SDK shell-exec cleanup tuning (optional env overrides)
  const settleMs = process.env.ROLAND_SDK_SETTLE_MS ?? '3500 (default)';
  const heavySettleMs = process.env.ROLAND_SDK_HEAVY_SETTLE_MS ?? '8000 (default)';
  const terminalWaitMs = process.env.ROLAND_SDK_TERMINAL_WAIT_MS ?? '30000 (default)';
  add(
    true,
    `SDK cleanup: ROLAND_SDK_SETTLE_MS=${settleMs}, ROLAND_SDK_HEAVY_SETTLE_MS=${heavySettleMs}`,
  );
  add(
    true,
    `SDK cleanup: ROLAND_SDK_TERMINAL_WAIT_MS=${terminalWaitMs}`,
    'Raise settle if you see [shell-exec] Close event warnings during team runs.',
  );

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
  ln('  ' + b('🚀  Roland v1.2') + '  — PM-first AI Engineering Team');
  ln();
  ln('  ' + b('CHAT MODE') + '  ' + d('(default — just run: roland)'));
  ln(`    ${cy('roland')}                            Start interactive chat  ${d('(type goals naturally, /help inside)')}`);
  ln(`    ${cy('roland')} ${b('chat')}                        Same as above  ${d('(explicit)')}`);
  ln();
  ln('  ' + b('DIRECT COMMANDS'));
  ln(`    ${cy('roland')} ${b('"goal"')}                      Run a PM team on a goal ${d('(shortcut)')}`);
  ln(`    ${cy('roland')} ${b('team')} "goal"               Run a PM team with live dashboard`);
  ln(`    ${cy('roland')} ${b('watch')}                      Watch git commits, auto-run on change`);
  ln(`    ${cy('roland')} ${b('pr')} [number]               Review (and optionally fix) a GitHub PR`);
  ln(`    ${cy('roland')} ${b('status')}                     Live dashboard for a running job`);
  ln(`    ${cy('roland')} ${b('board-status')}              UNSC summary (add --concise for chat-friendly)`);
  ln(`    ${cy('roland')} ${b('board-cleanup')}             Archive stale tasks from prior missions`);
  ln(`    ${cy('roland')} ${b('pr-cleanup')} [--apply]       Clean legacy PR titles/bodies (--current, --body)`);
  ln(`    ${cy('roland')} ${b('orchestrate')} "goal"       SDK supervisor + UNSC sub-agents`);
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
  ln(`    ${b('--sequential')}              One agent at a time  ${d('(safe mode for unstable connections)')}`);
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
  ln(`    ${cy('roland')} ${b('run')}  "goal" ${b('--detach')}     Alias for team --background`);
  ln(`    ${cy('roland')} ${b('bg-status')}                  Show running job: wave, phase, task progress`);
  ln(`    ${cy('roland')} ${b('bg-status')} --json            Machine-readable status (for scripting)`);
  ln(`    ${cy('roland')} ${b('bg-logs')}                    Tail the most recent background log`);
  ln(`    ${cy('roland')} ${b('bg-logs')} --follow           Stream the log live  ${d('(Ctrl+C to stop)')}`);
  ln(`    ${cy('roland')} ${b('bg-stop')}                    Gracefully stop (abort → SIGTERM → SIGKILL)`);
  ln();
  ln('  ' + b('HUMAN-IN-THE-LOOP') + '  ' + d('(while a run is active)'));
  ln(`    ${cy('roland')} ${b('pause')}                      Pause before the next wave`);
  ln(`    ${cy('roland')} ${b('resume')}                     Resume a paused run`);
  ln(`    ${cy('roland')} ${b('unblock')} <task-id> [msg]    Send guidance to a blocked agent`);
  ln(`    ${cy('roland')} ${b('inject')} "directive"         Post a directive to the Lead PM`);
  ln(`    ${cy('roland')} ${b('replan')}                     Ask PM to re-evaluate the plan`);
  ln(`    ${cy('roland')} ${b('abort')}                      Stop the run after current wave`);
  ln(`    ${cy('roland')} ${b('hitl-status')}                Show HITL queue state and pause status`);
  ln(`    ${cy('roland')} ${b('approve-commit')} [id]        Approve pending git-commit (loop HITL)`);
  ln(`    ${cy('roland')} ${b('reject-commit')} [id]         Reject pending git-commit (loop HITL)`);
  ln();
  ln('  ' + b('UTILITY COMMANDS'));
  ln(`    ${cy('roland')} doctor              Diagnose your Roland install`);
  ln(`    ${cy('roland')} pm-log              Print the PM event timeline`);
  ln(`    ${cy('roland')} mcp-config          Print Cursor MCP config (--general for HTTP)`);
  ln(`    ${cy('roland')} mcp [--port N]      Streamable HTTP MCP on 0.0.0.0 (Hermes-ready)`);
  ln(`    ${cy('roland')} serve [--mcp]       Stdio MCP (default) or HTTP with --mcp`);
  ln();
  ln('  ' + b('ENVIRONMENT'));
  ln(`    ${b('ROLAND_NOTIFY=1')}            Enable notifications for all commands`);
  ln(`    ${b('ROLAND_SIMPLE_TUI=1')}        Simple ASCII output  ${d('(mobile SSH, Termius, limited terminals)')}`);
  ln(`    ${b('ROLAND_SEQUENTIAL=1')}        Sequential safe mode  ${d('(one agent at a time; use --sequential flag per-run)')}`);
  ln(`    ${b('ROLAND_WEB=1')}               Clean ANSI-free output for web/chat UI  ${d('(same as --web flag)')}`);
  ln(`    ${b('CURSOR_API_KEY')}             Required for agent execution`);
  ln(`    ${b('ROLAND_AGENT_TIMEOUT_MS')}    Agent timeout  ${d('(default: 25 min)')}`);
  ln(`    ${b('ROLAND_AGENT_RETRIES')}       Max retries per agent  ${d('(default: 5)')}`);
  ln(`    ${b('ROLAND_PROJECT_ROOT')}        Target project when cwd is not the repo`);
  ln(`    ${b('ROLAND_ROOT')}                Alias for ROLAND_PROJECT_ROOT`);
  ln(`    ${b('ROLAND_STATE_DIR')}           Persistence dir  ${d('(default: .roland under project)')}`);
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
  ln(`    ${d('# Approve a loop git-commit from terminal (HITL)')}`);
  ln(`    roland approve-commit --message "feat: ship iteration 2"`);
  ln(`    roland reject-commit --reason "needs more tests"`);
  ln();
}

// ── Known subcommands (used for bare-goal shortcut detection) ─────────────────

const KNOWN_CMDS = new Set([
  'serve', 'mcp', 'mcp-config', 'doctor', 'pm-log',
  'team', 'run', 'goal', 'start', 'status', 'watch', 'pr', 'chat',
  // HITL controls
  'pause', 'resume', 'unblock', 'inject', 'replan', 'abort', 'hitl-status',
  'approve-commit', 'reject-commit',
  'board-status', 'board-cleanup', 'pr-cleanup', 'orchestrate',
  // Background supervisor
  'bg-status', 'bg-logs', 'bg-stop',
  '--help', '-h', '--version',
]);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // --help / -h (check before any parsing)
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // --version / -v
  if (argv.includes('--version') || argv.includes('-v')) {
    try {
      const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
      console.log(`roland ${pkg.version}`);
    } catch { console.log('roland 1.2.0'); }
    process.exit(0);
  }

  // Bare `roland` in an interactive terminal → start chat mode (like Claude Code).
  // When stdin is piped (Cursor / VS Code spawns `roland serve` or bare `roland`), fall through to serve().
  if (argv.length === 0 && (process.stdin as NodeJS.ReadStream).isTTY) {
    const { startChat } = await import('./rco/chat-interface.js');
    await startChat();
    process.exit(0);
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
        await serve(rest);
        break;
      case 'mcp':
        await mcpHttp(rest);
        break;
      case 'mcp-config':
        mcpConfig(rest.includes('--write'), rest);
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
      case 'chat': {
        const { startChat } = await import('./rco/chat-interface.js');
        await startChat({
          stateDir:  rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland',
          notify:    rest.includes('--notify') || rest.includes('-n'),
          stream:    rest.includes('--stream') || rest.includes('-s'),
          noImprove: rest.includes('--no-improve'),
          parallel:  !rest.includes('--sequential'),
          webhookUrl: rest.find((_, i) => rest[i - 1] === '--webhook'),
        });
        break;
      }
      case 'team': {
        const { runTeamCli } = await import('./rco/team-cli.js');
        await runTeamCli(['team', ...rest]);
        break;
      }
      case 'run':
      case 'goal':
      case 'start': {
        // 'roland run/goal/start "goal"' are aliases for 'roland team "goal"'.
        // '--detach' is accepted alongside '--background' by runTeamCli.
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
      case 'board-status': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode = rest.includes('--json');
        const concise = rest.includes('--concise') || rest.includes('-c');
        const goalArgIdx = rest.indexOf('--goal');
        const goal = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : undefined;
        const { printBoardStatus } = await import('./rco/board-report.js');
        printBoardStatus(stateDir, { json: jsonMode, goal, concise });
        break;
      }
      case 'board-cleanup': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const dryRun = rest.includes('--dry-run');
        const goalArgIdx = rest.indexOf('--goal');
        const goal = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : '';
        const { cleanupBoardsForNewMission, formatCleanupReport } = await import('./rco/board-cleanup.js');
        const result = cleanupBoardsForNewMission(stateDir, goal, { dryRun });
        console.log(formatCleanupReport(result));
        if (rest.includes('--json')) console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'orchestrate': {
        const installRoot = resolveRolandInstallRoot(import.meta.url);
        const script = path.join(installRoot, 'scripts', 'roland-orchestrate.mjs');
        if (!fs.existsSync(script)) {
          console.error(`Orchestrate script not found: ${script}`);
          process.exit(1);
        }
        const goal = rest.join(' ').trim();
        if (!goal) {
          console.error('Usage: roland orchestrate "<mission goal>"');
          process.exit(1);
        }
        const projectRoot = process.env.ROLAND_PROJECT_ROOT?.trim() || process.cwd();
        const logDir = path.join(projectRoot, '.roland', 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, `orchestrate-${Date.now()}.log`);

        if ((process.stderr as NodeJS.WriteStream).isTTY) {
          const { spawnSync } = await import('child_process');
          const result = spawnSync(process.execPath, [script, goal], {
            stdio: 'inherit',
            cwd: projectRoot,
            env: process.env,
          });
          process.exit(result.status ?? 1);
        }

        const { spawnSilent } = await import('./utils/spawn-silent.js');
        const child = spawnSilent(process.execPath, [script, goal], {
          cwd: projectRoot,
          log: { logFile, logMode: 'w' },
        });
        child.on('close', (code) => process.exit(code ?? 1));
        return;
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
      case 'pr-cleanup': {
        const { runPrCleanupCli } = await import('./rco/pr-cleanup-cli.js');
        runPrCleanupCli(['pr-cleanup', ...rest]);
        break;
      }

      // ── HITL controls ───────────────────────────────────────────────────────
      case 'pause': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('./rco/hitl.js');
        const active = isRunActive(stateDir);
        const goal   = readRunGoal(stateDir);
        if (!active) {
          console.error(`⚠️  No active run in ${stateDir}${goal ? ` (last goal: "${goal.slice(0, 60)}")` : ''}`);
          console.error('   Start a run with: roland team "your goal"');
        }
        writeHitlCommand(stateDir, { cmd: 'pause' });
        const goalHint = goal ? ` \x1b[2m("${goal.slice(0, 50)}")\x1b[0m` : '';
        console.error(`⏸  Pause sent${goalHint}`);
        console.error('   Run will pause before the next wave starts.');
        console.error('   Resume with: roland resume');
        break;
      }
      case 'resume': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('./rco/hitl.js');
        const active = isRunActive(stateDir);
        const goal   = readRunGoal(stateDir);
        if (!active) {
          console.error(`⚠️  No active run in ${stateDir}${goal ? ` (last goal: "${goal.slice(0, 60)}")` : ''}`);
        }
        writeHitlCommand(stateDir, { cmd: 'resume' });
        const goalHint = goal ? ` \x1b[2m("${goal.slice(0, 50)}")\x1b[0m` : '';
        console.error(`▶  Resume sent${goalHint} — run will continue shortly.`);
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
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('./rco/hitl.js');
        const active = isRunActive(stateDir);
        const goal   = readRunGoal(stateDir);
        if (!active) {
          console.error(`⚠️  No active run in ${stateDir}${goal ? ` (last goal: "${goal.slice(0, 60)}")` : ''}`);
        }
        writeHitlCommand(stateDir, { cmd: 'unblock', taskId, message });
        console.error(`↑  Unblock sent to ${taskId}${message ? `: "${message}"` : ''}`);
        console.error('   The agent for this task will see the guidance in its inbox.');
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
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('./rco/hitl.js');
        const active = isRunActive(stateDir);
        const goal   = readRunGoal(stateDir);
        if (!active) {
          console.error(`⚠️  No active run in ${stateDir}${goal ? ` (last goal: "${goal.slice(0, 60)}")` : ''}`);
        }
        writeHitlCommand(stateDir, { cmd: 'inject', text });
        console.error(`💉 Injected to Lead PM: "${text.slice(0, 80)}"`);
        console.error('   The Lead PM will see this directive on the next wave review.');
        break;
      }
      case 'replan': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('./rco/hitl.js');
        const active = isRunActive(stateDir);
        const goal   = readRunGoal(stateDir);
        if (!active) {
          console.error(`⚠️  No active run in ${stateDir}${goal ? ` (last goal: "${goal.slice(0, 60)}")` : ''}`);
        }
        writeHitlCommand(stateDir, { cmd: 'replan' });
        console.error('🔄 Replan requested — PM will re-evaluate the plan on next review.');
        break;
      }
      case 'abort': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('./rco/hitl.js');
        const active = isRunActive(stateDir);
        const goal   = readRunGoal(stateDir);
        if (!active) {
          console.error(`⚠️  No active run in ${stateDir}${goal ? ` (last goal: "${goal.slice(0, 60)}")` : ''}`);
        }
        writeHitlCommand(stateDir, { cmd: 'abort' });
        console.error('🛑 Abort sent — run will stop after the current wave finishes.');
        console.error('   For immediate stop: roland bg-stop');
        break;
      }
      case 'hitl-status': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { isRunActive, readRunGoal, HitlQueue } = await import('./rco/hitl.js');
        const active = isRunActive(stateDir);
        const goal   = readRunGoal(stateDir);
        const q = new HitlQueue(stateDir);
        const hitlState = q.readState();
        const queueLen  = hitlState.pendingCount ?? 0;

        const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
        const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;
        const cy   = (s: string) => `\x1b[36m${s}\x1b[0m`;
        const y    = (s: string) => `\x1b[33m${s}\x1b[0m`;
        const g    = (s: string) => `\x1b[32m${s}\x1b[0m`;

        console.error('');
        console.error(`  ${bold('HITL Status')}  ${dim('(Human-in-the-Loop Controls)')}`);
        console.error('');
        console.error(`  Run active:    ${active ? g('yes') : dim('no')}${goal ? dim(` — "${goal.slice(0, 60)}"`) : ''}`);
        console.error(`  Paused:        ${hitlState.paused ? y('yes ⏸') : dim('no')}`);
        console.error(`  Abort pending: ${hitlState.abortPending ? y('yes ⚠️') : dim('no')}`);
        console.error(`  Queue length:  ${queueLen > 0 ? y(String(queueLen)) : dim('0')}`);
        {
          const { readLoopState } = await import('./loop-engine/loop-state.js');
          const loopState = readLoopState(stateDir);
          if (loopState) {
            const spawns = loopState.spawnActivityHistory?.length ?? 0;
            const phase = loopState.currentPhase ?? '—';
            const tpl = loopState.templateId ?? '—';
            console.error(`  Loop:          ${dim(`${tpl} · phase=${phase} · iter=${loopState.iteration}`)}`);
            if (spawns > 0) {
              console.error(`  Spawn pulses:  ${String(spawns)} recorded`);
            }
            const la = loopState.liveActivity;
            if (la?.kind === 'approval' || la?.activeHook?.requireApproval) {
              console.error(`  Loop activity: ${y(`${la.label}${la.detail ? ` — ${la.detail}` : ''}`)}`);
            }
          }
        }
        console.error('');
        if (active && !hitlState.paused) {
          console.error(`  ${cy('roland pause')}             Pause before next wave`);
          console.error(`  ${cy('roland abort')}             Stop after current wave`);
          console.error(`  ${cy('roland inject "..."')}      Send directive to Lead PM`);
        } else if (hitlState.paused) {
          console.error(`  ${cy('roland resume')}            Resume the paused run`);
        }
        {
          const { printGitCommitApprovalStatus } = await import('./rco/git-commit-approval-cli.js');
          printGitCommitApprovalStatus(stateDir);
        }
        console.error('');
        break;
      }
      case 'approve-commit': {
        const { runApproveCommitCli } = await import('./rco/git-commit-approval-cli.js');
        const code = runApproveCommitCli(rest);
        if (code !== 0) process.exit(code);
        break;
      }
      case 'reject-commit': {
        const { runRejectCommitCli } = await import('./rco/git-commit-approval-cli.js');
        const code = runRejectCommitCli(rest);
        if (code !== 0) process.exit(code);
        break;
      }

      // ── Background supervisor ───────────────────────────────────────────────
      case 'bg-status': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode = rest.includes('--json');
        const { bgStatus } = await import('./rco/supervisor.js');
        bgStatus(stateDir, jsonMode);
        break;
      }
      case 'bg-logs': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const follow   = rest.includes('--follow') || rest.includes('-f');
        const linesIdx = rest.indexOf('--lines');
        const lines    = linesIdx >= 0 ? Number(rest[linesIdx + 1]) || 50 : 50;
        const { bgLogs, bgLogsFollow } = await import('./rco/supervisor.js');
        if (follow) {
          bgLogsFollow(stateDir);
        } else {
          bgLogs(stateDir, lines);
        }
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
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('CURSOR_API_KEY')) {
      console.error('\n  ❌  Missing API key — CURSOR_API_KEY is not set\n');
      console.error('  Add to your shell profile (.zshrc / .bashrc / PowerShell $PROFILE):\n');
      console.error('    export CURSOR_API_KEY=your_key_here\n');
      console.error('  Get your key: https://cursor.com/settings → API Keys\n');
      process.exit(1);
    }
    logger.error('❌ Fatal error:', error);
    console.error(error);
    process.exit(1);
  }
}

main();
