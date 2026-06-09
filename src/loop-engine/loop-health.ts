/**
 * Loop health diagnostics — aggregated report for /api/loop-health.
 */

import fs from 'fs';
import path from 'path';
import type { BlackboardEntry } from '../rco/blackboard.js';
import { readRunState } from '../rco/run-state.js';
import { readSupervisorRecord, isProcessRunning } from '../rco/supervisor.js';
import { readLoopState, LOOP_STATE_FILE } from './loop-state.js';
import { readLoopCheckpoint } from './loop-checkpoint.js';
import { CLOSED_LOOP_PR_FILE } from './closed-loop.js';
import { findLatestLoopMemory, LOOPS_ROOT } from './loop-memory.js';
import {
  LoopObservability,
  computeLoopMetrics,
  summarizeHistory,
  LOOP_METRICS_FILE,
  LOOP_HISTORY_FILE,
} from './loop-observability.js';
import { LoopTemplates } from './loop-templates.js';

export type LoopHealthStatus = 'healthy' | 'degraded' | 'escalated' | 'idle' | 'unknown';

export interface LoopHealthReport {
  status: LoopHealthStatus;
  healthy: boolean;
  timestamp: number;
  stateDir: string;
  loop: {
    active: boolean;
    templateId: string | null;
    currentPhase: string | null;
    iteration: number | null;
    retryCount: number | null;
    runStatus: string | null;
    lastVerificationPass: boolean | null;
    lastCritiqueDecision: string | null;
    /** EvaluationGate weighted confidence (0–1). */
    confidence: number | null;
    /** True when confidence meets threshold and required gates passed. */
    verificationAccepted: boolean | null;
  };
  /** Recent PACVRE transitions for dashboard timeline. */
  phaseHistory: Array<{
    phase: string;
    success?: boolean;
    summary?: string;
    startedAt: number;
    completedAt?: number;
  }>;
  /** Specialist spawn intents recorded on the blackboard during closed-loop runs. */
  specialistSpawns: Array<{
    primaryAgent: string;
    phase: string;
    reason: string;
    iteration: number;
    spawnedAt: number;
    supportingAgents: string[];
  }>;
  /** PR draft artifact when closed loop completes or escalates. */
  closedLoopPr: {
    title: string;
    body: string;
    status: string;
    iteration: number;
    at: number;
    loopId?: string;
    exitReason?: string;
  } | null;
  /** LoopMemory disk persistence summary. */
  loopMemory: {
    loopId: string | null;
    reflectionCount: number;
    confidenceStreak: number;
    lastReflection: string | null;
    betweenIterationRuns: number;
  } | null;
  /** Latest exit condition evaluation statuses. */
  exitConditions: Array<{
    id: string;
    type: string;
    description: string;
    met: boolean;
    reason: string;
  }>;
  exitEvaluation: {
    shouldExit: boolean;
    reason: string;
    at: number | null;
  } | null;
  metrics: ReturnType<typeof computeLoopMetrics> | null;
  historySummary: string | null;
  checkpoint: {
    present: boolean;
    phase: string | null;
    savedAt: number | null;
  };
  supervisor: {
    alive: boolean;
    pid: number | null;
    restarts: number | null;
  };
  files: {
    loopState: boolean;
    loopMetrics: boolean;
    loopHistory: boolean;
    loopCheckpoint: boolean;
    runState: boolean;
    loopMemory: boolean;
  };
  diagnostics: string[];
  actions: {
    canResume: boolean;
    canReplan: boolean;
    hitlResumeCmd: string;
    hitlReplanCmd: string;
  };
  templates: Array<{ name: string; description: string; phaseCount: number }>;
}

function fileExists(stateDir: string, name: string): boolean {
  return fs.existsSync(path.join(stateDir, name));
}

