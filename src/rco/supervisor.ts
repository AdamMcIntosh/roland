/**
 * Roland Supervisor — true background / detached process mode.
 *
 * Usage (from CLI):
 *   roland team "goal" --background
 *   roland team "goal" --detach
 *   roland run  "goal" --detach      (alias)
 *
 * What it does:
 *   1. Spawns a detached Node.js process that runs the team orchestrator
 *   2. Redirects all output to .roland/logs/bg-<timestamp>.log
 *   3. Writes a PID record to .roland/supervisor.pid
 *   4. Parent process exits immediately
 *   5. Supervisor process auto-restarts on crash (up to MAX_RESTARTS times,
 *      with exponential back-off between attempts)
 *
 * Management commands:
 *   roland bg-status [--json]         Rich status with wave/task/phase progress
 *   roland bg-logs [--lines N]        Tail last N lines of the background log
 *   roland bg-logs --follow           Stream the log live (Ctrl+C to stop)
 *   roland bg-stop                    Gracefully stop (HITL abort → SIGTERM → SIGKILL)
 *
 * Platform notes:
 *   - Works on Windows, macOS, Linux.
 *   - On Windows, process.kill(pid, 0) is used for liveness checks.
 *   - Child processes are fully detached (stdio=ignore, unref()).
 *   - ROLAND_NOTIFY=1 is honoured in background runs even without --notify flag.
 */

import { spawnSilent } from '../utils/spawn-silent.js';
import fs               from 'fs';
import path             from 'path';
import { fileURLToPath } from 'url';
import { readRunState }  from './run-state.js';
import { sanitizeStaleMissionState } from './mission-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_RESTARTS      = 3;
const RESTART_DELAY_MS  = 30_000; // 30 s × attempt number

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
    process.kill(pid, 0); // signal 0 = check existence only
    return true;
  } catch {
    return false;
  }
}

// ── PID file helpers ──────────────────────────────────────────────────────────

export function readSupervisorRecord(stateDir: string): SupervisorRecord | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(stateDir, SUPERVISOR_PID_FILE), 'utf-8'),
    ) as SupervisorRecord;
  } catch {
    return null;
  }
}

function writeSupervisorRecord(stateDir: string, record: SupervisorRecord): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, SUPERVISOR_PID_FILE),
    JSON.stringify(record, null, 2),
    'utf-8',
  );
}

