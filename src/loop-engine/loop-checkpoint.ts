/**
 * Loop checkpointing — save state before each major phase for crash recovery.
 *
 * Persists `.roland/loop-checkpoint.json` (full LoopState snapshot + metadata).
 */

import fs from 'fs';
import path from 'path';
import type { Phase } from './loop-phases.js';
import type { LoopState } from './loop-state.js';
import { readLoopState } from './loop-state.js';

export const LOOP_CHECKPOINT_FILE = 'loop-checkpoint.json';

export interface LoopCheckpoint {
  savedAt: number;
  phase: Phase;
  iteration: number;
  state: LoopState;
  supervisorRestart?: boolean;
}

function checkpointPath(stateDir: string): string {
  return path.join(stateDir, LOOP_CHECKPOINT_FILE);
}

/** Save a checkpoint before entering a phase. */
export function saveLoopCheckpoint(
  stateDir: string,
  phase: Phase,
  state: LoopState,
  opts: { supervisorRestart?: boolean } = {},
): void {
  fs.mkdirSync(stateDir, { recursive: true });
  const checkpoint: LoopCheckpoint = {
    savedAt: Date.now(),
    phase,
    iteration: state.iteration,
    state: {
      ...state,
      phaseHistory: state.phaseHistory.map((t) => ({ ...t })),
      lastVerification: state.lastVerification ? { ...state.lastVerification } : undefined,
      lastCritique: state.lastCritique ? { ...state.lastCritique } : undefined,
      critiqueHistory: state.critiqueHistory?.map((c) => ({ ...c })),
    },
    supervisorRestart: opts.supervisorRestart,
  };
  try {
    fs.writeFileSync(checkpointPath(stateDir), JSON.stringify(checkpoint, null, 2), 'utf-8');
    console.error(
      `[Loop][checkpoint] saved phase=${phase} iter=${state.iteration} retry=${state.retryCount}`,
    );
  } catch {
    // Non-fatal — loop continues from in-memory state.
  }
}

export function readLoopCheckpoint(stateDir: string): LoopCheckpoint | null {
  try {
    const raw = fs.readFileSync(checkpointPath(stateDir), 'utf-8');
    return JSON.parse(raw) as LoopCheckpoint;
  } catch {
    return null;
  }
}

export function clearLoopCheckpoint(stateDir: string): void {
  try {
    fs.rmSync(checkpointPath(stateDir), { force: true });
  } catch {
    // Ignore.
  }
}

/**
 * Attempt recovery from checkpoint or loop-state.json after supervisor restart.
 * Returns restored state when a resumable snapshot exists.
 */
export function tryRecoverLoopState(stateDir: string): {
  recovered: boolean;
  state: LoopState | null;
  source: 'checkpoint' | 'loop-state' | null;
  phase?: Phase;
} {
  const checkpoint = readLoopCheckpoint(stateDir);
  if (checkpoint?.state && checkpoint.state.status === 'running') {
    console.error(
      `[Loop][recovery] restored from checkpoint phase=${checkpoint.phase} ` +
        `iter=${checkpoint.iteration} savedAt=${new Date(checkpoint.savedAt).toISOString()}`,
    );
    return {
      recovered: true,
      state: checkpoint.state,
      source: 'checkpoint',
      phase: checkpoint.phase,
    };
  }

  const loopState = readLoopState(stateDir);
  if (loopState && loopState.status === 'running') {
    console.error(
      `[Loop][recovery] restored from loop-state.json phase=${loopState.currentPhase} ` +
        `iter=${loopState.iteration}`,
    );
    return {
      recovered: true,
      state: loopState,
      source: 'loop-state',
      phase: loopState.currentPhase,
    };
  }

  return { recovered: false, state: null, source: null };
}
