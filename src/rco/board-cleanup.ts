/**
 * Board cleanup — archive stale mission state before a new run.
 *
 * Cleans both machine-readable `.roland/blackboard.json` and human-readable
 * `.roland/command-blackboard.md` so prior [pending]/[done] tasks do not pollute
 * planning prompts or worker context.
 */

import { Blackboard, type BlackboardEntry } from './blackboard.js';
import {
  CommandBlackboard,
  UNSC_CALLSIGNS,
  isGoalRelevant,
  tokenize,
} from './command-blackboard.js';

export interface BoardCleanupOptions {
  /** When true, report actions without writing files. */
  dryRun?: boolean;
  /** New mission goal — used to preserve goal-relevant open intel / decisions. */
  goal?: string;
}

export interface BoardCleanupResult {
  dryRun: boolean;
  blackboardArchived: number;
  blackboardArchivedTitles: string[];
  commandBoard: {
    activeTasksRemoved: string[];
    objectivesArchived: string[];
    intelRemoved: string[];
    agentsReset: boolean;
  };
}

const STALE_TASK_STATUS_RE = /\[(done|complete|cancelled|archived)\]/i;
const STALE_PENDING_RE = /\[pending\]/i;
const STALE_INTEL_RE = /\[(blocker\s+)?cleared\]|deferred\s+—|fixed in task-/i;

function shouldArchiveBlackboardEntry(entry: BlackboardEntry, goalTokens: Set<string>): boolean {
  if (entry.tags.includes('goal')) return false;

  if (entry.type === 'task') {
    if (entry.status === 'archived') return false;
    if (entry.status === 'done') return true;
    if (['pending', 'in_progress', 'blocked'].includes(entry.status)) {
      return !isGoalRelevant(`${entry.title} ${entry.content}`, goalTokens);
    }
  }

  if (entry.type === 'blocker' && entry.status === 'done') return true;

  return false;
}

function shouldRemoveActiveTaskBullet(bullet: string, goalTokens: Set<string>): boolean {
  const b = bullet.trim();
  if (!b || b.startsWith('_(')) return true;

  if (STALE_TASK_STATUS_RE.test(b)) return true;

  if (STALE_PENDING_RE.test(b)) {
    return !isGoalRelevant(b, goalTokens);
  }

  if (/\[blocked\]/i.test(b) && /\bcleared\b/i.test(b)) return true;

  return false;
}

function shouldArchiveObjective(bullet: string, goalTokens: Set<string>): boolean {
  const b = bullet.trim();
  if (!b || b.startsWith('_(')) return false;
  if (/\[(complete|cancelled|archived)\]/i.test(b)) return true;
  if (/\[(P[1-4]\s+)?active\]/i.test(b) && !isGoalRelevant(b, goalTokens)) return true;
  return false;
}

function shouldRemoveIntel(bullet: string, goalTokens: Set<string>): boolean {
  const b = bullet.trim();
  if (!b || b.startsWith('_(')) return false;
  if (STALE_INTEL_RE.test(b)) return true;
  if (/\[BLOCKER cleared\]/i.test(b)) return true;
  if (/\[ESCALATION\]/i.test(b) && !isGoalRelevant(b, goalTokens)) return true;
  return false;
}

/** Archive stale blackboard.json entries from prior missions. */
export function cleanupMachineBlackboard(
  blackboard: Blackboard,
  options: BoardCleanupOptions = {},
): { archived: number; titles: string[] } {
  const goalTokens = tokenize(options.goal ?? '');
  const titles: string[] = [];
  let archived = 0;

  for (const entry of blackboard.read()) {
    if (!shouldArchiveBlackboardEntry(entry, goalTokens)) continue;
    titles.push(entry.title);
    if (!options.dryRun) blackboard.archive(entry.id);
    archived++;
  }

  return { archived, titles };
}

