/**
 * ## Mission Completion Notification to Hermes
 *
 * ## HITL → Hermes Propagation
 *
 * Surfaces Human-in-the-Loop escalations, blockers, verification failures, and
 * terminal mission outcomes to Hermes (Master Chief) via structured events and
 * queryable status reports.
 *
 * Events append to `.roland/hermes-hitl-events.jsonl` for push/poll by MCP clients.
 * Latest completion snapshot: `.roland/hermes-mission-completion.json`.
 * Dashboard and MCP HTTP subscribe via `onHitlHermesEvent` for live updates.
 */

import fs from 'fs';
import path from 'path';
import { Blackboard } from './blackboard.js';
import { readMissionMetaFile } from './mission-state.js';
import { HitlQueue, isRunActive, readRunGoal } from './hitl.js';
import { readRunState } from './run-state.js';
import { readLoopState } from '../loop-engine/loop-state.js';
import {
  GitCommitApprovalQueue,
  type GitCommitApprovalRequest,
} from '../loop-engine/git-commit-approval.js';
import { computeLoopMetrics, LOOP_METRICS_FILE, type LoopMetrics } from '../loop-engine/loop-observability.js';
import type { LoopRunStatus } from '../loop-engine/loop-state.js';
import { CLOSED_LOOP_PR_FILE } from '../loop-engine/closed-loop.js';

export const HERMES_HITL_EVENTS_FILE = 'hermes-hitl-events.jsonl';
export const HERMES_MISSION_COMPLETION_FILE = 'hermes-mission-completion.json';

export type HermesHitlEventKind =
  | 'hitl-pause'
  | 'hitl-abort-pending'
  | 'git-commit-approval'
  | 'verification-failure'
  | 'loop-escalation'
  | 'blocker'
  | 'verification-gate'
  | 'mission-complete';

export type MissionFinalStatus = 'completed' | 'failed' | 'escalated' | 'blocked' | 'aborted';

export interface MissionCompletionReport {
  id: string;
  timestamp: number;
  runId?: string;
  missionId?: string;
  goal: string;
  finalStatus: MissionFinalStatus;
  /** Phase success rate 0–100 from loop metrics when available. */
  successRate: number;
  deliverables: string[];
  blockers: string[];
  nextRecommendedAction: string;
  suggestedActions: string[];
  /** Master Chief one-liner for operator reporting. */
  summary: string;
  wavesRun: number;
  blockersEncountered: number;
  loop?: {
    status: string;
    iteration: number;
    retryCount: number;
    templateId?: string;
    verificationPass?: boolean | null;
    confidence?: number | null;
  };
  durationMs?: number;
}

/** Minimal team result shape — avoids circular import from team-orchestrator. */
export interface HermesTeamCompletionInput {
  goal: string;
  synthesis: string;
  wavesRun: number;
  blockersEncountered: number;
}

export interface HermesHitlEvent {
  id: string;
  timestamp: number;
  kind: HermesHitlEventKind;
  missionId?: string;
  goal?: string;
  /** Human-readable blocker / escalation description. */
  blockerDescription: string;
  /** Current gate or phase where the mission is stuck. */
  currentGate: string;
  /** Copy-paste operator commands. */
  suggestedActions: string[];
  /** Optional structured detail for Hermes tooling. */
  detail?: Record<string, unknown>;
}

export interface HitlStatusReport {
  stateDir: string;
  missionId?: string;
  goal?: string;
  runActive: boolean;
  /** True when operator action is required before the mission can proceed. */
  waitingOnHitl: boolean;
  hitlReason?: string;
  currentGate?: string;
  blockerDescription?: string;
  suggestedActions: string[];
  hitl: {
    paused: boolean;
    abortPending: boolean;
    queueLength: number;
  };
  loop?: {
    status: string;
    phase: string | null;
    iteration: number;
    retryCount: number;
    lastVerificationPass: boolean | null;
    confidence: number | null;
    lastCritiqueDecision: string | null;
  };
  gitCommitApproval?: {
    id: string;
    message: string;
    status: string;
    expiresAt: number;
  } | null;
  blockers: Array<{ id: string; title: string; content: string }>;
  /** Latest terminal mission outcome — same snapshot as mission_summary MCP tool. */
  missionCompletion?: MissionCompletionReport | null;
  updatedAt: number;
}