function readBlackboardEntries(stateDir: string): BlackboardEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir, 'blackboard.json'), 'utf-8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function readClosedLoopPr(stateDir: string): LoopHealthReport['closedLoopPr'] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir, CLOSED_LOOP_PR_FILE), 'utf-8'));
    if (!raw?.title) return null;
    return {
      title: String(raw.title),
      body: String(raw.body ?? ''),
      status: String(raw.status ?? 'unknown'),
      iteration: Number(raw.iteration ?? 0),
      at: Number(raw.at ?? Date.now()),
      loopId: raw.loopId ? String(raw.loopId) : undefined,
      exitReason: raw.exitReason ? String(raw.exitReason) : undefined,
    };
  } catch {
    return null;
  }
}

/** Parse SpecialistSpawner blackboard posts into dashboard-friendly rows. */
function extractSpecialistSpawns(entries: BlackboardEntry[]): LoopHealthReport['specialistSpawns'] {
  const spawns: LoopHealthReport['specialistSpawns'] = [];
  for (const entry of entries) {
    if (!entry.tags?.includes('spawn') || !entry.tags?.includes('loop')) continue;
    const lines = String(entry.content ?? '').split('\n');
    const phaseLine = lines.find((l) => l.startsWith('Phase: '));
    const primaryLine = lines.find((l) => l.startsWith('Primary: '));
    const supportingLine = lines.find((l) => l.startsWith('Supporting: '));
    const reasonLine = lines.find((l) => l.startsWith('Reason: '));
    const iterMatch = reasonLine?.match(/iteration (\d+)/i);
    spawns.push({
      primaryAgent: primaryLine?.slice('Primary: '.length) ?? entry.title.replace(/^Spawn:\s*/, '').split(' ')[0] ?? 'agent',
      phase: phaseLine?.slice('Phase: '.length) ?? 'act',
      reason: reasonLine?.slice('Reason: '.length) ?? entry.title,
      iteration: iterMatch ? Number(iterMatch[1]) : 1,
      spawnedAt: entry.createdAt ?? entry.updatedAt ?? Date.now(),
      supportingAgents: supportingLine
        ? supportingLine.slice('Supporting: '.length).split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    });
  }
  return spawns.slice(-24);
}

