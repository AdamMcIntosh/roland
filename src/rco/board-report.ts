/**
 * UNSC board status — human-readable summary of blackboard + command blackboard.
 */

import fs from 'fs';
import path from 'path';
import { Blackboard, type BlackboardEntry, type EntryStatus, type EntryType } from './blackboard.js';
import {
  CommandBlackboard,
  UNSC_CALLSIGNS,
  type AgentState,
  type Callsign,
} from './command-blackboard.js';
import { readRunGoal, isRunActive } from './hitl.js';

export interface BoardStatusCounts {
  total: number;
  blockers: number;
  tasks: number;
  inProgress: number;
  done: number;
  byType: Partial<Record<EntryType, number>>;
  byStatus: Partial<Record<EntryStatus, number>>;
}

export interface CallsignRosterEntry {
  callsign: Callsign;
  state: AgentState;
  currentTaskId?: string;
  note?: string;
}

export interface BoardStatusReport {
  stateDir: string;
  runActive: boolean;
  goal?: string;
  counts: BoardStatusCounts;
  blockers: BlackboardEntry[];
  activeTasks: BlackboardEntry[];
  roster: CallsignRosterEntry[];
  missionObjective?: string;
  openIntel: string[];
  blackboardSnapshot: string;
  commandBlackboardSnapshot: string;
}

const STATE_ICONS: Record<AgentState, string> = {
  idle: '○',
  active: '●',
  blocked: '⚠',
  complete: '✓',
};

function countEntries(entries: BlackboardEntry[]): BoardStatusCounts {
  const active = entries.filter((e) => e.status !== 'archived');
  const byType: Partial<Record<EntryType, number>> = {};
  const byStatus: Partial<Record<EntryStatus, number>> = {};

  for (const entry of active) {
    byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  }

  return {
    total: active.length,
    blockers: active.filter((e) => e.type === 'blocker' || e.status === 'blocked').length,
    tasks: active.filter((e) => e.type === 'task').length,
    inProgress: active.filter((e) => e.status === 'in_progress').length,
    done: active.filter((e) => e.status === 'done').length,
    byType,
    byStatus,
  };
}

