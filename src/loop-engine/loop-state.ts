/**
 * Loop state persistence — `.roland/loop-state.json`
 *
 * Survives supervisor restarts; read by dashboard via run-state loop fields.
 */

import fs from 'fs';
import path from 'path';
import type { Phase } from './loop-phases.js';

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

  constructor(stateDir: string, initial: LoopState) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, LOOP_STATE_FILE);
    this.state = initial;
    this.flush();
  }

  get(): LoopState {
    return {
      ...this.state,
      phaseHistory: this.state.phaseHistory.map((t) => ({ ...t })),
      lastVerification: this.state.lastVerification
        ? { ...this.state.lastVerification }
        : undefined,
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
    result: { success: boolean; summary: string; verification?: LoopVerificationSnapshot },
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
    this.state.updatedAt = now;
    this.flush();
  }

  incrementIteration(): void {
    this.state.iteration += 1;
    this.state.retryCount = 0;
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
