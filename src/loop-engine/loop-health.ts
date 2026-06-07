/**
 * Loop health diagnostics — aggregated report for /api/loop-health.
 */

import fs from 'fs';
import path from 'path';
import { readRunState } from '../rco/run-state.js';
import { readSupervisorRecord, isProcessRunning } from '../rco/supervisor.js';
import { readLoopState, LOOP_STATE_FILE } from './loop-state.js';
import { readLoopCheckpoint } from './loop-checkpoint.js';
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
  };
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
      lastVerificationPass: loopState?.lastVerification?.pass ?? runState?.lastVerification?.pass ?? null,
      lastCritiqueDecision:
        loopState?.lastCritique?.retryDecision ?? runState?.lastCritique?.retryDecision ?? null,
    },
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