/** Parse Agent Status bullets from command-blackboard.md content. */
export function parseCallsignRoster(content: string): CallsignRosterEntry[] {
  const roster: CallsignRosterEntry[] = [];
  const statusSection = content.match(/## Agent Status\n([\s\S]*?)(?:\n## |$)/);
  if (!statusSection) {
    return UNSC_CALLSIGNS.map((callsign) => ({ callsign, state: 'idle' as AgentState }));
  }

  for (const callsign of UNSC_CALLSIGNS) {
    const lineRe = new RegExp(
      `\\*\\*${callsign}\\*\\*:\\s*(\\w+)` +
        `(?:\\s+task:([\\w-]+))?` +
        `(?:\\s*\\(updated[^)]+\\))?` +
        `(?:\\s*—\\s*(.+))?`,
      'i',
    );
    const match = statusSection[1].match(lineRe);
    if (!match) {
      roster.push({ callsign, state: 'idle' });
      continue;
    }
    const state = (match[1] as AgentState) ?? 'idle';
    roster.push({
      callsign,
      state: ['idle', 'active', 'blocked', 'complete'].includes(state) ? state : 'idle',
      currentTaskId: match[2],
      note: match[3]?.trim(),
    });
  }
  return roster;
}

function parseMissionObjective(content: string): string | undefined {
  const section = content.match(/## Mission Objectives\n([\s\S]*?)(?:\n## |$)/);
  if (!section) return undefined;
  const bullet = section[1]
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .find((l) => l.length > 0 && !l.startsWith('_('));
  return bullet;
}

function parseOpenIntel(content: string, limit = 3): string[] {
  const section = content.match(/## Open Intel\n([\s\S]*?)(?:\n## |$)/);
  if (!section) return [];
  return section[1]
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('_('))
    .slice(0, limit);
}

function readCommandBoardContent(stateDir: string): string {
  const filePath = path.join(stateDir, 'command-blackboard.md');
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export function buildBoardStatusReport(stateDir = '.roland', goalHint?: string): BoardStatusReport {
  const blackboard = new Blackboard(stateDir);
  const commandBoard = new CommandBlackboard(stateDir);
  const entries = blackboard.read().filter((e) => e.status !== 'archived');
  const goal = goalHint ?? readRunGoal(stateDir) ?? undefined;
  const commandContent = readCommandBoardContent(stateDir);

  return {
    stateDir,
    runActive: isRunActive(stateDir),
    goal,
    counts: countEntries(entries),
    blockers: entries.filter((e) => e.type === 'blocker' || e.status === 'blocked'),
    activeTasks: entries.filter((e) => e.type === 'task' && e.status !== 'done'),
    roster: parseCallsignRoster(commandContent),
    missionObjective: parseMissionObjective(commandContent),
    openIntel: parseOpenIntel(commandContent),
    blackboardSnapshot: blackboard.snapshot(),
    commandBlackboardSnapshot: goal ? commandBoard.smartSnapshot(goal) : readCommandBoardExcerpt(stateDir),
  };
}

function readCommandBoardExcerpt(stateDir: string, maxLines = 24): string {
  const content = readCommandBoardContent(stateDir);
  if (!content) return '(Command blackboard not initialized)';
  const excerpt = content.split('\n').slice(0, maxLines).join('\n').trim();
  return excerpt || '(Command blackboard is empty)';
}

function formatRosterLine(roster: CallsignRosterEntry[]): string {
  return roster
    .map((r) => {
      const icon = STATE_ICONS[r.state] ?? '○';
      const task = r.currentTaskId ? ` (${r.currentTaskId})` : '';
      return `${r.callsign} ${icon}${task}`;
    })
    .join(' · ');
}

/**
 * Compact UNSC-style summary for chat responses, run endings, and dashboard cards.
 * Target: ~12–18 lines, blockers-first.
 */
export function formatConciseUnscSummary(report: BoardStatusReport): string {
  const lines: string[] = ['### 🎖 UNSC Mission Status', ''];

  const mission = report.goal ?? report.missionObjective;
  if (mission) lines.push(`**Mission:** ${mission.slice(0, 140)}`);

  const runWord = report.runActive ? 'ACTIVE' : 'idle';
  lines.push(
    `**Run:** ${runWord} · ${report.counts.total} entries · ${report.counts.blockers} blocker${report.counts.blockers === 1 ? '' : 's'} · ${report.counts.done} done`,
  );
  lines.push('');

  if (report.blockers.length > 0) {
    lines.push(`**🔴 Blockers (${report.blockers.length}) — resolve first:**`);
    for (const b of report.blockers.slice(0, 4)) {
      lines.push(`- ${b.title}${b.assignee ? ` → ${b.assignee}` : ''}`);
      if (b.content) lines.push(`  _${b.content.slice(0, 100)}_`);
    }
    lines.push('');
  } else {
    lines.push('**Blockers:** _(none)_');
    lines.push('');
  }

  lines.push(`**Roster:** ${formatRosterLine(report.roster)}`);
  lines.push('');

  if (report.activeTasks.length > 0) {
    lines.push(`**Active tasks (${report.activeTasks.length}):**`);
    for (const t of report.activeTasks.slice(0, 5)) {
      lines.push(`- [${t.status}] ${t.title.slice(0, 80)}${t.assignee ? ` → ${t.assignee}` : ''}`);
    }
    lines.push('');
  }

  if (report.openIntel.length > 0) {
    lines.push('**Open intel:**');
    for (const intel of report.openIntel) {
      lines.push(`- ${intel.slice(0, 120)}`);
    }
  }

  return lines.join('\n').trimEnd();
}

export function formatBoardStatusReport(
  report: BoardStatusReport,
  opts: { mode?: 'verbose' | 'concise' } = {},
): string {
  if (opts.mode === 'concise') return formatConciseUnscSummary(report);

  const lines: string[] = [
    'UNSC Board Status',
    '=================',
    `State dir: ${report.stateDir}`,
    `Run active: ${report.runActive ? 'yes' : 'no'}`,
  ];

  if (report.goal) lines.push(`Goal: ${report.goal.slice(0, 120)}`);

  lines.push(
    '',
    'Counts',
    `  entries: ${report.counts.total}`,
    `  blockers: ${report.counts.blockers}`,
    `  tasks: ${report.counts.tasks} (${report.counts.inProgress} in progress, ${report.counts.done} done)`,
    '',
    'Callsign roster',
    `  ${formatRosterLine(report.roster)}`,
    '',
  );

  if (report.blockers.length > 0) {
    lines.push('Blockers (unblock first)');
    for (const blocker of report.blockers.slice(0, 8)) {
      lines.push(`  - [${blocker.status}] ${blocker.title}${blocker.assignee ? ` → ${blocker.assignee}` : ''}`);
      if (blocker.content) lines.push(`    ${blocker.content.slice(0, 160)}`);
    }
    lines.push('');
  }

  if (report.activeTasks.length > 0) {
    lines.push('Active tasks');
    for (const task of report.activeTasks.slice(0, 10)) {
      lines.push(`  - [${task.status}] ${task.title}${task.assignee ? ` → ${task.assignee}` : ''}`);
    }
    lines.push('');
  }

  lines.push('Blackboard snapshot', '-------------------', report.blackboardSnapshot, '');
  lines.push('Command blackboard', '------------------', report.commandBlackboardSnapshot);

  return lines.join('\n');
}

export function printBoardStatus(
  stateDir = '.roland',
  opts: { json?: boolean; goal?: string; concise?: boolean } = {},
): void {
  const report = buildBoardStatusReport(stateDir, opts.goal);
  if (opts.json) {
    console.log(JSON.stringify({ ...report, concise: formatConciseUnscSummary(report) }, null, 2));
    return;
  }
  const mode = opts.concise ? 'concise' : 'verbose';
  console.error(formatBoardStatusReport(report, { mode }));
}