function removeSupervisorRecord(stateDir: string): void {
  try { fs.rmSync(path.join(stateDir, SUPERVISOR_PID_FILE), { force: true }); } catch { /* ignore */ }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1_000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60)  return `${m}m ${r.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}

function progressBar(done: number, total: number, width = 16): string {
  if (total <= 0) return '░'.repeat(width);
  const filled = Math.min(Math.round((done / total) * width), width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function phaseLabel(status: string, wave: number): string {
  switch (status) {
    case 'planning':     return 'planning…';
    case 'running':      return `Wave ${wave} — running`;
    case 'reviewing':    return `Wave ${wave} — PM reviewing`;
    case 'synthesizing': return 'synthesizing…';
    case 'done':         return 'complete ✓';
    case 'error':        return 'error ✗';
    default:             return status;
  }
}

// ── bg-status ─────────────────────────────────────────────────────────────────

export function bgStatus(stateDir: string, json = false): void {
  sanitizeStaleMissionState(stateDir, (msg, detail) => {
    const extra = detail ? ` ${JSON.stringify(detail)}` : '';
    process.stderr.write(`[STATE] ${msg}${extra}\n`);
  });
  const rec      = readSupervisorRecord(stateDir);
  const runState = readRunState(stateDir);

  if (!rec) {
    if (json) {
      console.log(JSON.stringify({ running: false, stateDir }));
    } else {
      process.stderr.write(
        `No background run found.\n` +
        `(No ${SUPERVISOR_PID_FILE} in ${stateDir})\n`,
      );
    }
    return;
  }

  const alive   = isProcessRunning(rec.pid);
  const elapsed = Date.now() - rec.startedAt;

  // ── HITL state (run-state.json + CLI-side hitl-state.json) ───────────────────
  let hitlPaused   = runState?.hitlPaused       ?? false;
  let abortPending = runState?.hitlAbortPending ?? false;
  try {
    const hitlStateFile = path.join(stateDir, 'hitl-state.json');
    const hs = JSON.parse(fs.readFileSync(hitlStateFile, 'utf-8')) as { paused?: boolean; abortPending?: boolean };
    if (hs.paused)       hitlPaused   = true;
    if (hs.abortPending) abortPending = true;
  } catch { /* no hitl state — fine */ }

  if (json) {
    console.log(JSON.stringify({
      running:        alive,
      pid:            rec.pid,
      goal:           rec.goal,
      startedAt:      rec.startedAt,
      elapsedMs:      elapsed,
      restarts:       rec.restarts,
      logFile:        rec.logFile,
      phase:          runState?.status          ?? null,
      wave:           runState?.currentWave     ?? null,
      tasksCompleted: runState?.completedTasks  ?? null,
      totalTasks:     runState?.totalTasks      ?? null,
      hitlPaused:     hitlPaused,
      abortPending:   abortPending,
    }));
    if (!alive) removeSupervisorRecord(stateDir);
    return;
  }

  // ── Rich terminal output ─────────────────────────────────────────────────────
  const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;

  const cols    = Math.min(
    ((process.stderr as NodeJS.WriteStream & { columns?: number }).columns ?? 80),
    88,
  );
  const hr      = dim('─'.repeat(cols - 4));
  const w       = (s = '') => process.stderr.write(s + '\n');
  const row     = (label: string, value: string) =>
    w(`  ${dim(label.padEnd(12))}  ${value}`);

  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const statusIcon  = alive ? green('🟢 Running') : red('🔴 Stopped');
  const hitlSuffix  = hitlPaused
    ? `  ${dim('·')}  ${yellow('⏸ PAUSED')}`
    : abortPending
      ? `  ${dim('·')}  ${yellow('⚠ Abort pending')}`
      : '';
  const phaseStr    = runState ? `  ${dim('·')}  ${phaseLabel(runState.status, runState.currentWave)}${hitlSuffix}` : '';
  const goalSnip    = rec.goal.slice(0, cols - 20);

  w();
  w(`  ${bold('Roland — Background Run')}`);
  w(`  ${hr}`);
  w();
  row('Status',   `${statusIcon}${phaseStr}`);
  row('Goal',     goalSnip + (rec.goal.length > cols - 20 ? '…' : ''));
  row('PID',      String(rec.pid) + (alive ? '' : dim(' (stale)')));
  row('Started',  `${new Date(rec.startedAt).toLocaleTimeString()}  ${dim('(' + fmtElapsed(elapsed) + ' ago)')}`);

  if (runState && runState.totalTasks > 0) {
    const bar    = progressBar(runState.completedTasks, runState.totalTasks);
    const counts = `${runState.completedTasks} / ${runState.totalTasks} tasks  ·  ${runState.currentWave} wave${runState.currentWave !== 1 ? 's' : ''}`;
    row('Progress', `${dim('[' + bar + ']')}  ${dim(counts)}`);
  }

  if (hitlPaused) {
    row('HITL', `${yellow('⏸  Paused')}  — send ${cyan('roland resume')} to continue`);
  } else if (abortPending) {
    row('HITL', `${yellow('⚠  Abort pending')}  — will stop after current wave`);
  }

  row('Restarts', rec.restarts > 0 ? String(rec.restarts) : dim('0'));
  row('Logs',     dim(rec.logFile));
  w();
  w(`  ${hr}`);

  if (alive) {
    w(`  ${cyan('roland bg-logs --follow')}   ${dim('stream log output live')}`);
    w(`  ${cyan('roland bg-stop')}            ${dim('gracefully stop the run')}`);
    w(`  ${cyan('roland status')}             ${dim('live TUI observer')}`);
  } else {
    w(`  ${dim('Process is no longer running. Cleaning up PID file…')}`);
    removeSupervisorRecord(stateDir);
  }
  w();
}

// ── bg-logs ───────────────────────────────────────────────────────────────────

/** Resolve the log file path — from PID record or most recent file in logs/. */
function resolveLogFile(stateDir: string): string | null {
  const rec = readSupervisorRecord(stateDir);
  if (rec?.logFile && fs.existsSync(rec.logFile)) return rec.logFile;

  const logDir = path.join(stateDir, SUPERVISOR_LOG_DIR);
  try {
    const files = fs.readdirSync(logDir)
      .filter((f) => f.startsWith('bg-') && f.endsWith('.log'))
      .sort()
      .reverse();
    return files.length > 0 ? path.join(logDir, files[0]) : null;
  } catch {
    return null;
  }
}

export function bgLogs(stateDir: string, lines = 50): void {
  const logFile = resolveLogFile(stateDir);
  if (!logFile) { process.stderr.write('No background logs found.\n'); return; }

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

/**
 * Stream the background log live, printing new content as it is appended.
 * Prints all existing content first, then follows until Ctrl+C.
 */
export function bgLogsFollow(stateDir: string): void {
  const logFile = resolveLogFile(stateDir);
  if (!logFile) { process.stderr.write('No background logs found.\n'); return; }

  // Print existing content
  let offset = 0;
  try {
    const existing = fs.readFileSync(logFile, 'utf-8');
    if (existing) { process.stdout.write(existing); }
    offset = Buffer.byteLength(existing, 'utf-8');
  } catch { /* empty / not yet created */ }

  process.stderr.write(`\n--- Following ${logFile} (Ctrl+C to stop) ---\n\n`);

  // Watch for new content
  let watchTimer: ReturnType<typeof setInterval> | null = null;

  const checkNewContent = () => {
    try {
      const stat = fs.statSync(logFile);
      if (stat.size <= offset) return;
      const fd     = fs.openSync(logFile, 'r');
      const newLen = stat.size - offset;
      const buf    = Buffer.alloc(newLen);
      fs.readSync(fd, buf, 0, newLen, offset);
      fs.closeSync(fd);
      offset = stat.size;
      process.stdout.write(buf.toString('utf-8'));
    } catch { /* file may have rotated */ }
  };

  try {
    fs.watchFile(logFile, { interval: 200, persistent: true }, checkNewContent);
  } catch {
    // Fall back to polling
    watchTimer = setInterval(checkNewContent, 500);
  }

  const cleanup = () => {
    try { fs.unwatchFile(logFile); } catch { /* ignore */ }
    if (watchTimer) clearInterval(watchTimer);
    process.stderr.write('\n--- Stopped following ---\n');
    process.exit(0);
  };

  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the process alive
  setInterval(() => {
    // Auto-stop following if the background run has finished
    const rec = readSupervisorRecord(stateDir);
    if (!rec || !isProcessRunning(rec.pid)) {
      // Flush any remaining output, then exit
      checkNewContent();
      setTimeout(() => {
        process.stderr.write('\n--- Background run finished ---\n');
        process.exit(0);
      }, 600);
    }
  }, 5_000);
}

// ── bg-stop ───────────────────────────────────────────────────────────────────

/**
 * Gracefully stop a background run:
 *   1. Write a HITL abort command so the orchestrator exits at wave boundary
 *   2. Wait up to 8 s for the process to exit on its own
 *   3. SIGTERM if still running, then SIGKILL after 3 s
 */
export function bgStop(stateDir: string): void {
  const rec = readSupervisorRecord(stateDir);
  if (!rec) { process.stderr.write('No background run found.\n'); return; }

  if (!isProcessRunning(rec.pid)) {
    process.stderr.write(`Process ${rec.pid} is no longer running.\n`);
    removeSupervisorRecord(stateDir);
    return;
  }

  // Step 1: Write HITL abort so the orchestrator can finish its current wave
  try {
    const hitlPath = path.join(stateDir, 'hitl.json');
    let existing: unknown[] = [];
    try { existing = JSON.parse(fs.readFileSync(hitlPath, 'utf-8')); } catch { /* new */ }
    existing.push({ cmd: 'abort', timestamp: Date.now(), id: Math.random().toString(36).slice(2, 10) });
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(hitlPath, JSON.stringify(existing, null, 2), 'utf-8');
    process.stderr.write(`⏹  Abort sent — waiting for graceful shutdown (up to 8s)…\n`);
  } catch {
    process.stderr.write(`⚠️  Could not write abort command — escalating to SIGTERM\n`);
  }

  // Step 2: Poll for natural exit (up to 8 s)
  let waited = 0;
  const pollInterval = 500;
  const maxWait = 8_000;

  const poll = setInterval(() => {
    waited += pollInterval;

    if (!isProcessRunning(rec.pid)) {
      clearInterval(poll);
      removeSupervisorRecord(stateDir);
      process.stderr.write(`✅ Process exited gracefully.\n`);
      return;
    }

    if (waited >= maxWait) {
      clearInterval(poll);
      process.stderr.write(`   Process still running after ${maxWait / 1000}s — sending SIGTERM…\n`);

      try { process.kill(rec.pid, 'SIGTERM'); } catch { /* already gone */ }

      setTimeout(() => {
        try {
          if (isProcessRunning(rec.pid)) {
            process.kill(rec.pid, 'SIGKILL');
            process.stderr.write(`   Force-killed PID ${rec.pid}\n`);
          }
        } catch { /* already gone */ }
        removeSupervisorRecord(stateDir);
        process.stderr.write(`✅ Stopped. PID file removed.\n`);
      }, 3_000);
    }
  }, pollInterval);
}

// ── spawnBackground ───────────────────────────────────────────────────────────

/**
 * Spawn a fully detached supervisor process and return immediately.
 * The parent writes a PID record and unrefs the child.
 */
export async function spawnBackground(
  goal:     string,
  teamArgv: string[],  // full argv as passed to runTeamCli, includes 'team' prefix
  stateDir: string,
): Promise<void> {
  const supervisorScript = path.join(__dirname, 'supervisor.js');
  if (!fs.existsSync(supervisorScript)) {
    throw new Error(
      `Supervisor script not found at ${supervisorScript}. Run \`npm run build\` first.`,
    );
  }

  const logDir  = path.join(stateDir, SUPERVISOR_LOG_DIR);
  fs.mkdirSync(logDir, { recursive: true });

  const ts      = Date.now();
  const logFile = path.join(logDir, `bg-${ts}.log`);

  // Filter out the background flags; the worker runs with --quiet + --no-tui
  const filteredArgs = teamArgv.filter(
    (a) => a !== '--background' && a !== '--detach' && a !== '-b',
  );

  const child = spawnSilent(
    process.execPath,
    [supervisorScript, '--background-worker', goal, ...filteredArgs],
    {
      env: { ROLAND_STATE_DIR: stateDir },
      log: { logFile, logMode: 'w' },
    },
  );

  if (!child.pid) {
    throw new Error('Failed to spawn background process — no PID assigned');
  }

  writeSupervisorRecord(stateDir, {
    pid:       child.pid,
    goal:      goal.slice(0, 120),
    startedAt: ts,
    logFile,
    restarts:  0,
  });

  const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

  process.stderr.write('\n');
  process.stderr.write(`  ${bold('✅ Roland is running in the background')}\n`);
  process.stderr.write(`\n`);
  process.stderr.write(`  ${dim('PID')}       ${child.pid}\n`);
  process.stderr.write(`  ${dim('Goal')}      ${goal.slice(0, 70)}${goal.length > 70 ? '…' : ''}\n`);
  process.stderr.write(`  ${dim('Logs')}      ${logFile}\n`);
  process.stderr.write(`\n`);
  process.stderr.write(`  ${cyan('roland bg-status')}           check progress + wave info\n`);
  process.stderr.write(`  ${cyan('roland bg-logs --follow')}    stream log output live\n`);
  process.stderr.write(`  ${cyan('roland bg-stop')}             gracefully stop the run\n`);
  process.stderr.write('\n');
}

