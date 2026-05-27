/**
 * Roland Chat Interface — calm, modern, Claude-Code-style terminal UX.
 *
 * Activated when `roland` is run with no arguments in an interactive TTY.
 * Provides a chat-first experience: type a natural language goal or /command.
 *
 * Design principles (v2):
 *   - Conversational: Roland "speaks" before and after every run
 *   - Quiet progress: compact task lines, wave summaries not verbose transcripts
 *   - Visual hierarchy: dim=infrastructure, bold=user goals, cyan=actions
 *   - No alternate screen: scroll-back-friendly, SSH-safe (unless fancy TUI picked)
 *   - Auto-detects simple/SSH mode via isSimpleTui()
 */

import readline from 'readline';
import fs   from 'fs';
import path from 'path';
import { runTeam } from './team-orchestrator.js';
import type { TeamTask } from './team-orchestrator.js';
import type { ReviewDecision } from './pm-prompts.js';
import { RunStateWriter } from './run-state.js';
import { Notifier } from './notifier.js';
import { HitlQueue } from './hitl.js';
import { isSimpleTui } from '../dashboard/simple-tui.js';

// ── Terminal helpers ──────────────────────────────────────────────────────────

const cols = (): number =>
  Math.min(
    (process.stderr as NodeJS.WriteStream & { columns?: number }).columns ?? 80,
    100,
  );

