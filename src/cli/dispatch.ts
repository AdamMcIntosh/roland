/**
 * ## P3 Release & Stabilization
 *
 * CLI command dispatch — all subcommand handlers (used by Commander program).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { buildCursorMcpServerEntry, buildGeneralMcpHttpEntry, runMcpServer } from '../server/mcp-server.js';
import { runMcpHttpServer } from '../server/mcp-http.js';
import { resolveRolandInstallRoot } from '../utils/project-root.js';
import { readPackageVersion } from '../utils/package-version.js';
import { logger } from '../utils/logger.js';
import { Roster } from '../pm/roster.js';
import { TeamRecipes } from '../pm/team-recipes.js';
import { PMEventLog } from '../pm/event-log.js';
import { renderTimeline } from '../pm/render.js';

const DISPATCH_MODULE_URL = import.meta.url;

const CURSOR_CONFIG = path.join(os.homedir(), '.cursor', 'mcp.json');

function rolandMcpEntry(): Record<string, unknown> {
  const rolandRoot = resolveRolandInstallRoot(DISPATCH_MODULE_URL);
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

  const version = readPackageVersion(DISPATCH_MODULE_URL);
  add(true, `Roland version: ${version}`);

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

  const installRoot = resolveRolandInstallRoot(DISPATCH_MODULE_URL);
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
  ln('  ' + b(`🚀  Roland v${readPackageVersion(DISPATCH_MODULE_URL)}`) + '  — Pure ClosedLoop Mission Harness');
  ln();
  ln('  ' + b('MISSIONS') + '  ' + d('(primary execution path)'));
  ln(`    ${cy('roland')} ${b('team')} "goal"               Pure ClosedLoop mission ${d('(auto-selects template)')}`);
  ln(`    ${cy('roland')} ${b('mission')} "goal"            Alias for team`);
  ln(`    ${cy('roland')} ${b('"goal"')}                      Shortcut for team ${d('(bare goal string)')}`);
  ln(`    ${cy('roland')} ${b('mission-audit')} [--last]     Post-run timeline ${d('(markdown|json|html)')}`);
  ln();
  ln('  ' + b('CHAT MODE') + '  ' + d('(interactive terminal)'));
  ln(`    ${cy('roland')}                            Start interactive chat  ${d('(type goals naturally, /help inside)')}`);
  ln(`    ${cy('roland')} ${b('chat')}                        Same as above  ${d('(explicit)')}`);
  ln();
  ln('  ' + b('MONITORING'));
  ln(`    ${cy('roland')} ${b('status')} [--json]              Unified snapshot ${d('(board + HITL + supervisor)')}`);
  ln(`    ${cy('roland')} ${b('live')} [--interval N]          Live monitor ${d('(refreshes every 5s)')}`);
  ln(`    ${cy('roland')} ${b('board-status')}              UNSC summary (add --concise for chat-friendly)`);
  ln(`    ${cy('roland')} ${b('hitl-status')} [--json]       HITL gates, blockers, mission outcome`);
  ln(`    ${cy('roland')} ${b('mission-summary')} [--json]   Latest terminal mission report`);
  ln(`    ${cy('roland')} ${b('hitl-events')} [--since N]   Poll HITL events since epoch ms`);
  ln();
  ln('  ' + b('OTHER COMMANDS'));
  ln(`    ${cy('roland')} ${b('watch')}                      Watch git commits, auto-run on change`);
  ln(`    ${cy('roland')} ${b('pr')} [number]               Review (and optionally fix) a GitHub PR`);
  ln(`    ${cy('roland')} ${b('board-cleanup')}             Archive stale tasks from prior missions`);
  ln(`    ${cy('roland')} ${b('pr-cleanup')} [--apply]       Clean legacy PR titles/bodies`);
  ln(`    ${d('roland orchestrate "goal"')}       ${d('[deprecated] use roland team')}`);
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
  ln(`    ${b('--loop-template')} <id>       Override auto-selected loop template`);
  ln(`    ${b('--legacy-pm')}, ${b('--use-pm-team')}  [DEPRECATED] Legacy PM Team waves`);
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
  ln(`    ${cy('roland')} ${b('hitl-status')} [--json]      HITL queue, gates, suggested actions`);
  ln(`    ${cy('roland')} ${b('mission-summary')} [--json]  Last mission outcome (Hermes parity)`);
  ln(`    ${cy('roland')} ${b('hitl-events')} [--since N]   Poll hermes-hitl-events.jsonl`);
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
  ln(`    ${d('# Run a closed-loop mission')}`);
  ln(`    roland mission "add rate limiting to the Express API"`);
  ln();
  ln(`    ${d('# Watch git and notify on phone via ntfy')}`);
  ln(`    roland watch --webhook https://ntfy.sh/my-alerts`);
  ln();
  ln(`    ${d('# Review a PR and push fixes')}`);
  ln(`    roland pr 42 --fix --notify`);
  ln();
  ln(`    ${d('# Post-run audit')}`);
  ln(`    roland mission-audit --last --format markdown --open`);
  ln();
  ln(`    ${d('# Approve a loop git-commit from terminal (HITL)')}`);
  ln(`    roland approve-commit --message "feat: ship iteration 2"`);
  ln(`    roland reject-commit --reason "needs more tests"`);
  ln();
}

// ── Known subcommands (used for bare-goal shortcut detection) ─────────────────

const KNOWN_CMDS = new Set([
  'serve', 'mcp', 'mcp-config', 'doctor', 'pm-log',
  'team', 'mission', 'run', 'goal', 'start', 'status', 'live', 'watch', 'pr', 'chat',
  'pause', 'resume', 'unblock', 'inject', 'replan', 'abort', 'hitl-status',
  'hitl-events', 'mission-summary', 'mission-audit',
  'approve-commit', 'reject-commit',
  'board-status', 'board-cleanup', 'pr-cleanup', 'orchestrate',
  'bg-status', 'bg-logs', 'bg-stop',
  '--help', '-h', '--version',
]);

const DEPRECATED_MISSION_ALIASES = new Set(['run', 'goal', 'start', 'orchestrate']);

function warnDeprecatedAlias(cmd: string): void {
  if (DEPRECATED_MISSION_ALIASES.has(cmd)) {
    console.error(
      `\x1b[33m⚠\x1b[0m  \`${cmd}\` is deprecated — use \`roland team\` or \`roland mission\` instead.`,
    );
  }
}

// ── Main (exported for Commander program) ─────────────────────────────────────

export async function dispatchCommand(cmd: string | undefined, rest: string[]): Promise<void> {
  warnDeprecatedAlias(cmd ?? '');

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
        const { startChat } = await import('../rco/chat-interface.js');
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
      case 'team':
      case 'mission': {
        const { runTeamCli } = await import('../rco/team-cli.js');
        await runTeamCli(['team', ...rest]);
        break;
      }
      case 'run':
      case 'goal':
      case 'start': {
        const { runTeamCli } = await import('../rco/team-cli.js');
        await runTeamCli(['team', ...rest]);
        break;
      }
      case 'mission-audit': {
        const { parseMissionAuditArgs, runMissionAuditCli } = await import('../rco/mission-audit-cli.js');
        const code = runMissionAuditCli(parseMissionAuditArgs(rest));
        if (code !== 0) process.exit(code);
        break;
      }
      case 'status': {
        const stateDir    = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode    = rest.includes('--json');
        const concise     = rest.includes('--concise') || rest.includes('-c');
        const tuiMode     = rest.includes('--tui') || rest.includes('--watch-tui');
        const goalArgIdx  = rest.indexOf('--goal');
        const goal        = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : undefined;

        if (tuiMode) {
          const simpleFlag = rest.includes('--simple-tui') || rest.includes('--no-fancy');
          const { isSimpleTui, SimpleTuiRenderer } = await import('../dashboard/simple-tui.js');
          if (simpleFlag || isSimpleTui()) {
            await SimpleTuiRenderer.watch(stateDir);
          } else {
            const { TuiRenderer } = await import('../dashboard/tui.js');
            await TuiRenderer.watch(stateDir);
          }
          break;
        }

        const { printUnifiedStatus } = await import('../rco/status-cli.js');
        printUnifiedStatus(stateDir, { json: jsonMode, goal, concise });
        break;
      }
      case 'live': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode = rest.includes('--json');
        const once     = rest.includes('--once');
        const concise  = rest.includes('--concise') || rest.includes('-c');
        const intervalIdx = rest.indexOf('--interval');
        const intervalSec = intervalIdx >= 0 ? Number(rest[intervalIdx + 1]) || 5 : 5;
        const goalArgIdx = rest.indexOf('--goal');
        const goal = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : undefined;
        const { runLiveMonitor } = await import('../rco/status-cli.js');
        await runLiveMonitor(stateDir, { json: jsonMode, goal, concise, intervalSec, once });
        break;
      }
      case 'board-status': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode = rest.includes('--json');
        const concise = rest.includes('--concise') || rest.includes('-c');
        const goalArgIdx = rest.indexOf('--goal');
        const goal = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : undefined;
        const { printBoardStatus } = await import('../rco/board-report.js');
        printBoardStatus(stateDir, { json: jsonMode, goal, concise });
        break;
      }
      case 'board-cleanup': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const dryRun = rest.includes('--dry-run');
        const goalArgIdx = rest.indexOf('--goal');
        const goal = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : '';
        const { cleanupBoardsForNewMission, formatCleanupReport } = await import('../rco/board-cleanup.js');
        const result = cleanupBoardsForNewMission(stateDir, goal, { dryRun });
        console.log(formatCleanupReport(result));
        if (rest.includes('--json')) console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'orchestrate': {
        const installRoot = resolveRolandInstallRoot(DISPATCH_MODULE_URL);
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

        const { spawnSilent } = await import('../utils/spawn-silent.js');
        const child = spawnSilent(process.execPath, [script, goal], {
          cwd: projectRoot,
          log: { logFile, logMode: 'w' },
        });
        child.on('close', (code) => process.exit(code ?? 1));
        return;
      }
      case 'watch': {
        const { runWatchCli } = await import('../rco/watch-cli.js');
        await runWatchCli(['watch', ...rest]);
        break;
      }
      case 'pr': {
        const { runPrCli } = await import('../rco/pr-cli.js');
        await runPrCli(['pr', ...rest]);
        break;
      }
      case 'pr-cleanup': {
        const { runPrCleanupCli } = await import('../rco/pr-cleanup-cli.js');
        runPrCleanupCli(['pr-cleanup', ...rest]);
        break;
      }

      // ── HITL controls ───────────────────────────────────────────────────────
      case 'pause': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('../rco/hitl.js');
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
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('../rco/hitl.js');
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
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('../rco/hitl.js');
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
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('../rco/hitl.js');
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
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('../rco/hitl.js');
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
        const { writeHitlCommand, isRunActive, readRunGoal } = await import('../rco/hitl.js');
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
        const jsonMode = rest.includes('--json');
        const goalArgIdx = rest.indexOf('--goal');
        const goal = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : undefined;
        const { printHitlStatus } = await import('../rco/status-cli.js');
        printHitlStatus(stateDir, { json: jsonMode, goal });
        break;
      }
      case 'mission-summary': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode = rest.includes('--json');
        const goalArgIdx = rest.indexOf('--goal');
        const goal = goalArgIdx >= 0 ? rest[goalArgIdx + 1] : undefined;
        const { printMissionSummary } = await import('../rco/status-cli.js');
        printMissionSummary(stateDir, { json: jsonMode, goal });
        break;
      }
      case 'hitl-events': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode = rest.includes('--json');
        const sinceIdx = rest.indexOf('--since');
        const since = sinceIdx >= 0 ? Number(rest[sinceIdx + 1]) || 0 : 0;
        const limitIdx = rest.indexOf('--limit');
        const limit = limitIdx >= 0 ? Number(rest[limitIdx + 1]) || 50 : 50;
        const { printHitlEvents } = await import('../rco/status-cli.js');
        printHitlEvents(stateDir, { since, limit, json: jsonMode });
        break;
      }
      case 'approve-commit': {
        const { runApproveCommitCli } = await import('../rco/git-commit-approval-cli.js');
        const code = runApproveCommitCli(rest);
        if (code !== 0) process.exit(code);
        break;
      }
      case 'reject-commit': {
        const { runRejectCommitCli } = await import('../rco/git-commit-approval-cli.js');
        const code = runRejectCommitCli(rest);
        if (code !== 0) process.exit(code);
        break;
      }

      // ── Background supervisor ───────────────────────────────────────────────
      case 'bg-status': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const jsonMode = rest.includes('--json');
        const { bgStatus } = await import('../rco/supervisor.js');
        bgStatus(stateDir, jsonMode);
        break;
      }
      case 'bg-logs': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const follow   = rest.includes('--follow') || rest.includes('-f');
        const linesIdx = rest.indexOf('--lines');
        const lines    = linesIdx >= 0 ? Number(rest[linesIdx + 1]) || 50 : 50;
        const { bgLogs, bgLogsFollow } = await import('../rco/supervisor.js');
        if (follow) {
          bgLogsFollow(stateDir);
        } else {
          bgLogs(stateDir, lines);
        }
        break;
      }
      case 'bg-stop': {
        const stateDir = rest.find((_, i) => rest[i - 1] === '--state-dir') ?? '.roland';
        const { bgStop } = await import('../rco/supervisor.js');
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

export { printHelp, KNOWN_CMDS };
