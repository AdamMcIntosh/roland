/**
 * Loop state persistence — `.roland/loop-state.json`
 *
 * Survives supervisor restarts; read by dashboard via run-state loop fields.
 */

import fs from 'fs';
import path from 'path';
import type { LoopCritiqueSnapshot } from './self-improvement/types.js';
import type { Phase } from './loop-phases.js';

export type { LoopCritiqueSnapshot } from './self-improvement/types.js';

export const LOOP_STATE_FILE = 'loop-state.json';

export type LoopRunStatus = 'running' | 'completed' | 'failed' | 'escalated';

export interface PhaseTransition {
  phase: Phase;
  startedAt: number;
  completedAt?: number;
  success?: boolean;
  summary?: string;
}

export interface LoopVerificationStrategySnapshot {
  type: string;
  pass: boolean;
  durationMs: number;
  failures?: string[];
}

export interface LoopVerificationSnapshot {
  pass: boolean;
  summary: string;
  at: number;
  durationMs?: number;
  strategies?: LoopVerificationStrategySnapshot[];
}

/** Snapshot from retry phase — persisted for dashboard / resume. */
export interface LoopRetrySnapshot {
  attempt: number;
  strategy: 'full' | 'focused';
  focusAreas: string[];
  failedFiles: string[];
  backoffMs: number;
  at: number;
  iteration: number;
}

export interface LoopState {
  templateId: string;
  goal: string;
  iteration: number;
  retryCount: number;
  currentPhase: Phase;
  phaseHistory: PhaseTransition[];
  status: LoopRunStatus;
  startedAt: number;
  updatedAt: number;
  lastVerification?: LoopVerificationSnapshot;
  /** Most recent critique snapshot for dashboard / retry decisions. */
  lastCritique?: LoopCritiqueSnapshot;
  /** Most recent retry snapshot for dashboard / focused retry scope. */
  lastRetry?: LoopRetrySnapshot;
  /** Append-only critique history across iterations. */
  critiqueHistory?: LoopCritiqueSnapshot[];
  /** Append-only retry history across iterations. */
  retryHistory?: LoopRetrySnapshot[];
}

export function createInitialLoopState(
  templateId: string,
  goal: string,
  firstPhase: Phase,
): LoopState {
  const now = Date.now();
  return {
    templateId,
    goal,
    iteration: 1,
    retryCount: 0,
    currentPhase: firstPhase,
    phaseHistory: [{ phase: firstPhase, startedAt: now }],
    status: 'running',
    startedAt: now,
    updatedAt: now,
  };
}

export class LoopStateStore {
  private readonly filePath: string;
  private state: LoopState;

  constructor(stateDir: string, initial: LoopState, opts: { skipInitialFlush?: boolean } = {}) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, LOOP_STATE_FILE);
    this.state = initial;
    if (!opts.skipInitialFlush) {
      this.flush();
    }
  }

  /** Load existing loop-state.json when resuming, else create fresh state. */
  static loadOrCreate(
    stateDir: string,
    templateId: string,
    goal: string,
    firstPhase: Phase,
    resume: boolean,
  ): LoopStateStore {
    if (resume) {
      const existing = readLoopState(stateDir);
      if (
        existing &&
        existing.status === 'running' &&
        existing.templateId === templateId &&
        existing.goal === goal
      ) {
        console.error(
          `[Loop][state] Resuming from loop-state.json iteration=${existing.iteration} retryCount=${existing.retryCount}`,
        );
        return new LoopStateStore(stateDir, existing, { skipInitialFlush: true });
      }
    }
    return new LoopStateStore(stateDir, createInitialLoopState(templateId, goal, firstPhase));
  }

  get(): LoopState {
    return {
      ...this.state,
      phaseHistory: this.state.phaseHistory.map((t) => ({ ...t })),
      lastVerification: this.state.lastVerification
        ? { ...this.state.lastVerification }
        : undefined,
      lastCritique: this.state.lastCritique ? { ...this.state.lastCritique } : undefined,
      lastRetry: this.state.lastRetry ? { ...this.state.lastRetry } : undefined,
      critiqueHistory: this.state.critiqueHistory?.map((c) => ({ ...c })),
      retryHistory: this.state.retryHistory?.map((r) => ({ ...r })),
    };
  }

  transitionTo(phase: Phase): void {
    const now = Date.now();
    const last = this.state.phaseHistory[this.state.phaseHistory.length - 1];
    if (last && !last.completedAt) {
      last.completedAt = now;
    }
    this.state.currentPhase = phase;
    this.state.phaseHistory.push({ phase, startedAt: now });
    this.state.updatedAt = now;
    this.flush();
  }

  completePhase(
    phase: Phase,
    result: {
      success: boolean;
      summary: string;
      verification?: LoopVerificationSnapshot;
      critique?: LoopCritiqueSnapshot;
      retry?: LoopRetrySnapshot;
    },
  ): void {
    const entry = [...this.state.phaseHistory].reverse().find((t) => t.phase === phase && !t.completedAt);
    const now = Date.now();
    if (entry) {
      entry.completedAt = now;
      entry.success = result.success;
      entry.summary = result.summary;
    }
    if (phase === 'verify') {
      this.state.lastVerification = result.verification ?? {
        pass: result.success,
        summary: result.summary,
        at: now,
      };
    }
    if (phase === 'critique' && result.critique) {
      this.state.lastCritique = result.critique;
      if (!this.state.critiqueHistory) this.state.critiqueHistory = [];
      this.state.critiqueHistory.push(result.critique);
    }
    if (phase === 'retry' && result.retry) {
      this.state.lastRetry = result.retry;
      if (!this.state.retryHistory) this.state.retryHistory = [];
      this.state.retryHistory.push(result.retry);
    }
    this.state.updatedAt = now;
    this.flush();
  }

  incrementIteration(): void {
    this.state.iteration += 1;
    // retryCount accumulates across iterations until success or escalation.
    this.state.updatedAt = Date.now();
    this.flush();
  }

  incrementRetry(): void {
    this.state.retryCount += 1;
    this.state.updatedAt = Date.now();
    this.flush();
  }

  setStatus(status: LoopRunStatus): void {
    this.state.status = status;
    this.state.updatedAt = Date.now();
    this.flush();
  }

  private flush(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // Non-fatal — in-memory state still drives the current run.
    }
  }
}

export function readLoopState(stateDir: string): LoopState | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir, LOOP_STATE_FILE), 'utf-8');
    return JSON.parse(raw) as LoopState;
  } catch {
    return null;
  }
}
