/**
 * ## HITL → Hermes Propagation
 *
 * Surfaces Human-in-the-Loop escalations, blockers, and verification failures
 * to Hermes (Master Chief) via structured events and queryable status reports.
 *
 * Events append to `.roland/hermes-hitl-events.jsonl` for push/poll by MCP clients.
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

export const HERMES_HITL_EVENTS_FILE = 'hermes-hitl-events.jsonl';

export type HermesHitlEventKind =
  | 'hitl-pause'
  | 'hitl-abort-pending'
  | 'git-commit-approval'
  | 'verification-failure'
  | 'loop-escalation'
  | 'blocker'
  | 'verification-gate';

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
    updatedAt: Date.now(),
  };
}

/** Master Chief one-liner — e.g. "Mission blocked at verification gate — awaiting operator input on git-commit". */
export function formatHermesHitlSummary(report: HitlStatusReport): string {
  if (!report.waitingOnHitl) {
    return report.runActive
      ? `Mission active${report.goal ? `: "${report.goal.slice(0, 60)}"` : ''} — no HITL blockers.`
      : 'No active mission — idle.';
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

  lines.push('');
  lines.push('### Suggested actions');
  for (const cmd of report.suggestedActions) {
    lines.push(`- \`${cmd}\``);
  }

  return lines.join('\n');
}
