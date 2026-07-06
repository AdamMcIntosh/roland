/**
 * ## P2 Polish & Reach
 *
 * Unified mission audit — stitch loop history, HITL events, blackboard, state, and bg logs
 * into one chronological timeline for post-run reconstruction.
 *
 * Usage:
 *   roland mission-audit <runId>
 *   roland mission-audit --last
 *   roland mission-audit --last --format markdown --open
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  LOOP_HISTORY_FILE,
  LOOP_METRICS_FILE,
  type LoopExecutionHistory,
  type LoopMetrics,
} from '../loop-engine/loop-observability.js';
import { HERMES_HITL_EVENTS_FILE, HERMES_MISSION_COMPLETION_FILE, type HermesHitlEvent } from './hitl-hermes.js';
import { RUN_STATE_FILE, type RunState } from './run-state.js';
import { MISSION_ARCHIVE_FILE, readMissionMetaFile } from './mission-state.js';
import { Blackboard } from '../coordination/legacy-blackboard.js';

export type AuditFormat = 'markdown' | 'json' | 'html';

export interface AuditTimelineEntry {
  timestamp: number;
  source: 'loop-history' | 'hitl-event' | 'blackboard' | 'run-state' | 'bg-log' | 'mission-archive';
  kind: string;
  summary: string;
  runId?: string;
  detail?: Record<string, unknown>;
}

export interface MissionAuditReport {
  runId: string;
  goal: string;
  stateDir: string;
  generatedAt: number;
  entries: AuditTimelineEntry[];
  metrics: LoopMetrics | null;
  runState: RunState | null;
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function readJsonl<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}

function resolveRunId(stateDir: string, requested?: string): string | null {
  if (requested?.trim()) return requested.trim();

  const runState = safeReadJson<RunState | null>(path.join(stateDir, RUN_STATE_FILE), null);
  if (runState?.runId) return runState.runId;

  const meta = readMissionMetaFile(stateDir);
  if (meta?.id) return String(meta.id);

  const archive = readJsonl<{ runId?: string; id?: string; archivedAt?: number }>(
    path.join(stateDir, MISSION_ARCHIVE_FILE),
  );
  if (archive.length > 0) {
    const last = archive[archive.length - 1]!;
    return last.runId ?? last.id ?? null;
  }

  return null;
}

function findBgLogForRun(stateDir: string, runId: string): string | null {
  const logsDir = path.join(stateDir, 'logs');
  if (!fs.existsSync(logsDir)) return null;
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith('bg-') && f.endsWith('.log'))
    .map((f) => path.join(logsDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const file of files) {
    try {
      const head = fs.readFileSync(file, 'utf-8').slice(0, 8000);
      if (head.includes(runId)) return file;
    } catch {
      /* skip */
    }
  }
  return files[0] ?? null;
}

function parseBgLogLines(logPath: string, runId: string): AuditTimelineEntry[] {
  const entries: AuditTimelineEntry[] = [];
  try {
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
    for (const line of lines) {
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+/);
      const iso = tsMatch?.[1];
      const timestamp = iso ? Date.parse(iso) : Date.now();
      if (/error|failed|blocker|escalat/i.test(line)) {
        entries.push({
          timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
          source: 'bg-log',
          kind: 'log-line',
          summary: line.slice(0, 200),
          runId,
        });
      }
    }
  } catch {
    /* non-fatal */
  }
  return entries.slice(-100);
}