export type HitlHermesEventListener = (stateDir: string, event: HermesHitlEvent) => void;

const hitlHermesListeners = new Set<HitlHermesEventListener>();

/** Subscribe to HITL events for dashboard WebSocket push / MCP live sync. */
export function onHitlHermesEvent(listener: HitlHermesEventListener): () => void {
  hitlHermesListeners.add(listener);
  return () => hitlHermesListeners.delete(listener);
}

function emitHitlHermesListeners(stateDir: string, event: HermesHitlEvent): void {
  for (const listener of hitlHermesListeners) {
    try {
      listener(stateDir, event);
    } catch {
      /* listener must not break writers */
    }
  }
}

function eventsFilePath(stateDir: string): string {
  return path.join(stateDir, HERMES_HITL_EVENTS_FILE);
}

function completionFilePath(stateDir: string): string {
  return path.join(stateDir, HERMES_MISSION_COMPLETION_FILE);
}

function safeReadJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function nextEventId(): string {
  return `hitl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readMissionContext(stateDir: string): { missionId?: string; goal?: string } {
  const meta = readMissionMetaFile(stateDir);
  const goal = meta?.goal ?? meta?.effectiveGoal ?? readRunGoal(stateDir) ?? undefined;
  return {
    missionId: typeof meta?.id === 'string' ? meta.id : meta?.runName ?? undefined,
    goal: goal ?? undefined,
  };
}

function readOpenBlockers(stateDir: string): Array<{ id: string; title: string; content: string }> {
  try {
    const bb = new Blackboard(stateDir);
    return bb
      .read()
      .filter((e) => e.status !== 'archived' && (e.type === 'blocker' || e.status === 'blocked'))
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        title: e.title,
        content: (e.content ?? '').slice(0, 400),
      }));
  } catch {
    return [];
  }
}

function pendingGitCommit(stateDir: string): GitCommitApprovalRequest | null {
  const queue = new GitCommitApprovalQueue(stateDir);
  const current = queue.read();
  return current?.status === 'pending' ? current : null;
}

/** Append a structured HITL event and notify Hermes subscribers. */
export function emitHermesHitlEvent(
  stateDir: string,
  partial: Omit<HermesHitlEvent, 'id' | 'timestamp'>,
): HermesHitlEvent {
  const ctx = readMissionContext(stateDir);
  const event: HermesHitlEvent = {
    id: nextEventId(),
    timestamp: Date.now(),
    missionId: partial.missionId ?? ctx.missionId,
    goal: partial.goal ?? ctx.goal,
    ...partial,
  };

  fs.mkdirSync(stateDir, { recursive: true });
  fs.appendFileSync(eventsFilePath(stateDir), JSON.stringify(event) + '\n', 'utf-8');
  emitHitlHermesListeners(stateDir, event);
  return event;
}

function readLoopMetrics(stateDir: string): LoopMetrics | null {
  return safeReadJsonFile<LoopMetrics>(path.join(stateDir, LOOP_METRICS_FILE));
}

function readDeliverables(stateDir: string): string[] {
  const deliverables: string[] = [];
  try {
    const pr = safeReadJsonFile<{ title?: string; status?: string }>(
      path.join(stateDir, CLOSED_LOOP_PR_FILE),
    );
    if (pr?.title) deliverables.push(`PR draft: ${pr.title}`);
  } catch {
    /* optional artifact */
  }
  try {
    const bb = new Blackboard(stateDir);
    for (const e of bb.read({ type: 'artifact', status: 'done' }).slice(-6)) {
      const label = e.title?.trim();
      if (label && !deliverables.includes(label)) deliverables.push(label);
    }
  } catch {
    /* optional */
  }
  return deliverables.slice(0, 8);
}

function extractNextStepsFromSynthesis(synthesis: string): string | null {
  const match = synthesis.match(
    /(?:^|\n)(?:#{1,3}\s+)?Next Steps\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n---\n|$)/i,
  );
  if (!match?.[1]) return null;
  const lines = match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines.find((l) => /^\d+[\.)]\s/.test(l) || /^[-*]\s/.test(l));
  return first?.replace(/^\d+[\.)]\s*/, '').replace(/^[-*]\s*/, '').trim() ?? null;
}

function resolveFinalStatus(
  loopStatus: LoopRunStatus | undefined,
  blockersEncountered: number,
  runStatus: string | undefined,
  abortPending: boolean,
): MissionFinalStatus {
  if (abortPending) return 'aborted';
  if (loopStatus === 'escalated') return 'escalated';
  if (loopStatus === 'failed' || runStatus === 'error') return 'failed';
  if (blockersEncountered > 0) return 'blocked';
  if (loopStatus === 'completed' || runStatus === 'done') return 'completed';
  return blockersEncountered > 0 ? 'blocked' : 'completed';
}

function buildSuggestedActionsForCompletion(
  status: MissionFinalStatus,
  blockers: string[],
): string[] {
  if (status === 'escalated') {
    return ['roland resume', 'roland replan', 'roland inject "ESCALATE: <operator guidance>"'];
  }
  if (status === 'blocked' && blockers.length > 0) {
    return ['roland board-status --concise', 'roland unblock <task-id> "<guidance>"'];
  }
  if (status === 'failed') {
    return ['roland board-status --concise', 'roland hitl-status'];
  }
  return ['roland board-status --concise', 'git diff', 'npm run test:run'];
}

/** Master Chief one-liner for terminal mission outcomes. */
export function formatHermesMissionCompleteSummary(report: MissionCompletionReport): string {
  const goalSnippet = report.goal.length > 55 ? `${report.goal.slice(0, 55)}…` : report.goal;
  switch (report.finalStatus) {
    case 'completed':
      return `Mission complete — ${goalSnippet}${report.successRate >= 0 ? ` (${report.successRate}% phase success)` : ''}`;
    case 'blocked':
      return `Mission blocked — ${goalSnippet}${report.blockers[0] ? `: ${report.blockers[0]!.slice(0, 60)}` : ''}`;
    case 'escalated':
      return `Mission escalated — ${goalSnippet} — operator input required`;
    case 'failed':
      return `Mission failed — ${goalSnippet}`;
    case 'aborted':
      return `Mission aborted — ${goalSnippet}`;
    default:
      return `Mission ended — ${goalSnippet}`;
  }
}

/** Build a structured completion report from on-disk mission state. */
export function buildMissionCompletionReport(
  stateDir: string,
  overrides: Partial<MissionCompletionReport> & { goal: string },
): MissionCompletionReport {
  const ctx = readMissionContext(stateDir);
  const runState = readRunState(stateDir);
  const loopState = readLoopState(stateDir);
  const metrics = readLoopMetrics(stateDir);
  const openBlockers = readOpenBlockers(stateDir);
  const hitlQueue = new HitlQueue(stateDir);
  const hitlState = hitlQueue.readState();
  const deliverables = overrides.deliverables ?? readDeliverables(stateDir);

  const blockersEncountered = overrides.blockersEncountered ?? openBlockers.length;
  const blockers =
    overrides.blockers ??
    (blockersEncountered > 0
      ? openBlockers.map((b) => b.title || b.content.slice(0, 80)).filter(Boolean)
      : []);

  const loopStatus = loopState?.status ?? runState?.loopStatus;
  const finalStatus =
    overrides.finalStatus ??
    resolveFinalStatus(loopStatus, blockersEncountered, runState?.status, Boolean(hitlState.abortPending));

  const successRate =
    overrides.successRate ??
    metrics?.successRate ??
    (loopState
      ? computeLoopMetrics(loopState).successRate
      : finalStatus === 'completed'
        ? 100
        : 0);

  const nextRecommendedAction =
    overrides.nextRecommendedAction ??
    (finalStatus === 'escalated'
      ? 'Review escalation gate and provide operator guidance via roland inject or roland resume.'
      : finalStatus === 'blocked'
        ? 'Resolve blockers listed above, then run roland board-status --concise.'
        : finalStatus === 'failed'
          ? 'Inspect run-state and loop logs, then retry with a focused goal.'
          : 'Review the diff, run tests, and commit when satisfied.');

  const suggestedActions =
    overrides.suggestedActions ?? buildSuggestedActionsForCompletion(finalStatus, blockers);

  const report: MissionCompletionReport = {
    id: overrides.id ?? `mission-${Date.now().toString(36)}`,
    timestamp: overrides.timestamp ?? Date.now(),
    runId: overrides.runId ?? runState?.runId,
    missionId: overrides.missionId ?? ctx.missionId,
    goal: overrides.goal,
    finalStatus,
    successRate,
    deliverables,
    blockers,
    nextRecommendedAction,
    suggestedActions,
    wavesRun: overrides.wavesRun ?? runState?.currentWave ?? loopState?.iteration ?? 0,
    blockersEncountered,
    loop: loopState
      ? {
          status: loopState.status,
          iteration: loopState.iteration,
          retryCount: loopState.retryCount,
          templateId: loopState.templateId,
          verificationPass: loopState.lastVerification?.pass ?? null,
          confidence: loopState.lastVerification?.confidence ?? null,
        }
      : runState?.loopStatus
        ? {
            status: runState.loopStatus,
            iteration: runState.loopIteration ?? 0,
            retryCount: runState.loopRetryCount ?? 0,
            templateId: runState.loopTemplateId,
            verificationPass: runState.lastVerification?.pass ?? null,
            confidence: runState.lastVerification?.confidence ?? null,
          }
        : undefined,
    durationMs:
      overrides.durationMs ??
      (runState?.startedAt ? Date.now() - runState.startedAt : undefined),
    summary: '',
  };

  report.summary = overrides.summary ?? formatHermesMissionCompleteSummary(report);
  return report;
}

/** Read the latest mission completion snapshot (if any). */
export function readMissionCompletionReport(stateDir: string): MissionCompletionReport | null {
  return safeReadJsonFile<MissionCompletionReport>(completionFilePath(stateDir));
}

/** Persist completion snapshot and push mission-complete event to Hermes subscribers. */
export function emitHermesMissionComplete(
  stateDir: string,
  report: MissionCompletionReport,
): MissionCompletionReport {
  const existing = readMissionCompletionReport(stateDir);
  if (existing?.runId && report.runId && existing.runId === report.runId) {
    return existing;
  }

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(completionFilePath(stateDir), JSON.stringify(report, null, 2), 'utf-8');

  emitHermesHitlEvent(stateDir, {
    kind: 'mission-complete',
    blockerDescription: report.summary,
    currentGate: 'mission-complete',
    suggestedActions: report.suggestedActions,
    goal: report.goal,
    missionId: report.missionId,
    detail: {
      finalStatus: report.finalStatus,
      successRate: report.successRate,
      deliverables: report.deliverables,
      blockers: report.blockers,
      nextRecommendedAction: report.nextRecommendedAction,
      runId: report.runId,
    },
  });

  return report;
}

/** Notify Hermes after a team / closed-loop mission finishes successfully. */
export function notifyHermesMissionCompleteFromTeamResult(
  stateDir: string,
  result: HermesTeamCompletionInput,
): MissionCompletionReport {
  const report = buildMissionCompletionReport(stateDir, {
    goal: result.goal,
    wavesRun: result.wavesRun,
    blockersEncountered: result.blockersEncountered,
    nextRecommendedAction: extractNextStepsFromSynthesis(result.synthesis) ?? undefined,
  });
  return emitHermesMissionComplete(stateDir, report);
}

/** Notify Hermes when a mission throws before returning a TeamResult. */
export function notifyHermesMissionFailed(
  stateDir: string,
  goal: string,
  error: unknown,
): MissionCompletionReport {
  const message = error instanceof Error ? error.message : String(error);
  const report = buildMissionCompletionReport(stateDir, {
    goal,
    finalStatus: 'failed',
    blockers: [message.slice(0, 200)],
    blockersEncountered: 1,
    nextRecommendedAction: 'Inspect the error, fix blockers, and relaunch with a focused goal.',
    summary: `Mission failed — ${goal.slice(0, 55)}: ${message.slice(0, 80)}`,
  });
  return emitHermesMissionComplete(stateDir, report);
}

/** Markdown report for Hermes / MCP mission_summary tool. */
export function formatMissionCompleteMarkdown(report: MissionCompletionReport): string {
  const lines: string[] = [];
  lines.push('## Mission Complete');
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  lines.push(`**Goal:** ${report.goal.slice(0, 200)}`);
  lines.push(`**Final status:** ${report.finalStatus}`);
  lines.push(`**Success rate:** ${report.successRate}%`);
  if (report.missionId) lines.push(`**Mission ID:** ${report.missionId}`);
  if (report.runId) lines.push(`**Run ID:** ${report.runId}`);

  if (report.deliverables.length > 0) {
    lines.push('');
    lines.push('### Deliverables');
    for (const d of report.deliverables) lines.push(`- ${d}`);
  }

  if (report.blockers.length > 0) {
    lines.push('');
    lines.push('### Blockers');
    for (const b of report.blockers.slice(0, 5)) lines.push(`- ${b}`);
  }

  if (report.loop) {
    lines.push('');
    lines.push('### Loop');
    lines.push(
      `- Status: ${report.loop.status} · iter=${report.loop.iteration} · retries=${report.loop.retryCount}`,
    );
    if (report.loop.confidence !== null && report.loop.confidence !== undefined) {
      lines.push(`- Verification confidence: ${report.loop.confidence}`);
    }
  }

  lines.push('');
  lines.push('### Next recommended action');
  lines.push(report.nextRecommendedAction);
  lines.push('');
  lines.push('### Suggested commands');
  for (const cmd of report.suggestedActions) {
    lines.push(`- \`${cmd}\``);
  }

  return lines.join('\n');
}

