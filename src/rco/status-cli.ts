/**
 * ## CLI-First + Hermes Monitoring Shift
 *
 * Shared CLI printers for mission monitoring — single source of truth used by
 * `roland hitl-status`, `roland mission-summary`, `roland hitl-events`, and
 * optionally MCP/dashboard fallbacks. Hermes polls via MCP; operators use CLI.
 */

import {
  buildHitlStatusReport,
  formatHermesHitlSummary,
  formatHitlStatusMarkdown,
  formatMissionCompleteMarkdown,
  formatHermesMissionCompleteSummary,
  pollHermesHitlEvents,
  readMissionCompletionReport,
  buildMissionCompletionReport,
} from './hitl-hermes.js';
import { printGitCommitApprovalStatus } from './git-commit-approval-cli.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cy = (s: string) => `\x1b[36m${s}\x1b[0m`;
const y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;

export interface StatusCliOpts {
  json?: boolean;
  goal?: string;
}

/** Print HITL status — delegates to buildHitlStatusReport (MCP parity). */
export function printHitlStatus(stateDir = '.roland', opts: StatusCliOpts = {}): void {
  const report = buildHitlStatusReport(stateDir);
  const summary = formatHermesHitlSummary(report);

  if (opts.json) {
    console.log(JSON.stringify({ ...report, summary }, null, 2));
    return;
  }

  console.error('');
  console.error(`  ${bold('HITL Status')}  ${dim('(CLI · Hermes monitoring)')}`);
  console.error('');
  console.error(`  ${report.waitingOnHitl ? r('⚠') : g('●')} ${summary}`);
  console.error('');

  if (report.currentGate) {
    console.error(`  Gate:          ${y(report.currentGate)}`);
  }
  if (report.blockerDescription) {
    console.error(`  Blocker:       ${report.blockerDescription.slice(0, 120)}`);
  }
  console.error(`  Run active:    ${report.runActive ? g('yes') : dim('no')}${report.goal ? dim(` — "${report.goal.slice(0, 60)}"`) : ''}`);
  console.error(`  Paused:        ${report.hitl.paused ? y('yes ⏸') : dim('no')}`);
  console.error(`  Abort pending: ${report.hitl.abortPending ? y('yes ⚠️') : dim('no')}`);
  console.error(`  Queue length:  ${report.hitl.queueLength > 0 ? y(String(report.hitl.queueLength)) : dim('0')}`);

  if (report.loop) {
    const lp = report.loop;
    console.error(
      `  Loop:          ${dim(`${lp.status} · phase=${lp.phase ?? '—'} · iter=${lp.iteration} · retries=${lp.retryCount}`)}`,
    );
    if (lp.confidence !== null && lp.confidence !== undefined) {
      console.error(`  Confidence:    ${lp.confidence === 0 ? y('0 (gate failed)') : String(lp.confidence)}`);
    }
  }

  if (report.missionCompletion && !report.runActive) {
    console.error('');
    console.error(`  ${bold('Last mission')}  ${report.missionCompletion.summary}`);
    console.error(
      `  Status:        ${report.missionCompletion.finalStatus} · ${report.missionCompletion.successRate}% success`,
    );
  }

  console.error('');
  if (report.suggestedActions.length > 0) {
    console.error(`  ${bold('Suggested actions')}`);
    for (const cmd of report.suggestedActions.slice(0, 4)) {
      console.error(`    ${cy(cmd)}`);
    }
    console.error('');
  }

  if (report.runActive && !report.hitl.paused) {
    console.error(`  ${dim('Controls:')} ${cy('roland pause')} · ${cy('roland abort')} · ${cy('roland inject "..."')}`);
  } else if (report.hitl.paused) {
    console.error(`  ${dim('Controls:')} ${cy('roland resume')}`);
  }

  printGitCommitApprovalStatus(stateDir);
  console.error('');

  // Full markdown to stdout for piping / Hermes scripts
  console.log(formatHitlStatusMarkdown(report));
}

/** Print latest mission completion snapshot. */
export function printMissionSummary(stateDir = '.roland', opts: StatusCliOpts = {}): void {
  let report = readMissionCompletionReport(stateDir);
  if (!report && opts.goal) {
    report = buildMissionCompletionReport(stateDir, { goal: opts.goal });
  }

  if (!report) {
    if (opts.json) {
      console.log(JSON.stringify({ found: false, summary: 'No mission completion recorded yet.' }, null, 2));
      return;
    }
    console.error(dim('No mission completion recorded yet.'));
    console.error(dim('Run `roland team "…"` or poll with `roland hitl-events --since 0`.'));
    return;
  }

  const summary = formatHermesMissionCompleteSummary(report);

  if (opts.json) {
    console.log(JSON.stringify({ found: true, ...report, summary }, null, 2));
    return;
  }

  console.error('');
  console.error(`  ${bold('Mission Summary')}  ${dim('(terminal outcome · Hermes)')}`);
  console.error('');
  console.error(`  ${report.finalStatus === 'completed' ? g('✓') : y('⚠')} ${summary}`);
  console.error('');
  console.log(formatMissionCompleteMarkdown(report));
}

/** Poll HITL events since timestamp (epoch ms). */
export function printHitlEvents(
  stateDir = '.roland',
  opts: { since?: number; limit?: number; json?: boolean } = {},
): void {
  const since = opts.since ?? 0;
  const limit = opts.limit ?? 50;
  const events = pollHermesHitlEvents(stateDir, since, limit);
  const report = buildHitlStatusReport(stateDir);
  const summary = formatHermesHitlSummary(report);

  const payload = {
    events,
    count: events.length,
    latestTimestamp: events.length > 0 ? events[events.length - 1]!.timestamp : since,
    waitingOnHitl: report.waitingOnHitl,
    summary,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.error('');
  console.error(`  ${bold('HITL Events')}  ${dim(`since ${since} · ${events.length} new`)}`);
  console.error(`  ${summary}`);
  console.error('');

  if (events.length === 0) {
    console.error(dim('  (no new events)'));
    console.error('');
    return;
  }

  for (const ev of events) {
    const ts = new Date(ev.timestamp).toISOString();
    const gate = ev.currentGate ? ` [${ev.currentGate}]` : '';
    console.error(`  ${dim(ts)} ${y(ev.kind)}${gate}`);
    if (ev.blockerDescription) {
      console.error(`    ${ev.blockerDescription.slice(0, 120)}`);
    }
    if (ev.kind === 'mission-complete') {
      console.error(`    ${g('→ run: roland mission-summary')}`);
    }
  }
  console.error('');
}
