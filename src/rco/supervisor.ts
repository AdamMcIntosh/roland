/**
 * Roland Supervisor — true background / detached process mode.
 *
 * Usage (from CLI):
 *   roland team "goal" --background
 *   roland team "goal" --detach
 *
 * What it does:
 *   1. Spawns a detached Node.js process that runs the team orchestrator
 *   2. Redirects all output to .roland/logs/bg-<timestamp>.log
 *   3. Writes a PID record to .roland/supervisor.pid
 *   4. Parent process exits immediately
 *   5. Supervisor process auto-restarts on crash (up to MAX_RESTARTS times,
 *      RESTART_DELAY_MS between attempts)
 *
 * Management commands:
 *   roland bg-status        Show if a background run is active (reads PID file)
 *   roland bg-logs          Tail the most recent background log
 *   roland bg-stop          Kill the background process and clean up
 *
 * Platform notes:
 *   - Works on Windows, macOS, Linux.
 *   - On Windows, process.kill(pid, 0) is used for liveness checks.
 *   - Child processes are fully detached (stdio=ignore, unref()).
 */

import { spawn }          from 'child_process';
import fs                  from 'fs';
import path                from 'path';
import { fileURLToPath }   from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_RESTARTS     = 3;
const RESTART_DELAY_MS = 30_000; // 30 s between restart attempts

export const SUPERVISOR_PID_FILE = 'supervisor.pid';
export const SUPERVISOR_LOG_DIR  = 'logs';

export interface SupervisorRecord {
  pid:       number;
  goal:      string;
  startedAt: number;
  logFile:   string;
  restarts:  number;
}

// ── Liveness check ─────────────────────────────────────────────────────────────

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = check existence only
    return true;
  } catch {
    return false;
  }
}

// ── PID file helpers ──────────────────────────────────────────────────────────

export function readSupervisorRecord(stateDir: string): SupervisorRecord | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, SUPERVISOR_PID_FILE), 'utf-8')) as SupervisorRecord;
  } catch {
    return null;
  }
}

function writeSupervisorRecord(stateDir: string, record: SupervisorRecord): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, SUPERVISOR_PID_FILE), JSON.stringify(record, null, 2), 'utf-8');
}

function removeSupervisorRecord(stateDir: string): void {
  try { fs.rmSync(path.join(stateDir, SUPERVISOR_PID_FILE), { force: true }); } catch { /* ignore */ }
}

// ── bg-status ─────────────────────────────────────────────────────────────────

export function bgStatus(stateDir: string): void {
  const rec = readSupervisorRecord(stateDir);
  if (!rec) {
    process.stderr.write('No background run found (no supervisor.pid in ' + stateDir + ')\n');
    return;
  }

  const alive    = isProcessRunning(rec.pid);
  const elapsed  = Math.round((Date.now() - rec.startedAt) / 1000);
  const status   = alive ? '🟢 Running' : '🔴 Stopped';
  const goalSnip = rec.goal.slice(0, 70);

  process.stderr.write(`\n  Background run\n`);
  process.stderr.write(`  Status:   ${status}\n`);
  process.stderr.write(`  PID:      ${rec.pid}\n`);
  process.stderr.write(`  Goal:     ${goalSnip}${rec.goal.length > 70 ? '…' : ''}\n`);
  process.stderr.write(`  Started:  ${new Date(rec.startedAt).toLocaleString()} (${elapsed}s ago)\n`);
  process.stderr.write(`  Restarts: ${rec.restarts}\n`);
  process.stderr.write(`  Logs:     ${rec.logFile}\n`);

  if (alive) {
    process.stderr.write(`\n  Stop with: roland bg-stop\n`);
    process.stderr.write(`  Tail logs: roland bg-logs\n`);
  } else {
    process.stderr.write(`\n  Process is no longer running. Cleaning up PID file…\n`);
    removeSupervisorRecord(stateDir);
  }
  process.stderr.write('\n');
}