/** Read HITL events newer than `since` (epoch ms). Newest last. */
export function pollHermesHitlEvents(stateDir: string, since = 0, limit = 50): HermesHitlEvent[] {
  const file = eventsFilePath(stateDir);
  if (!fs.existsSync(file)) return [];
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    const events: HermesHitlEvent[] = [];
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as HermesHitlEvent;
        if (ev.timestamp > since) events.push(ev);
      } catch {
        /* skip malformed line */
      }
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}

/** Build aggregated HITL status for Hermes / dashboard / CLI. */
export function buildHitlStatusReport(stateDir: string): HitlStatusReport {
  const ctx = readMissionContext(stateDir);
  const hitlQueue = new HitlQueue(stateDir);
  const hitlState = hitlQueue.readState();
  const runState = readRunState(stateDir);
  const loopState = readLoopState(stateDir);
  const gitPending = pendingGitCommit(stateDir);
  const blockers = readOpenBlockers(stateDir);
  const runActive = isRunActive(stateDir);

  const suggestedActions: string[] = [];
  let waitingOnHitl = false;
  let hitlReason: string | undefined;
  let currentGate: string | undefined;
  let blockerDescription: string | undefined;

  if (hitlState.paused) {
    waitingOnHitl = true;
    currentGate = 'pause';
    hitlReason = 'Run paused — awaiting operator resume';
    blockerDescription = hitlReason;
    suggestedActions.push('roland resume');
    suggestedActions.push('roland inject "<directive>"');
  }

  if (hitlState.abortPending) {
    waitingOnHitl = true;
    currentGate = currentGate ?? 'abort';
    hitlReason = hitlReason ?? 'Abort pending — run will stop after current wave';
    blockerDescription = blockerDescription ?? hitlReason;
    suggestedActions.push('roland resume  # cancel abort if still paused');
  }

  if (gitPending) {
    waitingOnHitl = true;
    currentGate = 'git-commit';
    hitlReason = `Git-commit approval pending (${gitPending.id})`;
    blockerDescription = gitPending.message.slice(0, 200);
    suggestedActions.push(`roland approve-commit ${gitPending.id}`);
    suggestedActions.push(`roland reject-commit ${gitPending.id}`);
  }

  if (loopState?.status === 'escalated') {
    waitingOnHitl = true;
    currentGate = 'escalation';
    const critique = loopState.lastCritique?.summary;
    const verify = loopState.lastVerification?.summary;
    hitlReason = critique ?? verify ?? 'Loop escalated to operator';
    blockerDescription = hitlReason;
    suggestedActions.push('roland resume');
    suggestedActions.push('roland replan');
    suggestedActions.push('roland inject "ESCALATE: <operator guidance>"');
  }

  if (blockers.length > 0 && !waitingOnHitl) {
    waitingOnHitl = true;
    currentGate = 'blocker';
    hitlReason = blockers[0]!.title;
    blockerDescription = blockers[0]!.content.slice(0, 200) || blockers[0]!.title;
    suggestedActions.push('roland unblock <task-id> "<guidance>"');
    suggestedActions.push('roland board-status --concise');
  }

  if (
    loopState?.lastVerification &&
    !loopState.lastVerification.pass &&
    loopState.status === 'running' &&
    (loopState.lastVerification.confidence ?? 1) === 0
  ) {
    waitingOnHitl = true;
    currentGate = currentGate ?? 'verification';
    hitlReason = hitlReason ?? `Verification gate failed — confidence=0`;
    blockerDescription = blockerDescription ?? loopState.lastVerification.summary;
    suggestedActions.push('roland hitl-status');
    suggestedActions.push('roland board-status --concise');
  }

  if (suggestedActions.length === 0) {
    suggestedActions.push('roland hitl-status');
    suggestedActions.push('roland board-status --concise');
  }

  const missionCompletion = readMissionCompletionReport(stateDir);

  return {
    stateDir,
    missionId: ctx.missionId,
    goal: ctx.goal,
    runActive,
    waitingOnHitl,
    hitlReason,
    currentGate,
    blockerDescription,
    suggestedActions: [...new Set(suggestedActions)],
    hitl: {
      paused: hitlState.paused,
      abortPending: Boolean(hitlState.abortPending),
      queueLength: hitlState.pendingCount ?? 0,
    },
    loop: loopState
      ? {
          status: loopState.status,
          phase: loopState.currentPhase ?? null,
          iteration: loopState.iteration,
          retryCount: loopState.retryCount,
          lastVerificationPass: loopState.lastVerification?.pass ?? null,
          confidence: loopState.lastVerification?.confidence ?? null,
          lastCritiqueDecision: loopState.lastCritique?.retryDecision ?? null,
        }
      : runState?.loopStatus
        ? {
            status: runState.loopStatus,
            phase: runState.loopPhase ?? null,
            iteration: runState.loopIteration ?? 0,
            retryCount: runState.loopRetryCount ?? 0,
            lastVerificationPass: runState.lastVerification?.pass ?? null,
            confidence: runState.lastVerification?.confidence ?? null,
            lastCritiqueDecision: runState.lastCritique?.retryDecision ?? null,
          }
        : undefined,
    gitCommitApproval: gitPending
      ? {
          id: gitPending.id,
          message: gitPending.message,
          status: gitPending.status,
          expiresAt: gitPending.timeoutAt,
        }
      : null,
    blockers,
    missionCompletion,
    updatedAt: Date.now(),
  };
}