export function buildLoopHealthReport(stateDir: string): LoopHealthReport {
  const loopState = readLoopState(stateDir);
  const runState = readRunState(stateDir);
  const checkpoint = readLoopCheckpoint(stateDir);
  const supervisor = readSupervisorRecord(stateDir);
  const supervisorAlive = supervisor?.pid ? isProcessRunning(supervisor.pid) : false;

  const observability = new LoopObservability(stateDir);
  const storedMetrics = observability.readMetrics();
  const history = observability.readHistory();
  const metrics =
    storedMetrics ?? (loopState ? computeLoopMetrics(loopState) : null);

  const diagnostics: string[] = [];
  let status: LoopHealthStatus = 'idle';

  if (loopState) {
    if (loopState.status === 'escalated') {
      status = 'escalated';
      diagnostics.push('Loop escalated to human operator');
    } else if (loopState.status === 'running') {
      status = supervisorAlive ? 'healthy' : 'degraded';
      if (!supervisorAlive) diagnostics.push('Loop state running but supervisor not alive');
    } else if (loopState.status === 'completed') {
      status = 'healthy';
    } else if (loopState.status === 'failed') {
      status = 'degraded';
      diagnostics.push('Loop status is failed');
    }
  }

  if (runState?.connectionDropped) {
    status = 'degraded';
    diagnostics.push(runState.connectionDropMessage ?? 'Connection dropped');
  }

  if (runState?.hitlPaused) {
    diagnostics.push('Run paused via HITL — send resume to continue');
  }

  if (metrics?.failureReasons?.length) {
    for (const r of metrics.failureReasons.slice(0, 3)) {
      diagnostics.push(`Failure: ${r}`);
    }
  }

  if (!loopState && !runState?.loopTemplateId) {
    status = 'idle';
  }

  const templates = new LoopTemplates();
  const templateList = templates.list();

  const canResume = Boolean(
    runState?.hitlPaused || (loopState?.status === 'escalated' && supervisorAlive),
  );
  const canReplan = Boolean(loopState && supervisorAlive);

  const lastVerification = loopState?.lastVerification ?? runState?.lastVerification;
  const phaseHistory =
    loopState?.phaseHistory?.slice(-24).map((t) => ({
      phase: t.phase,
      success: t.success,
      summary: t.summary?.slice(0, 120),
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    })) ??
    runState?.loopPhaseHistory ??
    [];

  const specialistSpawns = extractSpecialistSpawns(readBlackboardEntries(stateDir));
  const closedLoopPr = readClosedLoopPr(stateDir);
  const memoryState = findLatestLoopMemory(stateDir);
  const exitConditions =
    loopState?.exitConditionStatus?.map((s) => ({
      id: s.id,
      type: s.type,
      description: s.description,
      met: s.met,
      reason: s.reason,
    })) ?? [];
  const exitEvaluation = loopState?.lastExitEvaluation
    ? {
        shouldExit: loopState.lastExitEvaluation.shouldExit,
        reason: loopState.lastExitEvaluation.reason,
        at: loopState.lastExitEvaluation.at,
      }
    : null;

  return {
    status,
    healthy: status === 'healthy' || status === 'idle',
    timestamp: Date.now(),
    stateDir,
    loop: {
      active: Boolean(loopState?.status === 'running' || runState?.loopTemplateId),
      templateId: loopState?.templateId ?? runState?.loopTemplateId ?? null,
      currentPhase: loopState?.currentPhase ?? runState?.loopPhase ?? null,
      iteration: loopState?.iteration ?? runState?.loopIteration ?? null,
      retryCount: loopState?.retryCount ?? runState?.loopRetryCount ?? null,
      runStatus: loopState?.status ?? null,
      lastVerificationPass: lastVerification?.pass ?? null,
      lastCritiqueDecision:
        loopState?.lastCritique?.retryDecision ?? runState?.lastCritique?.retryDecision ?? null,
      confidence:
        lastVerification && 'confidence' in lastVerification
          ? (lastVerification.confidence ?? null)
          : null,
      verificationAccepted:
        lastVerification && 'accepted' in lastVerification
          ? (lastVerification.accepted ?? null)
          : null,
    },
    phaseHistory,
    specialistSpawns,
    closedLoopPr,
    loopMemory: memoryState
      ? {
          loopId: memoryState.loopId,
          reflectionCount: memoryState.reflections.length,
          confidenceStreak: memoryState.confidenceStreak,
          lastReflection:
            memoryState.reflections.at(-1)?.content.slice(0, 200) ?? null,
          betweenIterationRuns: memoryState.betweenIterationRuns.length,
        }
      : null,
    exitConditions,
    exitEvaluation,
    metrics,
    historySummary: history.entries.length ? summarizeHistory(history) : null,
    checkpoint: {
      present: Boolean(checkpoint),
      phase: checkpoint?.phase ?? null,
      savedAt: checkpoint?.savedAt ?? null,
    },
    supervisor: {
      alive: supervisorAlive,
      pid: supervisor?.pid ?? null,
      restarts: supervisor?.restarts ?? null,
    },
    files: {
      loopState: fileExists(stateDir, LOOP_STATE_FILE),
      loopMetrics: fileExists(stateDir, LOOP_METRICS_FILE),
      loopHistory: fileExists(stateDir, LOOP_HISTORY_FILE),
      loopCheckpoint: fileExists(stateDir, 'loop-checkpoint.json'),
      runState: fileExists(stateDir, 'run-state.json'),
      loopMemory: memoryState
        ? fs.existsSync(path.join(stateDir, LOOPS_ROOT, memoryState.loopId, 'state.json'))
        : false,
    },
    diagnostics,
    actions: {
      canResume,
      canReplan,
      hitlResumeCmd: 'roland resume',
      hitlReplanCmd: 'roland replan',
    },
    templates: templateList,
  };
}
