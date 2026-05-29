#!/usr/bin/env node
/**
 * RCO Team CLI — PM-style parallel agent execution.
 *
 * After global install:
 *   roland team "Build a task management API"
 *   roland team "..." --state-dir .roland --stream
 *   roland team "..." --quiet
 *
 * Via npm scripts (dev):
 *   npm run rco:team:dev -- "Build a task management API"
 *   npm run rco:team:dev -- --task "..." --state-dir .roland
 *
 * Exports runTeamCli() so src/index.ts can delegate the `team` subcommand
 * without re-triggering the standalone main() guard.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { runTeam } from './team-orchestrator.js';
import type { TeamTask } from './team-orchestrator.js';
import type { ReviewDecision } from './pm-prompts.js';
import { RunStateWriter } from './run-state.js';
import { TuiRenderer } from '../dashboard/tui.js';
import { SimpleTuiRenderer, isSimpleTui } from '../dashboard/simple-tui.js';
import { Notifier } from './notifier.js';
import { HitlQueue } from './hitl.js';
import { spawnBackground } from './supervisor.js';

// ── Terminal helpers ──────────────────────────────────────────────────────────

const COLS = Math.min((process.stderr as NodeJS.WriteStream & { columns?: number }).columns ?? 80, 100);

const c = {
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  reset:  (s: string) => `\x1b[0m${s}\x1b[0m`,
};

function progressBar(done: number, total: number, width = 20): string {
  if (total <= 0) return c.dim('░'.repeat(width));
  const filled = Math.min(Math.round((done / total) * width), width);
  return c.green('█'.repeat(filled)) + c.dim('░'.repeat(width - filled));
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function rule(ch = '─', indent = 2): string {
  return ' '.repeat(indent) + ch.repeat(COLS - indent);
}

const err = (s = '') => process.stderr.write(s + '\n');

// ── State helpers ─────────────────────────────────────────────────────────────

/**
 * Delete blackboard.json and messages.json from stateDir.
 * Preserves memory.md — project memory is intentionally cross-run.
 */
function cleanState(stateDir: string): void {
  const targets = ['blackboard.json', 'messages.json'];
  const removed: string[] = [];
  for (const name of targets) {
    const p = path.join(stateDir, name);
    if (fs.existsSync(p)) { fs.rmSync(p); removed.push(name); }
  }
  if (removed.length > 0) {
    err(`  ${c.yellow('🧹')} Cleaned stale state: ${removed.join(', ')} ${c.dim('(memory.md preserved)')}`);
  } else {
    err(`  ${c.dim('🧹 --clean: nothing to remove in ' + stateDir)}`);
  }
}

// ── Arg parsing ───────────────────────────────────────────────────────────────

export interface TeamCliArgs {
  goal: string;
  stateDir: string;
  quiet: boolean;
  stream: boolean;
  noTui: boolean;
  simpleTui: boolean;
  notify: boolean;
  clean: boolean;
  background: boolean;
  noImprove: boolean;
  webhookUrl?: string;
  agentsDir?: string;
  parallel: boolean;
}

export function parseTeamArgs(argv: string[]): TeamCliArgs {
  // Strip leading 'team' subcommand when forwarded from the roland binary
  const args = argv[0] === 'team' ? argv.slice(1) : argv;

  let goal = '';
  let stateDir = '.roland';
  let quiet = false;
  let stream = false;
  let noTui = false;
  let simpleTui = process.env.ROLAND_SIMPLE_TUI === '1'; // env var opt-in
  let notify = false;
  let clean = false;
  let background = false;
  let noImprove  = false;
  let parallel   = process.env.ROLAND_SEQUENTIAL !== '1';
  let webhookUrl: string | undefined;
  let agentsDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--task' || a === '-t') && args[i + 1]) { goal = args[++i]; continue; }
    if (a === '--state-dir' && args[i + 1])             { stateDir = args[++i]; continue; }
    if (a === '--agents-dir' && args[i + 1])            { agentsDir = args[++i]; continue; }
    if (a === '--quiet' || a === '-q')                   { quiet = true; continue; }
    if (a === '--stream' || a === '-s')                  { stream = true; continue; }
    if (a === '--no-tui')                                { noTui = true; continue; }
    if (a === '--simple-tui' || a === '--no-fancy')      { simpleTui = true; continue; }
    if (a === '--notify' || a === '-n')                  { notify = true; continue; }
    if (a === '--clean' || a === '-c')                   { clean = true; continue; }
    if (a === '--background' || a === '--detach' || a === '-b') { background = true; continue; }
    if (a === '--no-improve')                               { noImprove = true; continue; }
    if (a === '--parallel' || a === '-p')              { parallel = true; continue; }
    if (a === '--sequential')                           { parallel = false; continue; }
    if (a === '--webhook' && args[i + 1])                { webhookUrl = args[++i]; notify = true; continue; }
    if (!a.startsWith('-') && !goal)                     { goal = a; continue; }
  }

  return { goal, stateDir, quiet, stream, noTui, simpleTui, notify, clean, background, noImprove, webhookUrl, agentsDir, parallel };
}