/** Clean command-blackboard.md — remove stale tasks, archive old objectives, reset agents. */
export function cleanupCommandBlackboard(
  board: CommandBlackboard,
  options: BoardCleanupOptions = {},
): BoardCleanupResult['commandBoard'] {
  const goalTokens = tokenize(options.goal ?? '');
  const sections = board.readSections();

  const activeTasksRemoved: string[] = [];
  const objectivesArchived: string[] = [];
  const intelRemoved: string[] = [];

  const keptTasks: string[] = [];
  for (const bullet of sections['Active Tasks'] ?? []) {
    if (shouldRemoveActiveTaskBullet(bullet, goalTokens)) {
      activeTasksRemoved.push(bullet);
    } else {
      keptTasks.push(bullet);
    }
  }

  const keptObjectives: string[] = [];
  for (const bullet of sections['Mission Objectives'] ?? []) {
    if (shouldArchiveObjective(bullet, goalTokens)) {
      objectivesArchived.push(bullet.replace(/\[(P[1-4]\s+)?active\]/i, '[archived]'));
    } else {
      keptObjectives.push(bullet);
    }
  }

  const keptIntel: string[] = [];
  for (const bullet of sections['Open Intel'] ?? []) {
    if (shouldRemoveIntel(bullet, goalTokens)) {
      intelRemoved.push(bullet);
    } else {
      keptIntel.push(bullet);
    }
  }

  if (!options.dryRun) {
    board.replaceSections({
      'Active Tasks': keptTasks,
      'Mission Graph': ['_(no active graph)_'],
      'Mission Objectives': keptObjectives,
      'Open Intel': keptIntel,
      'Agent Status': UNSC_CALLSIGNS.map((c) => `**${c}**: idle`),
    });
  }

  return {
    activeTasksRemoved,
    objectivesArchived,
    intelRemoved,
    agentsReset: true,
  };
}

/** Full cleanup for mission start or `roland board-cleanup`. */
export function cleanupBoardsForNewMission(
  stateDir: string,
  goal: string,
  options: BoardCleanupOptions = {},
): BoardCleanupResult {
  const blackboard = new Blackboard(stateDir);
  const commandBoard = new CommandBlackboard(stateDir);

  const bb = cleanupMachineBlackboard(blackboard, { ...options, goal });
  const cb = cleanupCommandBlackboard(commandBoard, { ...options, goal });

  return {
    dryRun: options.dryRun ?? false,
    blackboardArchived: bb.archived,
    blackboardArchivedTitles: bb.titles,
    commandBoard: cb,
  };
}

/** Human-readable cleanup report for CLI. */
export function formatCleanupReport(result: BoardCleanupResult): string {
  const lines: string[] = [];
  lines.push(result.dryRun ? 'Board cleanup (dry run)' : 'Board cleanup complete');
  lines.push('');

  if (result.blackboardArchived > 0) {
    lines.push(`blackboard.json: archived ${result.blackboardArchived} entr${result.blackboardArchived === 1 ? 'y' : 'ies'}`);
    for (const t of result.blackboardArchivedTitles.slice(0, 8)) {
      lines.push(`  · ${t}`);
    }
    if (result.blackboardArchivedTitles.length > 8) {
      lines.push(`  · …and ${result.blackboardArchivedTitles.length - 8} more`);
    }
  } else {
    lines.push('blackboard.json: no stale entries');
  }

  const cb = result.commandBoard;
  if (cb.activeTasksRemoved.length) {
    lines.push(`Active Tasks removed: ${cb.activeTasksRemoved.length}`);
    for (const t of cb.activeTasksRemoved.slice(0, 5)) lines.push(`  · ${t.slice(0, 80)}`);
  }
  if (cb.objectivesArchived.length) {
    lines.push(`Mission Objectives archived: ${cb.objectivesArchived.length}`);
    for (const t of cb.objectivesArchived.slice(0, 3)) lines.push(`  · ${t.slice(0, 80)}`);
  }
  if (cb.intelRemoved.length) {
    lines.push(`Open Intel cleared: ${cb.intelRemoved.length}`);
  }
  if (cb.agentsReset) lines.push('Agent Status: reset to idle');

  if (
    result.blackboardArchived === 0 &&
    cb.activeTasksRemoved.length === 0 &&
    cb.objectivesArchived.length === 0 &&
    cb.intelRemoved.length === 0
  ) {
    lines.push('');
    lines.push('Boards are clean — nothing to archive.');
  }

  return lines.join('\n');
}