// ── Supervisor worker main (runs inside the detached process) ─────────────────

/**
 * Entry point when invoked as the background worker.
 * Implements a retry loop with exponential back-off.
 * Injects --notify when ROLAND_NOTIFY=1 env var is set.
 */
async function supervisorWorkerMain(argv: string[]): Promise<void> {
  // argv[0] = '--background-worker', argv[1] = goal, argv[2+] = team args
  const goal     = argv[1] ?? '';
  const teamArgs = argv.slice(2);
  const stateDir = process.env.ROLAND_STATE_DIR ?? '.roland';

  // Inject --notify when ROLAND_NOTIFY=1 is set globally but --notify wasn't passed
  const needsNotify =
    (process.env.ROLAND_NOTIFY === '1' || process.env.ROLAND_NOTIFY === 'true') &&
    !teamArgs.includes('--notify') &&
    !teamArgs.includes('-n');
  const finalArgs = needsNotify ? [...teamArgs, '--notify'] : teamArgs;

  process.stderr.write(`[Supervisor] Starting: ${goal.slice(0, 60)}\n`);
  process.stderr.write(`[Supervisor] State dir: ${stateDir}\n`);
  process.stderr.write(`[Supervisor] Max restarts: ${MAX_RESTARTS}\n`);

  // Loop recovery intel — checkpoint / loop-state available for orchestrator resume.
  try {
    const { tryRecoverLoopState } = await import('../loop-engine/loop-checkpoint.js');
    const recovery = tryRecoverLoopState(stateDir);
    if (recovery.recovered) {
      process.stderr.write(
        `[Supervisor] Loop recovery available from ${recovery.source} ` +
          `(phase=${recovery.phase} iter=${recovery.state?.iteration})\n`,
      );
    }
  } catch {
    // Loop engine not built — supervisor continues without recovery hint.
  }
  if (needsNotify) process.stderr.write(`[Supervisor] ROLAND_NOTIFY=1 detected — notifications enabled\n`);
  process.stderr.write('\n');

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
      if (rec) writeSupervisorRecord(stateDir, { ...rec, restarts: attempt });
    }

    try {
      // Always run quietly and without TUI in background; pass through all other flags
      await runTeamCli([goal, '--quiet', '--no-tui', ...finalArgs]);
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

// ── Standalone entry point ────────────────────────────────────────────────────

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