// ── Main CLI logic (exported so index.ts can delegate without re-running main) ─

export async function runTeamCli(argv: string[]): Promise<void> {
  const { goal, stateDir, quiet, stream, noTui, simpleTui, notify, clean, background, noImprove, webhookUrl, agentsDir, parallel } = parseTeamArgs(argv);

  if (!goal) {
    err(c.bold('Roland — PM Team Mode'));
    err('');
    err('  ' + c.bold('Usage'));
    err('    roland team "Your goal here"');
    err('    roland team "..." --state-dir .roland');
    err('    roland team "..." --stream');
    err('    roland team "..." --quiet');
    err('    roland team "..." --no-tui');
    err('    roland team "..." --notify');
    err('    roland team "..." --webhook https://ntfy.sh/my-topic');
    err('    roland team "..." --clean');
    err('    roland team "..." --background    Run detached; returns immediately');
    err('');
    err('  ' + c.bold('Flags'));
    err('    --state-dir <dir>       Blackboard + message persistence  ' + c.dim('(default: .roland)'));
    err('    --stream                Print truncated task output as each agent completes');
    err('    --quiet                 Suppress all progress; only print synthesis to stdout');
    err('    --no-tui                Use scrolling log instead of live dashboard');
    err('    --notify                Send desktop notification on complete/error');
    err('    --webhook <url>         POST to URL on complete/error (ntfy.sh, Slack, Discord…)');
    err('    --clean, -c             Delete stale blackboard + messages before starting  ' + c.dim('(preserves memory.md)'));
    err('    --background, --detach  Spawn detached; logs to .roland/logs/  ' + c.dim('(roland bg-status to check)'));
    err('    --no-improve            Skip the self-improvement retrospective phase');
    err('    --sequential            One agent at a time  ' + c.dim('(safe mode for unstable connections; overrides ROLAND_SEQUENTIAL=1)'));
    err('    --parallel              Force parallel even if ROLAND_SEQUENTIAL=1  ' + c.dim('(parallel is the default)'));
    err('');
    process.exit(1);
  }

  // ── CURSOR_API_KEY early check ──────────────────────────────────────────────
  if (!process.env.CURSOR_API_KEY) {
    err('');
    err(`  ${c.bold('❌  CURSOR_API_KEY is not set')}`);
    err('');
    err('  Agent execution requires a Cursor API key. Add to your shell profile:');
    err('');
    err(`    ${c.cyan('export CURSOR_API_KEY=your_key_here')}    ${c.dim('# .zshrc / .bashrc / PowerShell $PROFILE')}`);
    err('');
    err('  Get your key at: https://cursor.com/settings → API Keys');
    err(`  Or diagnose your install: ${c.cyan('roland doctor')}`);
    err('');
    process.exit(1);
  }

  // ── Background / detach mode ───────────────────────────────────────────────
  if (background) {
    await spawnBackground(goal, argv, stateDir);
    return; // parent exits immediately
  }

  // ── Notifier (shared across all modes) ─────────────────────────────────────
  const useNotify = notify || Boolean(webhookUrl);
  const notifier = new Notifier({
    desktop:    notify,
    webhookUrl: webhookUrl,
    onComplete: useNotify,
    onError:    useNotify,
    onBlocker:  useNotify,  // contextual blocker alerts when --notify is set
    onWave:     false,
  });

  // ── HITL queue ─────────────────────────────────────────────────────────────
  const hitlQueue = new HitlQueue(stateDir);

  // ── Clean stale state if requested ──────────────────────────────────────────
  if (clean) cleanState(stateDir);

  // ── Quiet mode — no UI, but still write run-state.json for external monitors ─
  if (quiet) {
    const runStart = Date.now();
    const runState = new RunStateWriter(stateDir, goal);
    try {
      const result = await runTeam({
        goal, stateDir, agentsDir, hitlQueue,
        noImprove, sequential: !parallel, interactive: false,
        onPlanReady:    (tasks)         => { runState.planReady(tasks); },
        onWaveStart:    (w, tasks)      => { runState.waveStart(w, tasks.map((t) => t.id)); },
        onTaskStart:    (id)            => { runState.taskStart(id); },
        onTaskComplete: (id, _a, out, bl) => { runState.taskComplete(id, out, bl); },
        onWaveReview:   ()              => { runState.waveReviewing(); },
        onWaveComplete: (_w, d)         => { runState.waveComplete(d.pmNotes); },
        onTasksSpawned: (tasks)         => { runState.addTasks(tasks); },
        onSynthesizing: ()              => { runState.synthesizing(); },
        onHitlPause:    (p)             => { runState.setHitlPaused(p); },
        onAbortPending: ()              => { runState.setAbortPending(); },
        onBlockerDetected: (taskId, agent, description, waveNumber) => {
          void notifier.notify({
            event: 'blocker', goal,
            summary: `Blocked in wave ${waveNumber}`,
            blockerAgent: agent, blockerDescription: description, waveNumber,
          });
        },
      });
      runState.done();
      console.log(result.synthesis);
      await notifier.notify({
        event: 'complete', goal, summary: 'Run complete',
        tasksCompleted: Object.keys(result.taskResults).length,
        wavesRun: result.wavesRun, blockersEncountered: result.blockersEncountered,
        durationMs: Date.now() - runStart,
      });
    } catch (e) {
      runState.error(e instanceof Error ? e.message : String(e));
      await notifier.notify({ event: 'error', goal, summary: String(e), errorMessage: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      hitlQueue.cleanup();
    }
    return;
  }

  // ── TUI mode — live dashboard (default when stdout is a TTY) ───────────────
  // Auto-detect limited terminals (mobile SSH, dumb, narrow) even without a flag.
  const useTui = !noTui && Boolean((process.stdout as NodeJS.WriteStream).isTTY);
  if (useTui) {
    const runStart = Date.now();
    const runState = new RunStateWriter(stateDir, goal);
    const stateFilePath = path.join(stateDir, 'run-state.json');
    const useSimpleTui = simpleTui || isSimpleTui();

    // Command handler: executes /status /pause /resume /abort /help typed inside the TUI.
    // Uses an indirection object so tui (const) can be referenced after assignment.
    const cmdDispatch = { fn: (_cmd: string): void => { /* populated after tui is created */ } };
    const tui = useSimpleTui
      ? new SimpleTuiRenderer(stateFilePath)
      : new TuiRenderer(stateFilePath, { onCommand: (cmd) => cmdDispatch.fn(cmd) });
    if (tui instanceof TuiRenderer) {
      cmdDispatch.fn = (cmd: string): void => {
        const state = runState.get();
        const totalSec = Math.floor((Date.now() - state.startedAt) / 1000);
        const mm = Math.floor(totalSec / 60);
        const ss = (totalSec % 60).toString().padStart(2, '0');
        const verb = cmd.trim().toLowerCase().split(/\s+/)[0];

        switch (verb) {
          case '/status': {
            const running = state.tasks.filter((t) => state.activeTaskIds.includes(t.id));
            const doneCount = state.tasks.filter(
              (t) => t.status === 'done' || t.status === 'blocked',
            ).length;
            const lines = [
              `${state.status}  ·  Wave ${state.currentWave}  ·  ${doneCount}/${state.totalTasks} tasks  ·  ${mm}m ${ss}s elapsed`,
              running.length > 0
                ? `Running: ${running.map((t) => `${t.agent} · ${t.title.slice(0, 36)}`).join('  |  ')}`
                : 'No agents currently active',
            ];
            if (state.pmNotes) lines.push(`PM: ${state.pmNotes.slice(0, 90)}`);
            tui.showMessage(lines.join('\n'));
            break;
          }
          case '/pause':
            hitlQueue.push({ cmd: 'pause' });
            tui.showMessage('⏸  Pause queued — takes effect before the next wave starts');
            break;
          case '/resume':
            hitlQueue.push({ cmd: 'resume' });
            tui.showMessage('▶  Resume queued — run will continue');
            break;
          case '/abort':
            hitlQueue.push({ cmd: 'abort' });
            tui.showMessage('🛑  Abort queued — run will stop after current wave finishes');
            break;
          case '/help':
            tui.showMessage([
              '/status   Wave, task counts, running agents, elapsed time',
              '/pause    Pause before the next wave starts',
              '/resume   Continue after a pause',
              '/abort    Stop cleanly after the current wave',
            ].join('\n'));
            break;
          default:
            tui.showMessage(`Unknown: ${cmd}  — try /help`);
        }
      };
    }

    tui.start();
    tui.update(runState.get());

    let result;
    try {
      result = await runTeam({
        goal,
        stateDir,
        agentsDir,
        hitlQueue,
        noImprove, sequential: !parallel, interactive: false,
        onBlockerDetected: (taskId, agent, description, waveNumber) => {
          void notifier.notify({
            event: 'blocker', goal,
            summary: `${agent} is blocked in wave ${waveNumber}`,
            blockerAgent: agent, blockerDescription: description, waveNumber,
          });
        },
        onPlanReady: (tasks) => {
          runState.planReady(tasks);
          tui.update(runState.get());
        },
        onWaveStart: (waveNumber, tasks) => {
          runState.waveStart(waveNumber, tasks.map((t) => t.id));
          tui.update(runState.get());
        },
        onTaskStart: (id) => {
          runState.taskStart(id);
          tui.update(runState.get());
        },
        onTaskComplete: (id, _agent, output, hadBlocker) => {
          runState.taskComplete(id, output, hadBlocker);
          tui.update(runState.get());
        },
        onWaveReview: () => {
          runState.waveReviewing();
          tui.update(runState.get());
        },
        onWaveComplete: (_waveNumber, decision) => {
          runState.waveComplete(decision.pmNotes);
          tui.update(runState.get());
        },
        onTasksSpawned: (tasks) => {
          runState.addTasks(tasks);
          tui.update(runState.get());
        },
        onSynthesizing: () => {
          runState.synthesizing();
          tui.update(runState.get());
        },
        onHitlPause: (paused) => {
          runState.setHitlPaused(paused);
          if (!paused) runState.clearConnectionDropped();
          tui.update(runState.get());
        },
        onAbortPending: () => {
          runState.setAbortPending();
          tui.update(runState.get());
        },
        onCircuitBreak: (info) => {
          const agents = info.failedAgents.slice(0, 3).join(', ');
          const msg = `Wave ${info.waveNumber} · ${info.errorCount} network error${info.errorCount !== 1 ? 's' : ''} (${agents})`;
          runState.setConnectionDropped(msg);
          tui.update(runState.get());
        },
      });
    } catch (e) {
      runState.error(e instanceof Error ? e.message : String(e));
      tui.update(runState.get());
      await new Promise((r) => setTimeout(r, 1500));
      tui.stop();
      hitlQueue.cleanup();
      await notifier.notify({ event: 'error', goal, summary: String(e), errorMessage: e instanceof Error ? e.message : String(e) });
      throw e;
    }

    runState.done();
    tui.update(runState.get());
    await new Promise((r) => setTimeout(r, 1200)); // show "Complete" state briefly
    tui.stop();
    hitlQueue.cleanup();
    await notifier.notify({
      event: 'complete', goal, summary: 'Run complete',
      tasksCompleted: Object.keys(result.taskResults).length,
      wavesRun: result.wavesRun, blockersEncountered: result.blockersEncountered,
      durationMs: Date.now() - runStart,
    });

    // ── "What would you like to do next?" prompt (TUI mode) ─────────────────
    const tuiBlockers = result.blockersEncountered;
    err('');
    err('  ' + c.bold('💡  Run complete. What would you like to do next?'));
    err('');
    err(`  ${c.cyan('npm run dev')}                        Start (or restart) the dev server`);
    err(`  ${c.cyan('npm test')}                           Run the full test suite`);
    err(`  ${c.cyan('git add -A && git commit -m "..."')}  Commit all changes`);
    err(`  ${c.cyan('Ctrl+C')}                             Stop any background dev server`);
    if (tuiBlockers > 0) {
      err('');
      err(`  ${c.red('⚠️  ' + tuiBlockers + ' blocker' + (tuiBlockers !== 1 ? 's' : '') + ' need attention — see 🔴 Release Blockers in the synthesis below.')}`);
    }
    err('');
    err(`  ${c.dim('Ask Roland to refine:')}  roland team "Fix the failing tests"  ${c.dim('or')}  roland team "Add X"`);
    err(`  ${c.dim('Full next-step detail in')} ${c.bold('## Next Steps')} ${c.dim('at the bottom of the synthesis ↓')}`);
    err('');

    console.log(result.synthesis);
    return;
  }

  // ── Progress state ─────────────────────────────────────────────────────────
  // Scroll mode also writes run-state.json so external observers (roland status,
  // bg-status) can monitor progress and HITL pause/abort state without a TUI.
  const runState = new RunStateWriter(stateDir, goal);

  // Per-wave tracking: reset each wave so the wave-complete display is accurate
  const waveEntries = new Map<string, { agent: string; title: string; hadBlocker: boolean }>();

  // ── Header ─────────────────────────────────────────────────────────────────
  err('');
  err('  ' + '═'.repeat(COLS - 2));
  err('  ' + c.bold('🚀  Roland PM Team v1.1'));
  err(`  ${c.dim('Goal:')}   ${goal.slice(0, COLS - 12)}`);
  err(`  ${c.dim('State:')}  ${stateDir}`);
  err(`  ${c.dim('Mode:')}   ${parallel ? c.green('parallel') + c.dim(' (4 concurrent agents)') : c.yellow('sequential') + c.dim(' (one agent at a time — safe mode)')}`);
  err('  ' + '═'.repeat(COLS - 2));
  err('');

  const scrollRunStart = Date.now();
  const result = await runTeam({
    goal,
    stateDir,
    agentsDir,
    hitlQueue,
    noImprove,
    sequential: !parallel,
    interactive: Boolean((process.stderr as NodeJS.WriteStream).isTTY) && !noImprove,
    onBlockerDetected: (taskId, agent, description, waveNumber) => {
      void notifier.notify({
        event: 'blocker', goal,
        summary: `${agent} is blocked in wave ${waveNumber}`,
        blockerAgent: agent, blockerDescription: description, waveNumber,
      });
    },

    // ── Plan ready ───────────────────────────────────────────────────────────
    onPlanReady: (tasks: TeamTask[]) => {
      runState.planReady(tasks);
      err(`  ${c.green('✅')} Plan ready — ${tasks.length} task${tasks.length !== 1 ? 's' : ''} scheduled.  ${c.dim('Run')} ${c.cyan('roland status')} ${c.dim('in another terminal to monitor.')}`);
      err('');
    },

    // ── Wave starting ────────────────────────────────────────────────────────
    onWaveStart: (waveNumber: number, tasks: TeamTask[]) => {
      runState.waveStart(waveNumber, tasks.map((t) => t.id));
      waveEntries.clear();
      for (const t of tasks) waveEntries.set(t.id, { agent: t.agent, title: t.title, hadBlocker: false });

      // Use RunStateWriter as single source of truth — counts are always
      // derived from the task array so dynamic spawning is reflected correctly.
      const rs  = runState.get();
      const bar = progressBar(rs.completedTasks, rs.totalTasks);
      err(rule());
      if (parallel) {
        err(
          `  ${c.bold(`Wave ${waveNumber}`)}  ${c.dim('·')}  ${tasks.length} task${tasks.length !== 1 ? 's' : ''} in parallel  ` +
          `${c.dim('[')}${bar}${c.dim(']')}  ${c.dim(rs.completedTasks + '/' + rs.totalTasks + ' tasks done')}`,
        );
      } else {
        const task = tasks[0];
        err(
          `  ${c.bold(`Step ${waveNumber}`)}  ${c.dim('·')}  ${c.cyan(task?.agent ?? '?')}  ${c.dim('·')}  ` +
          `${c.dim((task?.title ?? '').slice(0, 60))}  ` +
          `${c.dim('[')}${bar}${c.dim(']')}  ${c.dim(rs.completedTasks + '/' + rs.totalTasks)}`,
        );
      }
      err('');
    },

    // ── Task starting ────────────────────────────────────────────────────────
    onTaskStart: (id: string, agent: string, title: string) => {
      runState.taskStart(id);
      err(
        `  ${c.cyan('→')} ${c.dim(rpad('[' + id + ']', 10))} ${rpad(agent, 22)} ${c.dim(title.slice(0, 50))}`,
      );
    },

    // ── Task complete ─────────────────────────────────────────────────────────
    onTaskComplete: (id: string, agent: string, output: string, hadBlocker: boolean) => {
      runState.taskComplete(id, output, hadBlocker);
      const entry = waveEntries.get(id);
      if (entry) entry.hadBlocker = hadBlocker;

      const blockerTag = hadBlocker ? '  ' + c.red('🚨 BLOCKER') : '';
      const title = entry?.title ?? '';
      err(
        `  ${c.green('✓')} ${c.dim(rpad('[' + id + ']', 10))} ${rpad(agent, 22)} ${title.slice(0, 44)}${blockerTag}`,
      );

      if (stream && output.trim()) {
        const preview = output.slice(0, 360).replace(/\n{3,}/g, '\n\n');
        err('');
        for (const line of preview.split('\n')) {
          err('    ' + c.dim(line));
        }
        if (output.length > 360) err('    ' + c.dim('…(truncated — full output in synthesis)'));
        err('');
      }
    },

    // ── Wave review (PM evaluating) ─────────────────────────────────────────────
    onWaveReview: () => {
      runState.waveReviewing();
    },

    // ── Tasks spawned during adjust ─────────────────────────────────────────────
    onTasksSpawned: (tasks: TeamTask[]) => {
      runState.addTasks(tasks);
    },

    // ── Synthesizing ────────────────────────────────────────────────────────────
    onSynthesizing: () => {
      runState.synthesizing();
    },

    // ── HITL pause / abort (run-state only; no scroll output needed) ─────────────
    onHitlPause: (paused: boolean) => {
      runState.setHitlPaused(paused);
      if (!paused) runState.clearConnectionDropped();
    },
    onAbortPending: () => {
      runState.setAbortPending();
    },
    onCircuitBreak: (info) => {
      const agents = info.failedAgents.slice(0, 3).join(', ');
      runState.setConnectionDropped(`Wave ${info.waveNumber} · ${info.errorCount} network error${info.errorCount !== 1 ? 's' : ''} (${agents})`);
      err('');
      err(`  ${c.red('🔴')}  ${c.bold('Connection dropped — run paused')}`);
      err(`  ${c.dim('Wave ' + info.waveNumber + ' hit ' + info.errorCount + ' network error' + (info.errorCount !== 1 ? 's' : '') + '.')}`);
      err(`  ${c.dim('Restore connectivity, then resume with:')}  ${c.cyan('roland resume')}  ${c.dim('or')}  ${c.cyan('/resume')}  ${c.dim('(chat)')}`);
      err('');
    },

    // ── Wave complete ─────────────────────────────────────────────────────────
    onWaveComplete: (waveNumber: number, decision: ReviewDecision) => {
      void waveNumber;   // available for future use
      runState.waveComplete(decision.pmNotes);

      const blockerCount = [...waveEntries.values()].filter(e => e.hadBlocker).length;
      err('');
      if (blockerCount > 0) {
        err(`  ${c.red('🚨 ' + blockerCount + ' blocker' + (blockerCount !== 1 ? 's' : '') + ' detected in this wave')}`);
      }

      if (decision.decision === 'continue') {
        err(`  ${c.green('📋')} ${c.bold('PM approved')} — proceeding to next wave`);
      } else {
        err(`  ${c.yellow('🔄')} ${c.bold('PM adjusted')}`);

        if (decision.pmNotes) {
          const note = decision.pmNotes.slice(0, 240);
          // Indent wrapped lines
          const words = note.split(' ');
          const maxW = COLS - 14;
          let line = '';
          const noteLines: string[] = [];
          for (const word of words) {
            if ((line + ' ' + word).length > maxW) { noteLines.push(line); line = word; }
            else { line = line ? line + ' ' + word : word; }
          }
          if (line) noteLines.push(line);
          err(`  ${c.dim('Reason:')} ${noteLines[0] ?? ''}`);
          for (const nl of noteLines.slice(1)) err(`           ${c.dim(nl)}`);
        }

        err('');
        for (const t of (decision.newTasks ?? [])) {
          err(
            `  ${c.green('+')} spawn    ${c.cyan(rpad(t.id, 10))} → ${c.bold(rpad(t.agent, 20))}  ` +
            c.dim('"' + t.title.slice(0, 52) + '"'),
          );
        }
        for (const u of (decision.unblocks ?? [])) {
          err(
            `  ${c.yellow('↑')} unblock  ${c.bold(rpad(u.forAgent, 20))}  ` +
            c.dim('"' + u.message.slice(0, 60) + '"'),
          );
        }
        if ((decision.rescopes ?? []).length > 0) {
          const ids = (decision.rescopes ?? []).map(r => c.cyan(r.taskId)).join(', ');
          err(`  ${c.dim('✎')} re-scope ${ids}`);
        }
      }

      err('');
    },
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  const total    = Object.keys(result.taskResults).length;
  const blockers = result.blockersEncountered;

  err('  ' + '═'.repeat(COLS - 2));
  err(
    `  ${c.green('✅')} ${c.bold('Complete')}  ` +
    `${total} task${total !== 1 ? 's' : ''}  ·  ` +
    `${result.wavesRun} wave${result.wavesRun !== 1 ? 's' : ''}  ·  ` +
    (blockers > 0 ? c.red(`${blockers} blocker${blockers !== 1 ? 's' : ''}`) : c.green('0 blockers')),
  );
  err('');
  err(`  ${c.dim('Blackboard:')}  ${stateDir}/blackboard.json`);
  err(`  ${c.dim('Messages:')}    ${stateDir}/messages.json`);
  err('  ' + '═'.repeat(COLS - 2));
  err('');

  // ── "What would you like to do next?" prompt ────────────────────────────────
  err('  ' + c.bold('💡  Run complete. What would you like to do next?'));
  err('');
  err(`  ${c.cyan('npm run dev')}                        Start (or restart) the dev server`);
  err(`  ${c.cyan('npm test')}                           Run the full test suite`);
  err(`  ${c.cyan('git add -A && git commit -m "..."')}  Commit all changes`);
  err(`  ${c.cyan('Ctrl+C')}                             Stop any background dev server`);
  if (blockers > 0) {
    err('');
    err(`  ${c.red('⚠️  ' + blockers + ' blocker' + (blockers !== 1 ? 's' : '') + ' need attention — see 🔴 Release Blockers in the synthesis below.')}`);
  }
  err('');
  err(`  ${c.dim('Ask Roland to refine:')}  roland team "Fix the failing tests"  ${c.dim('or')}  roland team "Add X"`);
  err(`  ${c.dim('Full next-step detail in')} ${c.bold('## Next Steps')} ${c.dim('at the bottom of the synthesis ↓')}`);
  err('');

  // Notify on completion (rich contextual message)
  runState.done();
  hitlQueue.cleanup();
  await notifier.notify({
    event: 'complete', goal, summary: 'Run complete',
    tasksCompleted: total, wavesRun: result.wavesRun,
    blockersEncountered: blockers, durationMs: Date.now() - scrollRunStart,
  });

  // Synthesis to stdout — pipeable, separable from progress stderr
  console.log(result.synthesis);
}

// ── Standalone entry — guarded so importing this module from index.ts is safe ──

async function main(): Promise<void> {
  await runTeamCli(process.argv.slice(2));
}

const _thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] === _thisFile || process.argv[1]?.replace(/\.ts$/, '.js') === _thisFile) {
  main().catch((e: unknown) => {
    process.stderr.write(`\n❌ Roland Team fatal error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
