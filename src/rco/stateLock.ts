/**
 * Simple fs-based lock for parallel-swarm shared state access
 */

import fs from 'fs';
import path from 'path';

const LOCK_SUFFIX = '.rco-state.lock';
const RETRY_MS = 50;
const MAX_WAIT_MS = 5000;

export function acquireLock(stateFilePath: string): () => void {
  const lockPath = stateFilePath.replace(/\.json$/i, '') + LOCK_SUFFIX;
  const start = Date.now();
  while (true) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      return () => {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // ignore
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (Date.now() - start > MAX_WAIT_MS) throw new Error('RCO state lock timeout');
      const delay = RETRY_MS + Math.floor(Math.random() * 50);
      const deadline = Date.now() + delay;
      while (Date.now() < deadline) {
        // busy wait
      }
    }
  }
}

export function readStateUnlocked<T>(stateFilePath: string): T | null {
  try {
    const raw = fs.readFileSync(stateFilePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStateUnlocked(stateFilePath: string, state: unknown): void {
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
}
