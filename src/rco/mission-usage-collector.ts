/**
 * In-memory mission usage collector — aggregates TaskUsageRecord during ClosedLoop runs.
 */

import type { TaskUsageRecord } from './usage-tracker.js';

const collectors = new Map<string, TaskUsageRecord[]>();

function key(stateDir: string, runId: string): string {
  return `${stateDir}::${runId}`;
}

export function startMissionUsageCollector(stateDir: string, runId: string): void {
  collectors.set(key(stateDir, runId), []);
}

export function recordMissionUsage(
  stateDir: string,
  runId: string,
  record: TaskUsageRecord,
): void {
  const k = key(stateDir, runId);
  const list = collectors.get(k) ?? [];
  list.push(record);
  collectors.set(k, list);
}

export function drainMissionUsage(stateDir: string, runId: string): TaskUsageRecord[] {
  const k = key(stateDir, runId);
  const list = collectors.get(k) ?? [];
  collectors.delete(k);
  return list;
}

export function peekMissionUsage(stateDir: string, runId: string): TaskUsageRecord[] {
  return [...(collectors.get(key(stateDir, runId)) ?? [])];
}