/** ANSI colour helpers — every one resets after the string. */
const c = {
  bold:    (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:     (s: string) => `\x1b[2m${s}\x1b[0m`,
  italic:  (s: string) => `\x1b[3m${s}\x1b[0m`,
  reset:   (s: string) => `\x1b[0m${s}\x1b[0m`,
  red:     (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow:  (s: string) => `\x1b[33m${s}\x1b[0m`,
  green:   (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan:    (s: string) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  blue:    (s: string) => `\x1b[34m${s}\x1b[0m`,
  white:   (s: string) => `\x1b[97m${s}\x1b[0m`,
};

/** Strip ANSI codes (for length math). */
const visLen = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length;

/** Right-pad a string to visual length n. */
function rpad(s: string, n: number): string {
  const v = visLen(s);
  return v >= n ? s : s + ' '.repeat(n - v);
}

/** Write a line to stderr (all UI output; only synthesis goes to stdout). */
const ln = (s = ''): void => { process.stderr.write(s + '\n'); };

/** Horizontal rule using ch, full terminal width minus small left-margin. */
function rule(ch = '─', indent = 2): string {
  return ' '.repeat(indent) + ch.repeat(Math.max(4, cols() - indent));
}

/** Simple [███░░░] progress bar. */
function progressBar(done: number, total: number, width = 16): string {
  if (total <= 0) return c.dim('░'.repeat(width));
  const filled = Math.min(Math.round((done / total) * width), width);
  return c.green('█'.repeat(filled)) + c.dim('░'.repeat(width - filled));
}

/** Human-readable elapsed time. */
function elapsedStr(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m   = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}

/** Very rough ETA: assume ~3 min per parallel wave task capped at 25 min. */
function estimateWaveMin(taskCount: number): string {
  const mins = Math.min(Math.ceil(taskCount * 3), 25);
  return mins <= 5 ? `~${mins} min` : `~${mins}–${Math.min(mins + 5, 30)} min`;
}

// ── Chat context ──────────────────────────────────────────────────────────────

export interface ChatContext {
  stateDir:   string;
  notify:     boolean;
  stream:     boolean;
  noImprove:  boolean;
  webhookUrl?: string;
  agentsDir?:  string;
  simple:      boolean;
  // Runtime state
  lastGoal?: string;
  runCount:  number;
}

// ── Welcome banner ────────────────────────────────────────────────────────────

function printWelcome(ctx: ChatContext): void {
  const W      = Math.min(cols(), 64);
  const simple = ctx.simple;
  ln('');

  if (simple) {
    // ── ASCII fallback (SSH / narrow / dumb) ─────────────────────────────────
    ln('  ' + '='.repeat(Math.max(4, W - 4)));
    ln(`  ${c.bold('Roland')}  ·  AI Engineering Team`);
    ln('  ' + '='.repeat(Math.max(4, W - 4)));
    ln('');
    ln('  Type a goal to run your team.');
    ln(`  ${c.dim('/help')} for commands  ·  ${c.dim('/exit')} to quit`);
  } else {
    // ── Unicode box (full terminal) ───────────────────────────────────────────
    const inner = W - 4;

    const row = (text: string): string => {
      const pad = inner - visLen(text) - 1;
      return '  │ ' + text + ' '.repeat(Math.max(0, pad)) + '│';
    };
    const h = (ch: string): string => '  ├' + ch.repeat(inner) + '┤';

    ln('  ╭' + '─'.repeat(inner) + '╮');
    ln(row(''));
    ln(row(c.bold(c.white('Roland')) + '  ' + c.dim('AI Engineering Team')));
    ln(row(''));
    ln(h('─'));
    ln(row(c.dim('Type a goal to run your team')));
    ln(row(c.dim('/help for commands  ·  /exit to quit')));
    ln(row(''));
    ln('  ╰' + '─'.repeat(inner) + '╯');
  }

  ln('');

  // ── Session config line ───────────────────────────────────────────────────
  const notifyLabel  = ctx.notify     ? c.green('on')  : c.dim('off');
  const streamLabel  = ctx.stream     ? c.green('on')  : c.dim('off');
  const improveLabel = !ctx.noImprove ? c.green('on')  : c.dim('off');
  ln(
    `  ${c.dim('State:')} ${c.dim(ctx.stateDir)}  ` +
    `${c.dim('·')}  ${c.dim('notify:')} ${notifyLabel}  ` +
    `${c.dim('·')}  ${c.dim('stream:')} ${streamLabel}  ` +
    `${c.dim('·')}  ${c.dim('improve:')} ${improveLabel}`,
  );

  if (!process.env.CURSOR_API_KEY) {
    ln('');
    ln(`  ${c.yellow('⚠')}  ${c.bold('CURSOR_API_KEY not set')} — goals will fail.`);
    ln(`     ${c.dim('export CURSOR_API_KEY=your_key_here')}`);
  }

  ln('');
}

// ── Help reference ────────────────────────────────────────────────────────────

function printChatHelp(): void {
  const S = '  ';
  ln('');
  ln(`${S}${c.bold('GOALS')}  ${c.dim('— just type naturally')}`);
  ln(`${S}  ${c.dim(c.italic('"Add rate limiting to the password reset endpoint"'))}`);
  ln(`${S}  ${c.dim(c.italic('"Write unit tests for the auth module"'))}`);
  ln(`${S}  ${c.dim(c.italic('"Refactor the database layer to use repositories"'))}`);
  ln('');
  ln(`${S}${c.bold('RUN CONTROLS')}`);
  ln(`${S}  ${c.cyan('/pause')}                    Pause before next wave`);
  ln(`${S}  ${c.cyan('/resume')}                   Resume a paused run`);
  ln(`${S}  ${c.cyan('/abort')}                    Stop after current wave`);
  ln(`${S}  ${c.cyan('/inject')} ${c.dim('"directive"')}       PM directive (mid-run)`);
  ln(`${S}  ${c.cyan('/replan')}                   Ask PM to re-evaluate`);
  ln(`${S}  ${c.cyan('/unblock')} ${c.dim('<id> [msg]')}       Unblock a task`);
  ln(`${S}  ${c.cyan('/status')}                   Show current run state`);
  ln('');
  ln(`${S}${c.bold('BACKGROUND')}`);
  ln(`${S}  ${c.cyan('/bg-status')}                Check background run`);
  ln(`${S}  ${c.cyan('/bg-logs')}                  Tail background logs`);
  ln(`${S}  ${c.cyan('/bg-stop')}                  Stop background run`);
  ln('');
  ln(`${S}${c.bold('SETTINGS')}`);
  ln(`${S}  ${c.cyan('/stream')} ${c.dim('[on|off]')}           Toggle task output previews`);
  ln(`${S}  ${c.cyan('/notify')} ${c.dim('[on|off]')}           Toggle desktop notifications`);
  ln(`${S}  ${c.cyan('/improve')} ${c.dim('[on|off]')}          Toggle self-improvement`);
  ln(`${S}  ${c.cyan('/state-dir')} ${c.dim('<dir>')}           Set persistence directory`);
  ln(`${S}  ${c.cyan('/clean')}                    Clear blackboard + messages`);
  ln('');
  ln(`${S}${c.bold('META')}`);
  ln(`${S}  ${c.cyan('/refine')} ${c.dim('"goal"')}             Run a follow-up goal`);
  ln(`${S}  ${c.cyan('/clear')}                    Clear the screen`);
  ln(`${S}  ${c.cyan('/help')}                     Show this help`);
  ln(`${S}  ${c.cyan('/exit')}  ${c.dim('or')}  ${c.cyan('/quit')}           Exit Roland`);
  ln('');
}

// ── Run a goal inline ─────────────────────────────────────────────────────────

async function runGoalInline(goal: string, ctx: ChatContext): Promise<void> {
  const W = cols();

  // ── Conversational lead-in ─────────────────────────────────────────────────
  ln('');
  // Truncate long goals gracefully with ellipsis
  const goalDisplay = goal.length > W - 18
    ? goal.slice(0, W - 21) + '…'
    : goal;
  ln(`  ${c.bold('You')}  ${c.dim('·')}  ${goalDisplay}`);
  ln('');

  if (!process.env.CURSOR_API_KEY) {
    ln(`  ${c.red('✗')}  ${c.bold('CURSOR_API_KEY not set.')}  Set it first:`);
    ln(`     ${c.dim('export CURSOR_API_KEY=your_key_here')}`);
    ln('');
    return;
  }

  // "Thinking" response before planning begins
  ln(`  ${c.dim('○')}  ${c.dim('Roland')}  ${c.dim('·')}  ${c.italic(c.dim('Planning your team…'))}`);
  ln('');

  const runState  = new RunStateWriter(ctx.stateDir, goal);
  const useNotify = ctx.notify || Boolean(ctx.webhookUrl);
  const notifier  = new Notifier({
    desktop:    ctx.notify,
    webhookUrl: ctx.webhookUrl,
    onComplete: useNotify,
    onError:    useNotify,
    onBlocker:  useNotify,
    onWave:     false,
  });
  const hitlQueue = new HitlQueue(ctx.stateDir);
  const runStart  = Date.now();

  // Track per-wave metadata for summaries
  type WaveEntry = { agent: string; title: string; hadBlocker: boolean; startMs?: number };
  const waveEntries  = new Map<string, WaveEntry>();
  let waveStartTime  = Date.now();
  let totalPlanned   = 0;

  try {
    const result = await runTeam({
      goal,
      stateDir:    ctx.stateDir,
      agentsDir:   ctx.agentsDir,
      hitlQueue,
      noImprove:   ctx.noImprove,
      interactive: Boolean((process.stderr as NodeJS.WriteStream).isTTY) && !ctx.noImprove,

      onBlockerDetected: (_taskId, agent, description, waveNumber) => {
        void notifier.notify({
          event: 'blocker', goal,
          summary:          `${agent} blocked on wave ${waveNumber}`,
          blockerAgent:      agent,
          blockerDescription: description,
          waveNumber,
        });
      },

      // ── Plan ready ──────────────────────────────────────────────────────────
      onPlanReady: (tasks: TeamTask[]) => {
        runState.planReady(tasks);
        totalPlanned = tasks.length;

        // Overwrite the "planning…" feel with a confirmed plan line
        const est = estimateWaveMin(tasks.length);
        ln(
          `  ${c.green('✓')}  ${c.bold('Roland')}  ${c.dim('·')}  ` +
          `${c.bold(String(tasks.length))} task${tasks.length !== 1 ? 's' : ''} planned` +
          `  ${c.dim('·')}  ${c.dim('est. ' + est)}`,
        );
        ln('');
      },

      // ── Wave starting ────────────────────────────────────────────────────────
      onWaveStart: (waveNumber: number, tasks: TeamTask[]) => {
        runState.waveStart(waveNumber, tasks.map((t) => t.id));
        waveEntries.clear();
        waveStartTime = Date.now();
        for (const t of tasks) {
          waveEntries.set(t.id, { agent: t.agent, title: t.title, hadBlocker: false });
        }

        const rs  = runState.get();
        const bar = progressBar(rs.completedTasks, rs.totalTasks, 14);

        // Wave header — compact, not intrusive
        ln(rule('─'));
        ln(
          `  ${c.bold(`Wave ${waveNumber}`)}` +
          `  ${c.dim('·')}  ${tasks.length} task${tasks.length !== 1 ? 's' : ''}` +
          `  ${bar}  ${c.dim(rs.completedTasks + '/' + rs.totalTasks)}`,
        );
        ln('');
      },

      // ── Task starting — dim; just shows what's in flight ────────────────────
      onTaskStart: (id: string, agent: string, title: string) => {
        runState.taskStart(id);
        const entry = waveEntries.get(id);
        if (entry) entry.startMs = Date.now();

        // Use a dim arrow so it recedes vs. completions
        ln(
          `  ${c.dim('→')}  ${c.dim(rpad(agent, 20))}  ` +
          `${c.dim(title.slice(0, Math.max(10, W - 28)))}`,
        );
      },

      // ── Task complete — more prominent than start ────────────────────────────
      onTaskComplete: (id: string, agent: string, output: string, hadBlocker: boolean) => {
        runState.taskComplete(id, output, hadBlocker);
        const entry = waveEntries.get(id);
        if (entry) entry.hadBlocker = hadBlocker;

        const task  = runState.get().tasks.find((t) => t.id === id);
        const dur   = (task?.startedAt && task?.completedAt)
          ? c.dim('  ' + elapsedStr(task.completedAt - task.startedAt))
          : '';
        const badge = hadBlocker
          ? `  ${c.red('⚡ blocked')}`
          : '';

        ln(
          `  ${hadBlocker ? c.red('✗') : c.green('✓')}  ` +
          `${rpad(agent, 20)}  ` +
          `${(entry?.title ?? '').slice(0, Math.max(10, W - 32))}` +
          `${dur}${badge}`,
        );

        if (ctx.stream && output.trim()) {
          const preview = output.slice(0, 320).replace(/\n{3,}/g, '\n\n');
          ln('');
          for (const l of preview.split('\n')) ln(`     ${c.dim(l)}`);
          if (output.length > 320) ln(`     ${c.dim('…(full output in synthesis)')}`);
          ln('');
        }
      },

      // ── Wave review — one calm line ──────────────────────────────────────────
      onWaveReview: () => {
        runState.waveReviewing();
        ln('');
        ln(`  ${c.dim('○')}  ${c.dim('Lead PM reviewing results…')}`);
      },

      // ── Tasks spawned mid-run ────────────────────────────────────────────────
      onTasksSpawned: (tasks: TeamTask[]) => {
        runState.addTasks(tasks);
        for (const t of tasks) {
          ln(
            `  ${c.cyan('+')}  ${c.dim('spawn')}  ${c.bold(rpad(t.agent, 18))}  ` +
            `${c.dim('"' + t.title.slice(0, 52) + '"')}`,
          );
        }
      },

      // ── Wave complete ────────────────────────────────────────────────────────
      onWaveComplete: (waveNumber: number, decision: ReviewDecision) => {
        void waveNumber;
        runState.waveComplete(decision.pmNotes);

        const blockers   = [...waveEntries.values()].filter((e) => e.hadBlocker).length;
        const waveDur    = elapsedStr(Date.now() - waveStartTime);
        const newTasks   = decision.newTasks ?? [];
        const unblocks   = decision.unblocks ?? [];
        const adjust     = decision.decision !== 'continue';

        ln('');

        if (blockers > 0) {
          ln(
            `  ${c.red('⚡')}  ${blockers} blocker${blockers !== 1 ? 's' : ''} this wave` +
            `  ${c.dim('—')}  ${c.dim('see synthesis for details')}`,
          );
        }

        if (!adjust) {
          ln(
            `  ${c.dim('└')}  Wave done  ${c.dim('·')}  ${c.dim(waveDur)}` +
            `  ${c.dim('·')}  ${c.green('PM approved')}`,
          );
        } else {
          ln(
            `  ${c.dim('└')}  Wave done  ${c.dim('·')}  ${c.dim(waveDur)}` +
            `  ${c.dim('·')}  ${c.yellow('PM adjusted plan')}`,
          );
          if (decision.pmNotes) {
            const note = decision.pmNotes.slice(0, W - 8).replace(/\n/g, ' ');
            ln(`     ${c.dim(note)}`);
          }
          for (const t of newTasks) {
            ln(
              `     ${c.cyan('+')}  ${c.bold(rpad(t.agent, 18))}  ` +
              `${c.dim('"' + t.title.slice(0, 52) + '"')}`,
            );
          }
          for (const u of unblocks) {
            ln(
              `     ${c.yellow('↑')}  ${c.bold(rpad(u.forAgent, 18))}  ` +
              `${c.dim('"' + u.message.slice(0, 52) + '"')}`,
            );
          }
        }

        ln('');
      },

      // ── Synthesizing ─────────────────────────────────────────────────────────
      onSynthesizing: () => {
        runState.synthesizing();
        ln(rule('─'));
        ln(`  ${c.dim('○')}  ${c.dim('Synthesizing final deliverable…')}`);
        ln('');
      },

      // ── HITL pause / resume ───────────────────────────────────────────────────
      onHitlPause: (paused: boolean) => {
        runState.setHitlPaused(paused);
        ln('');
        if (paused) {
          ln(`  ${c.yellow('⏸')}  ${c.bold('Run paused')}  ${c.dim('—')}  type ${c.cyan('/resume')} to continue`);
        } else {
          ln(`  ${c.green('▶')}  ${c.bold('Resumed')}`);
        }
        ln('');
      },

      // ── Abort pending ─────────────────────────────────────────────────────────
      onAbortPending: () => {
        runState.setAbortPending();
        ln('');
        ln(`  ${c.yellow('⚠')}  Abort queued — stopping after current wave`);
        ln('');
      },
    });

    // ── Run complete ───────────────────────────────────────────────────────────
    const total    = Object.keys(result.taskResults).length;
    const blockers = result.blockersEncountered;
    const dur      = elapsedStr(Date.now() - runStart);

    runState.done();
    hitlQueue.cleanup();
    ctx.lastGoal = goal;
    ctx.runCount++;

    ln(rule('═'));
    ln(
      `  ${c.bold(c.green('✓  Complete'))}` +
      `  ${c.dim('·')}  ${total} task${total !== 1 ? 's' : ''}` +
      `  ${c.dim('·')}  ${result.wavesRun} wave${result.wavesRun !== 1 ? 's' : ''}` +
      `  ${c.dim('·')}  ${blockers > 0 ? c.red(blockers + ' blocked') : c.green('clean')}` +
      `  ${c.dim('·')}  ${c.dim(dur)}`,
    );
    ln(rule('═'));
    ln('');

    if (blockers > 0) {
      ln(
        `  ${c.yellow('⚠')}  ${blockers} task${blockers !== 1 ? 's' : ''} blocked — ` +
        `see ${c.red('🔴 Release Blockers')} in the synthesis below.`,
      );
      ln('');
    }

    // Synthesis to stdout so it can be piped/redirected independently of UI
    console.log(result.synthesis);

    // ── Conversational "what next?" ────────────────────────────────────────────
    ln('');
    ln(`  ${c.bold('What\'s next?')}`);
    ln(`  ${c.dim('Type another goal, or try:')}`);
    ln(`  ${c.cyan('/refine')} ${c.dim('"Fix the failing tests"')}   run a follow-up`);
    ln(`  ${c.cyan('/status')}                        check run state`);
    ln(`  ${c.cyan('/help')}                          all commands`);
    ln('');

    await notifier.notify({
      event: 'complete', goal, summary: 'Run complete',
      tasksCompleted: total, wavesRun: result.wavesRun,
      blockersEncountered: blockers, durationMs: Date.now() - runStart,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    runState.error(msg);
    hitlQueue.cleanup();

    ln('');
    ln(`  ${c.red('✗')}  ${c.bold('Run failed')}  ${c.dim('·')}  ${msg.slice(0, 200)}`);
    if (msg.includes('CURSOR_API_KEY')) {
      ln(`     ${c.dim('Set your key: export CURSOR_API_KEY=your_key_here')}`);
    }
    ln('');

    await notifier.notify({
      event: 'error', goal, summary: msg, errorMessage: msg,
    });
  }
}

// ── Slash command handler ─────────────────────────────────────────────────────

async function handleCommand(input: string, ctx: ChatContext): Promise<void> {
  const parts  = input.slice(1).trim().split(/\s+/);
  const cmd    = (parts[0] ?? '').toLowerCase();
  const args   = parts.slice(1);
  // Strip surrounding quotes from a joined arg string
  const argStr = args.join(' ').replace(/^['"]|['"]$/g, '');

  switch (cmd) {

    // ── Help / meta ───────────────────────────────────────────────────────────
    case 'help': case 'h':
      printChatHelp();
      break;

    case 'exit': case 'quit': case 'q':
      ln('');
      ln(`  ${c.dim('Goodbye. Run')} ${c.cyan('roland')} ${c.dim('anytime.')}`);
      ln('');
      process.exit(0);
      break;

    case 'clear':
      // Full-screen clear then redraw welcome
      process.stderr.write('\x1b[2J\x1b[H');
      printWelcome(ctx);
      break;

    // ── Run state ─────────────────────────────────────────────────────────────
    case 'status': {
      const { readRunState } = await import('./run-state.js');
      const state = readRunState(ctx.stateDir);
      ln('');
      if (!state) {
        ln(`  ${c.dim('No active run in')} ${ctx.stateDir}`);
        ln(`  ${c.dim('Type a goal to start.')}`);
      } else {
        const W   = cols();
        const bar = progressBar(state.completedTasks, state.totalTasks, 14);
        ln(`  ${c.bold('Status')}  ${c.dim('·')}  ${state.goal.slice(0, W - 18)}`);
        ln('');
        ln(
          `  ${rpad(state.status, 14)}  ` +
          `${bar}  ` +
          `${c.dim(state.completedTasks + '/' + state.totalTasks + ' tasks')}  ` +
          `${c.dim('wave ' + state.currentWave)}`,
        );
        if (state.hitlPaused)       ln(`  ${c.yellow('⏸  Paused')}`);
        if (state.hitlAbortPending) ln(`  ${c.yellow('⚠  Abort pending')}`);
      }
      ln('');
      break;
    }

    // ── HITL controls ─────────────────────────────────────────────────────────
    case 'pause': {
      const { writeHitlCommand, isRunActive } = await import('./hitl.js');
      if (!isRunActive(ctx.stateDir)) {
        ln(`  ${c.yellow('⚠')}  No active run.`);
      } else {
        writeHitlCommand(ctx.stateDir, { cmd: 'pause' });
        ln(`  ${c.yellow('⏸')}  Pause sent.  Type ${c.cyan('/resume')} to continue.`);
      }
      ln('');
      break;
    }

    case 'resume': {
      const { writeHitlCommand } = await import('./hitl.js');
      writeHitlCommand(ctx.stateDir, { cmd: 'resume' });
      ln(`  ${c.green('▶')}  Resume sent.`);
      ln('');
      break;
    }

    case 'abort': {
      const { writeHitlCommand } = await import('./hitl.js');
      writeHitlCommand(ctx.stateDir, { cmd: 'abort' });
      ln(`  ${c.red('■')}  Abort sent — run stops after current wave.`);
      ln('');
      break;
    }

    case 'inject': {
      if (!argStr) {
        ln(`  ${c.dim('Usage:')} /inject "directive text"`);
        ln('');
        break;
      }
      const { writeHitlCommand } = await import('./hitl.js');
      writeHitlCommand(ctx.stateDir, { cmd: 'inject', text: argStr });
      ln(`  ${c.cyan('→')}  Injected to Lead PM: ${c.dim('"' + argStr.slice(0, 80) + '"')}`);
      ln('');
      break;
    }

    case 'replan': {
      const { writeHitlCommand } = await import('./hitl.js');
      writeHitlCommand(ctx.stateDir, { cmd: 'replan' });
      ln(`  ${c.cyan('↺')}  Replan queued — PM re-evaluates on next review.`);
      ln('');
      break;
    }

    case 'unblock': {
      const taskId  = args[0];
      const message = args.slice(1).join(' ') || undefined;
      if (!taskId) {
        ln(`  ${c.dim('Usage:')} /unblock <task-id> [guidance]`);
        ln('');
        break;
      }
      const { writeHitlCommand } = await import('./hitl.js');
      writeHitlCommand(ctx.stateDir, { cmd: 'unblock', taskId, message });
      ln(`  ${c.cyan('↑')}  Unblocked ${c.bold(taskId)}${message ? `: ${c.dim('"' + message + '"')}` : ''}`);
      ln('');
      break;
    }

    // ── Background supervisor ─────────────────────────────────────────────────
    case 'bg-status': case 'bg_status': {
      const { bgStatus } = await import('./supervisor.js');
      bgStatus(ctx.stateDir, false);
      break;
    }

    case 'bg-logs': case 'bg_logs': {
      const { bgLogs } = await import('./supervisor.js');
      bgLogs(ctx.stateDir, 50);
      break;
    }

    case 'bg-stop': case 'bg_stop': {
      const { bgStop } = await import('./supervisor.js');
      bgStop(ctx.stateDir);
      break;
    }

    // ── Settings toggles ──────────────────────────────────────────────────────
    case 'stream': {
      const v = args[0]?.toLowerCase();
      if (v === 'on' || v === '1') ctx.stream = true;
      else if (v === 'off' || v === '0') ctx.stream = false;
      else ctx.stream = !ctx.stream;
      ln(`  ${ctx.stream ? c.green('●') : c.dim('○')}  Stream ${ctx.stream ? c.green('on') : c.dim('off')}`);
      ln('');
      break;
    }

    case 'notify': {
      const v = args[0]?.toLowerCase();
      if (v === 'on' || v === '1') ctx.notify = true;
      else if (v === 'off' || v === '0') ctx.notify = false;
      else ctx.notify = !ctx.notify;
      ln(`  ${ctx.notify ? c.green('●') : c.dim('○')}  Desktop notifications ${ctx.notify ? c.green('on') : c.dim('off')}`);
      ln('');
      break;
    }

    case 'improve': {
      const v = args[0]?.toLowerCase();
      if (v === 'on' || v === '1') ctx.noImprove = false;
      else if (v === 'off' || v === '0') ctx.noImprove = true;
      else ctx.noImprove = !ctx.noImprove;
      ln(`  ${!ctx.noImprove ? c.green('●') : c.dim('○')}  Self-improvement ${!ctx.noImprove ? c.green('on') : c.dim('off')}`);
      ln('');
      break;
    }

    case 'state-dir': case 'statedir': {
      if (!args[0]) {
        ln(`  ${c.dim('Current:')} ${ctx.stateDir}`);
        ln(`  ${c.dim('Usage:')} /state-dir <directory>`);
      } else {
        ctx.stateDir = args[0];
        ln(`  ${c.green('●')}  State dir → ${ctx.stateDir}`);
      }
      ln('');
      break;
    }

    case 'clean': {
      const targets = ['blackboard.json', 'messages.json'];
      const removed: string[] = [];
      for (const name of targets) {
        const p = path.join(ctx.stateDir, name);
        if (fs.existsSync(p)) { fs.rmSync(p); removed.push(name); }
      }
      ln(
        removed.length > 0
          ? `  ${c.yellow('✓')}  Cleaned: ${removed.join(', ')}  ${c.dim('(memory.md kept)')}`
          : `  ${c.dim('Nothing to clean in')} ${ctx.stateDir}`,
      );
      ln('');
      break;
    }

    // ── /refine "follow-up goal" ──────────────────────────────────────────────
    case 'refine': {
      if (!argStr) {
        ln(ctx.lastGoal
          ? `  ${c.dim('Last goal:')} ${ctx.lastGoal.slice(0, 80)}\n  ${c.dim('Usage:')} /refine "what to change or fix"`
          : `  ${c.dim('Usage:')} /refine "follow-up goal"`,
        );
        ln('');
        break;
      }
      await runGoalInline(argStr, ctx);
      break;
    }

    default:
      ln(`  ${c.yellow('?')}  Unknown command: /${cmd}  ${c.dim('(try /help)')}`);
      ln('');
      break;
  }
}

// ── REPL loop ─────────────────────────────────────────────────────────────────

/** Prompt string — bold cyan chevron, matches Claude Code style. */
const PROMPT = `\x1b[1m\x1b[36m  ❯\x1b[0m `;

async function replLoop(rl: readline.Interface, ctx: ChatContext): Promise<void> {
  return new Promise((resolve) => {
    const nextPrompt = (): void => {
      rl.setPrompt(PROMPT);
      rl.prompt();
    };

    // One line at a time via recursive once() so goals can't interleave.
    const handleLine = async (rawLine: string): Promise<void> => {
      const line = rawLine.trim();

      if (line) {
        if (line.startsWith('/')) {
          await handleCommand(line, ctx);
        } else {
          await runGoalInline(line, ctx);
        }
      }

      nextPrompt();
      rl.once('line', handleLine);
    };

    rl.once('close', resolve);

    nextPrompt();
    rl.once('line', handleLine);
  });
}

// ── Public entry point ────────────────────────────────────────────────────────

export interface ChatOptions {
  stateDir?:   string;
  notify?:     boolean;
  stream?:     boolean;
  noImprove?:  boolean;
  webhookUrl?: string;
  agentsDir?:  string;
}

export async function startChat(options: ChatOptions = {}): Promise<void> {
  const ctx: ChatContext = {
    stateDir:   options.stateDir  ?? process.env.ROLAND_STATE_DIR ?? '.roland',
    notify:     options.notify    ?? (process.env.ROLAND_NOTIFY === '1'),
    stream:     options.stream    ?? false,
    noImprove:  options.noImprove ?? false,
    webhookUrl: options.webhookUrl,
    agentsDir:  options.agentsDir,
    simple:     isSimpleTui(),
    runCount:   0,
  };

  printWelcome(ctx);

  const rl = readline.createInterface({
    input:       process.stdin,
    output:      process.stderr,
    terminal:    true,
    historySize: 200,
    completer:   (line: string): [string[], string] => {
      if (line.startsWith('/')) {
        const cmds = [
          '/help', '/status', '/pause', '/resume', '/abort',
          '/inject ', '/replan', '/unblock ', '/refine ',
          '/bg-status', '/bg-logs', '/bg-stop',
          '/stream', '/notify', '/improve', '/state-dir ', '/clean',
          '/clear', '/exit', '/quit',
        ];
        const hits = cmds.filter((x) => x.startsWith(line));
        return [hits.length > 0 ? hits : cmds, line];
      }
      return [[], line];
    },
  });

  // Ctrl+C on empty line gives a hint rather than exiting immediately —
  // same behaviour as Claude Code.
  rl.on('SIGINT', () => {
    ln('');
    ln(`  ${c.dim('(Ctrl+D or')} ${c.cyan('/exit')} ${c.dim('to quit)')}`);
    ln('');
    rl.setPrompt(PROMPT);
    rl.prompt();
  });

  await replLoop(rl, ctx);

  ln('');
  ln(`  ${c.dim('Session ended.')}`);
  ln('');
}