// ── bg-logs ───────────────────────────────────────────────────────────────────

export function bgLogs(stateDir: string, lines = 50): void {
  const rec = readSupervisorRecord(stateDir);
  if (!rec) {
    // Try to find the most recent log even without a pid file
    const logDir = path.join(stateDir, SUPERVISOR_LOG_DIR);
    try {
      const files = fs.readdirSync(logDir)
        .filter((f) => f.startsWith('bg-') && f.endsWith('.log'))
        .sort()
        .reverse();
      if (files.length === 0) { process.stderr.write('No background logs found.\n'); return; }
      printLogTail(path.join(logDir, files[0]), lines);
      return;
    } catch {
      process.stderr.write('No background logs found.\n');
      return;
    }
  }

  if (!fs.existsSync(rec.logFile)) {
    process.stderr.write('Log file not found: ' + rec.logFile + '\n');
    return;
  }
  printLogTail(rec.logFile, lines);
}

function printLogTail(logFile: string, lines: number): void {
  try {
    const all  = fs.readFileSync(logFile, 'utf-8');
    const tail = all.split('\n').slice(-lines).join('\n');
    process.stdout.write(`\n--- ${logFile} (last ${lines} lines) ---\n`);
    process.stdout.write(tail + '\n');
    process.stdout.write('---\n\n');
  } catch (e) {
    process.stderr.write('Could not read log file: ' + (e as Error).message + '\n');
  }
}

// ── bg-stop ───────────────────────────────────────────────────────────────────

export function bgStop(stateDir: string): void {
  const rec = readSupervisorRecord(stateDir);
  if (!rec) {
    process.stderr.write('No background run found.\n');
    return;
  }

  if (!isProcessRunning(rec.pid)) {
    process.stderr.write('Process ' + rec.pid + ' is no longer running.\n');
    removeSupervisorRecord(stateDir);
    return;
  }

  try {
    process.kill(rec.pid, 'SIGTERM');
    process.stderr.write('✅ Sent SIGTERM to PID ' + rec.pid + '\n');
    // Wait briefly then force-kill if still alive
    setTimeout(() => {
      try {
        if (isProcessRunning(rec.pid)) {
          process.kill(rec.pid, 'SIGKILL');
          process.stderr.write('   Force-killed PID ' + rec.pid + '\n');
        }
      } catch { /* already gone */ }
      removeSupervisorRecord(stateDir);
      process.stderr.write('   PID file removed.\n');
    }, 3000);
  } catch (e) {
    process.stderr.write('Failed to kill process: ' + (e as Error).message + '\n');
    removeSupervisorRecord(stateDir);
  }
}

// ── spawnBackground ───────────────────────────────────────────────────────────

/**
 * Spawn a detached supervisor process that runs the team orchestrator
 * with auto-restart support. The parent returns immediately.
 */
