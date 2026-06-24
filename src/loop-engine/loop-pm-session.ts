/**
 * Loop PM session persistence — shared by lightweight Plan/Act and legacy PM bridge.
 */

import fs from 'fs';
import path from 'path';
import type { TeamPlan, TeamTaskResult } from '../rco/team-orchestrator.js';

export const LOOP_PM_SESSION_FILE = 'loop-pm-session.json';

export type LoopPmExecutionPath = 'pm_team' | 'lightweight';

export interface LoopPmSession {
  iteration: number;
  templateId: string;
  executionPath: LoopPmExecutionPath;
  routingReason: string;
  plan?: TeamPlan;
  wavesRun: number;
  blockersEncountered: number;
  taskResults: Record<string, TeamTaskResult>;
  updatedAt: number;
}

export function readLoopPmSession(stateDir: string): LoopPmSession | null {
  const filePath = path.join(stateDir, LOOP_PM_SESSION_FILE);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as LoopPmSession;
  } catch {
    return null;
  }
}

export function writeLoopPmSession(stateDir: string, session: LoopPmSession): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, LOOP_PM_SESSION_FILE),
    JSON.stringify({ ...session, updatedAt: Date.now() }, null, 2),
    'utf-8',
  );
}