/** Master Chief one-liner — e.g. "Mission blocked at verification gate — awaiting operator input on git-commit". */
export function formatHermesHitlSummary(report: HitlStatusReport): string {
  if (!report.runActive && report.missionCompletion && !report.waitingOnHitl) {
    return report.missionCompletion.summary;
  }
  if (!report.waitingOnHitl) {
    return report.runActive
      ? `Mission active${report.goal ? `: "${report.goal.slice(0, 60)}"` : ''} — no HITL blockers.`
      : report.missionCompletion?.summary ?? 'No active mission — idle.';
  }

  const gate = report.currentGate ?? 'HITL';
  const gateLabels: Record<string, string> = {
    pause: 'pause gate',
    abort: 'abort gate',
    'git-commit': 'git-commit approval',
    escalation: 'escalation gate',
    verification: 'verification gate',
    blocker: 'blocker',
  };
  const gateLabel = gateLabels[gate] ?? gate;
  const detail = report.blockerDescription?.slice(0, 100) ?? report.hitlReason?.slice(0, 100) ?? '';
  const suffix = detail ? ` — ${detail}` : '';
  return `Mission blocked at ${gateLabel}${suffix}`;
}

/** Markdown report for Hermes / MCP hitl_status tool. */
export function formatHitlStatusMarkdown(report: HitlStatusReport): string {
  const lines: string[] = [];
  lines.push('## HITL Status');
  lines.push('');
  lines.push(formatHermesHitlSummary(report));
  lines.push('');

  if (report.missionId) lines.push(`**Mission ID:** ${report.missionId}`);
  if (report.goal) lines.push(`**Goal:** ${report.goal.slice(0, 120)}`);
  lines.push(`**Run active:** ${report.runActive ? 'yes' : 'no'}`);
  lines.push(`**Waiting on HITL:** ${report.waitingOnHitl ? '**YES**' : 'no'}`);

  if (report.currentGate) lines.push(`**Current gate:** ${report.currentGate}`);
  if (report.blockerDescription) lines.push(`**Blocker:** ${report.blockerDescription.slice(0, 300)}`);

  if (report.loop) {
    lines.push('');
    lines.push('### Loop');
    lines.push(
      `- Status: ${report.loop.status} · phase=${report.loop.phase ?? '—'} · iter=${report.loop.iteration} · retries=${report.loop.retryCount}`,
    );
    if (report.loop.confidence !== null) {
      lines.push(`- Verification confidence: ${report.loop.confidence}`);
    }
    if (report.loop.lastCritiqueDecision) {
      lines.push(`- Last critique: ${report.loop.lastCritiqueDecision}`);
    }
  }

  if (report.gitCommitApproval) {
    lines.push('');
    lines.push('### Git-commit approval');
    lines.push(`- ID: ${report.gitCommitApproval.id}`);
    lines.push(`- Message: ${report.gitCommitApproval.message.slice(0, 120)}`);
  }

  if (report.blockers.length > 0) {
    lines.push('');
    lines.push(`### Blockers (${report.blockers.length})`);
    for (const b of report.blockers.slice(0, 5)) {
      lines.push(`- **${b.title}**`);
    }
  }

  if (report.missionCompletion) {
    lines.push('');
    lines.push('### Last mission outcome');
    lines.push(report.missionCompletion.summary);
    lines.push(`- Status: ${report.missionCompletion.finalStatus} · success rate: ${report.missionCompletion.successRate}%`);
  }

  lines.push('');
  lines.push('### Suggested actions');
  for (const cmd of report.suggestedActions) {
    lines.push(`- \`${cmd}\``);
  }

  return lines.join('\n');
}