export async function spawnBackground(
  goal:      string,
  teamArgv:  string[],   // the full argv slice after 'team', minus --background/--detach
  stateDir:  string,
): Promise<void> {
  // Resolve the supervisor entry script (dist/rco/supervisor.js)
  const supervisorScript = path.join(__dirname, 'supervisor.js');
  if (!fs.existsSync(supervisorScript)) {
    throw new Error(
      `Supervisor script not found at ${supervisorScript}. Run \`npm run build\` first.`,
    );
  }

  // Create logs directory
  const logDir  = path.join(stateDir, SUPERVISOR_LOG_DIR);
  fs.mkdirSync(logDir, { recursive: true });

  const ts      = Date.now();
  const logFile = path.join(logDir, `bg-${ts}.log`);
  const logFd   = fs.openSync(logFile, 'w');

  // Build args for the supervisor worker: goal + filtered team args
  const filteredArgs = teamArgv.filter(
    (a) => a !== '--background' && a !== '--detach' && a !== '-b',
  );
  const spawnArgs = ['--background-worker', goal, ...filteredArgs];

  const child = spawn(process.execPath, [supervisorScript, ...spawnArgs], {
    detached: true,
    stdio:    ['ignore', logFd, logFd],
    env:      { ...process.env, ROLAND_STATE_DIR: stateDir },
  });

  if (!child.pid) {
    fs.closeSync(logFd);
    throw new Error('Failed to spawn background process');
  }

  // Write PID record before calling unref so we don't lose it
  writeSupervisorRecord(stateDir, {
    pid:       child.pid,
    goal:      goal.slice(0, 120),
    startedAt: ts,
    logFile,
    restarts:  0,
  });

  child.unref();
  fs.closeSync(logFd);

  process.stderr.write('\n');
  process.stderr.write('  ✅ Roland is running in the background\n');
  process.stderr.write(`  PID:     ${child.pid}\n`);
  process.stderr.write(`  Goal:    ${goal.slice(0, 70)}\n`);
  process.stderr.write(`  Logs:    ${logFile}\n`);
  process.stderr.write(`  Monitor: roland bg-status\n`);
  process.stderr.write(`  Tail:    roland bg-logs\n`);
  process.stderr.write(`  Stop:    roland bg-stop\n`);
  process.stderr.write('\n');
}

// ── Supervisor worker main (runs inside the detached process) ─────────────────

/**
 * Entry point when this module is invoked as --background-worker.
 * Implements retry loop with exponential back-off.
 */
async function supervisorWorkerMain(argv: string[]): Promise<void> {
  // argv: ['--background-worker', goal, ...teamArgs]
  const goal     = argv[1];
  const teamArgs = argv.slice(2);
  const stateDir = process.env.ROLAND_STATE_DIR ?? '.roland';

  process.stderr.write(`[Supervisor] Starting: ${goal.slice(0, 60)}\n`);
  process.stderr.write(`[Supervisor] State dir: ${stateDir}\n`);
  process.stderr.write(`[Supervisor] Max restarts: ${MAX_RESTARTS}\n\n`);

  // Import runTeamCli lazily (avoids importing at spawn time for performance)
  const { runTeamCli } = await import('./team-cli.js');

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RESTARTS; attempt++) {
    if (attempt > 0) {
      const delay = RESTART_DELAY_MS * attempt;
      process.stderr.write(`\n[Supervisor] ⚠️  Attempt ${attempt} failed. Restarting in ${delay / 1000}s…\n`);
      await new Promise((r) => setTimeout(r, delay));
      process.stderr.write(`[Supervisor] 🔄 Restart ${attempt}/${MAX_RESTARTS}\n\n`);

      // Update restarts count in PID file
      const rec = readSupervisorRecord(stateDir);
      if (rec) {
        writeSupervisorRecord(stateDir, { ...rec, restarts: attempt });
      }
    }

    try {
      // Run with --quiet to avoid TUI in background, --no-tui for safety
      await runTeamCli([goal, '--quiet', '--no-tui', ...teamArgs]);
      process.stderr.write('\n[Supervisor] ✅ Run completed successfully\n');
      removeSupervisorRecord(stateDir);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      process.stderr.write(`[Supervisor] ❌ Error: ${lastError.message.slice(0, 200)}\n`);
    }
  }

  process.stderr.write(`\n[Supervisor] 💀 All ${MAX_RESTARTS + 1} attempts exhausted. Giving up.\n`);
  if (lastError) process.stderr.write(`[Supervisor] Last error: ${lastError.message}\n`);
  removeSupervisorRecord(stateDir);
  process.exit(1);
}

// ── Standalone entry point ─────────────────────────────────────────────────────

const _thisFile = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] === _thisFile ||
  process.argv[1]?.replace(/\.ts$/, '.js') === _thisFile;

if (isDirectRun && process.argv[2] === '--background-worker') {
  supervisorWorkerMain(process.argv.slice(2)).catch((e: unknown) => {
    process.stderr.write(`[Supervisor] Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