/** Build unified mission audit report. */
export function buildMissionAudit(
  stateDir: string,
  opts: { runId?: string; last?: boolean } = {},
): MissionAuditReport | null {
  const runId = opts.last ? resolveRunId(stateDir) : resolveRunId(stateDir, opts.runId);
  if (!runId) return null;

  const entries: AuditTimelineEntry[] = [];
  const runState = safeReadJson<RunState | null>(path.join(stateDir, RUN_STATE_FILE), null);
  const metrics = safeReadJson<LoopMetrics | null>(path.join(stateDir, LOOP_METRICS_FILE), null);
  const history = safeReadJson<LoopExecutionHistory>(path.join(stateDir, LOOP_HISTORY_FILE), { entries: [] });

  const goal =
    runState?.goal ??
    readMissionMetaFile(stateDir)?.goal ??
    metrics?.goal ??
    '(unknown goal)';

  for (const e of history.entries) {
    entries.push({
      timestamp: e.at,
      source: 'loop-history',
      kind: `phase-${e.event}`,
      summary: `${e.phase} ${e.event}${e.summary ? `: ${e.summary}` : ''}`,
      runId,
      detail: {
        iteration: e.iteration,
        templateId: e.templateId,
        success: e.success,
        durationMs: e.durationMs,
      },
    });
  }

  const hitlEvents = readJsonl<HermesHitlEvent>(path.join(stateDir, HERMES_HITL_EVENTS_FILE));
  for (const ev of hitlEvents) {
    entries.push({
      timestamp: ev.timestamp,
      source: 'hitl-event',
      kind: ev.kind,
      summary: ev.blockerDescription,
      runId: ev.missionId ?? runId,
      detail: {
        currentGate: ev.currentGate,
        suggestedActions: ev.suggestedActions,
        goal: ev.goal,
      },
    });
  }

  try {
    const bb = new Blackboard(stateDir);
    for (const post of bb.read()) {
      entries.push({
        timestamp: post.createdAt ?? post.updatedAt ?? Date.now(),
        source: 'blackboard',
        kind: post.type,
        summary: `${post.title}: ${(post.content ?? '').slice(0, 120)}`,
        runId,
        detail: { status: post.status, author: post.author, priority: post.priority },
      });
    }
  } catch {
    /* blackboard optional */
  }

  if (runState) {
    entries.push({
      timestamp: runState.updatedAt ?? runState.startedAt,
      source: 'run-state',
      kind: `run-${runState.status}`,
      summary: `Run ${runState.status} — wave ${runState.currentWave}, ${runState.completedTasks}/${runState.totalTasks} tasks`,
      runId: runState.runId,
      detail: {
        loopPhase: runState.loopPhase,
        loopIteration: runState.loopIteration,
        loopTemplateId: runState.loopTemplateId,
      },
    });
  }

  const archive = readJsonl<{ runId?: string; goal?: string; archivedAt?: number; archiveReason?: string }>(
    path.join(stateDir, MISSION_ARCHIVE_FILE),
  );
  for (const rec of archive) {
    if (rec.runId && rec.runId !== runId) continue;
    entries.push({
      timestamp: rec.archivedAt ?? Date.now(),
      source: 'mission-archive',
      kind: 'archived',
      summary: rec.archiveReason ?? 'Mission archived',
      runId: rec.runId ?? runId,
      detail: { goal: rec.goal },
    });
  }

  const completionPath = path.join(stateDir, HERMES_MISSION_COMPLETION_FILE);
  if (fs.existsSync(completionPath)) {
    const completion = safeReadJson<{ timestamp?: number; summary?: string; finalStatus?: string } | null>(
      completionPath,
      null,
    );
    if (completion) {
      entries.push({
        timestamp: completion.timestamp ?? Date.now(),
        source: 'hitl-event',
        kind: 'mission-complete',
        summary: completion.summary ?? `Mission ${completion.finalStatus ?? 'complete'}`,
        runId,
        detail: completion as Record<string, unknown>,
      });
    }
  }

  const bgLog = findBgLogForRun(stateDir, runId);
  if (bgLog) entries.push(...parseBgLogLines(bgLog, runId));

  entries.sort((a, b) => a.timestamp - b.timestamp);

  return {
    runId,
    goal,
    stateDir,
    generatedAt: Date.now(),
    entries,
    metrics,
    runState,
  };
}

function formatTimestamp(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

export function formatAuditMarkdown(report: MissionAuditReport): string {
  const lines: string[] = [
    `# Mission Audit — ${report.runId}`,
    '',
    `- **Goal:** ${report.goal}`,
    `- **State dir:** ${report.stateDir}`,
    `- **Generated:** ${formatTimestamp(report.generatedAt)}`,
    `- **Events:** ${report.entries.length}`,
    '',
  ];

  if (report.metrics) {
    lines.push(
      '## Loop Metrics',
      '',
      `- Template: \`${report.metrics.templateId}\``,
      `- Status: ${report.metrics.status}`,
      `- Success rate: ${report.metrics.successRate}%`,
      `- Iteration: ${report.metrics.iteration}`,
      '',
    );
  }

  lines.push('## Timeline', '');
  for (const e of report.entries) {
    lines.push(
      `### ${formatTimestamp(e.timestamp)} · \`${e.source}\` · ${e.kind}`,
      '',
      e.summary,
      '',
    );
  }

  return lines.join('\n');
}

export function formatAuditHtml(report: MissionAuditReport): string {
  const rows = report.entries
    .map(
      (e) =>
        `<tr><td>${formatTimestamp(e.timestamp)}</td><td>${e.source}</td><td>${e.kind}</td><td>${escapeHtml(e.summary)}</td></tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mission Audit ${report.runId}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:.4rem .6rem;text-align:left}
th{background:#f4f4f4}
</style></head>
<body>
<h1>Mission Audit — ${escapeHtml(report.runId)}</h1>
<p><strong>Goal:</strong> ${escapeHtml(report.goal)}</p>
<p><strong>Events:</strong> ${report.entries.length}</p>
<table><thead><tr><th>Time</th><th>Source</th><th>Kind</th><th>Summary</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openInBrowser(filePath: string): void {
  const abs = path.resolve(filePath);
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      execSync(`start "" "${abs}"`, { stdio: 'ignore', shell: 'cmd.exe' });
    } else if (platform === 'darwin') {
      execSync(`open "${abs}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${abs}"`, { stdio: 'ignore' });
    }
  } catch {
    console.error(`Open manually: ${abs}`);
  }
}

export interface MissionAuditCliOptions {
  stateDir?: string;
  last?: boolean;
  runId?: string;
  format?: AuditFormat;
  open?: boolean;
}

export function runMissionAuditCli(opts: MissionAuditCliOptions): number {
  const stateDir = opts.stateDir ?? '.roland';
  const report = buildMissionAudit(stateDir, { runId: opts.runId, last: opts.last ?? !opts.runId });

  if (!report) {
    console.error('No mission run found. Try `roland mission-audit --last` after a team run.');
    return 1;
  }

  const format = opts.format ?? 'markdown';

  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  const content = format === 'html' ? formatAuditHtml(report) : formatAuditMarkdown(report);
  const ext = format === 'html' ? 'html' : 'md';
  const outDir = path.join(stateDir, 'audits');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `audit-${report.runId}.${ext}`);
  fs.writeFileSync(outFile, content, 'utf-8');

  if (format === 'html') {
    console.log(content);
  } else {
    console.log(content);
  }

  console.error(`\nAudit written: ${outFile}`);

  if (opts.open) openInBrowser(outFile);
  return 0;
}

/** Parse argv forwarded from Commander or legacy router. */
export function parseMissionAuditArgs(argv: string[]): MissionAuditCliOptions {
  let stateDir = '.roland';
  let last = false;
  let runId: string | undefined;
  let format: AuditFormat = 'markdown';
  let open = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state-dir' && argv[i + 1]) { stateDir = argv[++i]!; continue; }
    if (a === '--last') { last = true; continue; }
    if (a === '--format' && argv[i + 1]) {
      const f = argv[++i] as AuditFormat;
      if (f === 'json' || f === 'html' || f === 'markdown') format = f;
      continue;
    }
    if (a === '--open') { open = true; continue; }
    if (!a.startsWith('-') && !runId) { runId = a; continue; }
  }

  return { stateDir, last, runId, format, open };
}
