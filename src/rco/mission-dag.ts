/**
 * Mission DAG — directed acyclic graph model for Roland team missions.
 *
 * Inspired by Cursor Cookbook DAG Task Runner patterns: explicit nodes,
 * dependency edges, parallel-ready scheduling, critical-path visibility,
 * and JSON export for dashboard graph visualization.
 *
 * Backward-compatible: flat task plans (dependsOn only) are normalized
 * into a DAG automatically; DAG planning prompts are opt-in via env or
 * goal complexity heuristics.
 */

import fs from 'fs';
import path from 'path';
import type { ReviewTask } from './pm-prompts.js';

export const MISSION_DAG_FILE = 'mission-dag.json';

export type MissionNodeStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'skipped';

export type MissionPlanningMode = 'flat' | 'dag';

export interface MissionNode {
  id: string;
  title: string;
  agent: string;
  description: string;
  dependsOn: string[];
  priority: string;
  status: MissionNodeStatus;
  /** Wave number when this node was dispatched (1-based). */
  wave?: number;
  startedAt?: number;
  completedAt?: number;
  hadBlocker?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MissionEdge {
  from: string;
  to: string;
}

export interface MissionDagSnapshot {
  version: 1;
  goal: string;
  runId: string;
  planningMode: MissionPlanningMode;
  nodes: MissionNode[];
  edges: MissionEdge[];
  /** Longest dependency chain — drives minimum mission duration. */
  criticalPath: string[];
  activeNodeIds: string[];
  blockedNodeIds: string[];
  completedNodeIds: string[];
  progress: {
    total: number;
    done: number;
    blocked: number;
    pending: number;
    inProgress: number;
  };
  createdAt: number;
  updatedAt: number;
  dagNotes?: string;
}

/** Heuristic: goals with multiple deliverables benefit from explicit DAG planning. */
export function isComplexGoalForDag(goal: string): boolean {
  const g = goal.toLowerCase();
  const featureCount = (g.match(/\b(and|with|plus|including|endpoint|service|middleware|validation|tests?)\b/g) ?? []).length;
  const commaParts = goal.split(',').filter((p) => p.trim().length > 8).length;
  const listLike = /\b(login|auth|jwt|rate limit|validation|endpoint|middleware|migration|test)\b/gi;
  const keywordHits = (goal.match(listLike) ?? []).length;
  return featureCount >= 4 || commaParts >= 2 || keywordHits >= 3 || goal.length > 120;
}

/**
 * Resolve whether the Lead PM should receive DAG planning instructions.
 * ROLAND_MISSION_DAG=1 forces on; =0 forces off; unset auto-detects.
 */
export function isDagPlanningEnabled(goal: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.ROLAND_MISSION_DAG?.trim();
  if (flag === '1' || flag?.toLowerCase() === 'true') return true;
  if (flag === '0' || flag?.toLowerCase() === 'false') return false;
  return isComplexGoalForDag(goal);
}

export function buildEdgesFromTasks(tasks: Array<{ id: string; dependsOn: string[] }>): MissionEdge[] {
  const edges: MissionEdge[] = [];
  const ids = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (ids.has(dep)) edges.push({ from: dep, to: task.id });
    }
  }
  return edges;
}

/** Return node ids participating in a cycle, or [] if acyclic. */
export function detectCycle(nodeIds: string[], edges: MissionEdge[]): string[] {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const { from, to } of edges) {
    adj.get(from)?.push(to);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycleNodes = new Set<string>();

  function dfs(id: string): boolean {
    if (stack.has(id)) {
      cycleNodes.add(id);
      return true;
    }
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    for (const next of adj.get(id) ?? []) {
      if (dfs(next)) cycleNodes.add(id);
    }
    stack.delete(id);
    return cycleNodes.has(id);
  }

  for (const id of nodeIds) dfs(id);
  return [...cycleNodes];
}

/**
 * Longest path in a DAG (by hop count). Used as critical-path approximation
 * when per-node duration estimates are unavailable.
 */
export function computeCriticalPath(nodeIds: string[], edges: MissionEdge[]): string[] {
  if (nodeIds.length === 0) return [];

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const { from, to } of edges) {
    adj.get(from)?.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const id of nodeIds) {
    dist.set(id, 0);
    prev.set(id, null);
  }

  const queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const candidate = (dist.get(id) ?? 0) + 1;
      if (candidate > (dist.get(next) ?? 0)) {
        dist.set(next, candidate);
        prev.set(next, id);
      }
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== nodeIds.length) return nodeIds.slice(0, Math.min(3, nodeIds.length));

  let end = nodeIds[0];
  let best = 0;
  for (const id of nodeIds) {
    const d = dist.get(id) ?? 0;
    if (d >= best) {
      best = d;
      end = id;
    }
  }

  const path: string[] = [];
  let cur: string | null = end;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

export function tasksToNodes(tasks: ReviewTask[], planningMode: MissionPlanningMode): MissionNode[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    agent: t.agent,
    description: t.description,
    dependsOn: [...t.dependsOn],
    priority: t.priority,
    status: 'pending' as MissionNodeStatus,
  }));
}

export function getReadyNodeIds(nodes: MissionNode[], completedIds: Set<string>): string[] {
  return nodes
    .filter(
      (n) =>
        n.status !== 'done' &&
        n.status !== 'skipped' &&
        n.status !== 'in_progress' &&
        n.dependsOn.every((d) => completedIds.has(d)),
    )
    .map((n) => n.id);
}

export function summarizeProgress(nodes: MissionNode[]): MissionDagSnapshot['progress'] {
  return {
    total: nodes.length,
    done: nodes.filter((n) => n.status === 'done').length,
    blocked: nodes.filter((n) => n.status === 'blocked').length,
    pending: nodes.filter((n) => n.status === 'pending' || n.status === 'ready').length,
    inProgress: nodes.filter((n) => n.status === 'in_progress').length,
  };
}

export function buildMissionDagSnapshot(params: {
  goal: string;
  runId: string;
  planningMode: MissionPlanningMode;
  nodes: MissionNode[];
  dagNotes?: string;
  createdAt?: number;
}): MissionDagSnapshot {
  const nodeIds = params.nodes.map((n) => n.id);
  const edges = buildEdgesFromTasks(params.nodes);
  const cycle = detectCycle(nodeIds, edges);
  const criticalPath = cycle.length > 0 ? nodeIds : computeCriticalPath(nodeIds, edges);
  const completedIds = new Set(params.nodes.filter((n) => n.status === 'done').map((n) => n.id));

  return {
    version: 1,
    goal: params.goal,
    runId: params.runId,
    planningMode: params.planningMode,
    nodes: params.nodes,
    edges,
    criticalPath,
    activeNodeIds: params.nodes.filter((n) => n.status === 'in_progress').map((n) => n.id),
    blockedNodeIds: params.nodes.filter((n) => n.status === 'blocked').map((n) => n.id),
    completedNodeIds: [...completedIds],
    progress: summarizeProgress(params.nodes),
    createdAt: params.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    dagNotes: params.dagNotes,
  };
}

/** Compact markdown block for Command Blackboard and worker prompts. */
export function formatMissionGraphSummary(snapshot: MissionDagSnapshot): string {
  const { progress, criticalPath, activeNodeIds, blockedNodeIds, planningMode } = snapshot;
  const lines = [
    `[${planningMode.toUpperCase()}] ${progress.done}/${progress.total} complete` +
      (progress.blocked ? ` · ${progress.blocked} blocked` : '') +
      (progress.inProgress ? ` · ${progress.inProgress} active` : ''),
  ];

  if (criticalPath.length > 0) {
    lines.push(`Critical path: ${criticalPath.join(' → ')}`);
  }
  if (activeNodeIds.length > 0) {
    const labels = activeNodeIds.map((id) => {
      const n = snapshot.nodes.find((x) => x.id === id);
      return n ? `${id} (${n.agent})` : id;
    });
    lines.push(`Active: ${labels.join(', ')}`);
  }
  if (blockedNodeIds.length > 0) {
    lines.push(`Blocked: ${blockedNodeIds.join(', ')}`);
  }

  const ready = getReadyNodeIds(
    snapshot.nodes,
    new Set(snapshot.completedNodeIds),
  );
  if (ready.length > 0 && progress.inProgress === 0) {
    lines.push(`Ready next: ${ready.join(', ')}`);
  }

  return lines.join('\n');
}

/** Per-task DAG context for Sparrow / Vanguard worker prompts. */
export function formatNodeDagContext(snapshot: MissionDagSnapshot, taskId: string): string {
  const node = snapshot.nodes.find((n) => n.id === taskId);
  if (!node) return '';

  const parts: string[] = [
    `**Your node:** \`${taskId}\` — ${node.title}`,
    `**Planning mode:** ${snapshot.planningMode}`,
  ];

  if (node.dependsOn.length > 0) {
    parts.push(`**Upstream (must be complete):** ${node.dependsOn.join(', ')}`);
  }

  const downstream = snapshot.edges.filter((e) => e.from === taskId).map((e) => e.to);
  if (downstream.length > 0) {
    parts.push(`**Downstream (waiting on you):** ${downstream.join(', ')}`);
  }

  if (snapshot.criticalPath.includes(taskId)) {
    parts.push(`**Critical path:** this task is on the minimum-duration chain (${snapshot.criticalPath.join(' → ')}). Delays here block mission completion.`);
  }

  const ready = getReadyNodeIds(snapshot.nodes, new Set(snapshot.completedNodeIds));
  const parallelPeers = ready.filter((id) => id !== taskId);
  if (parallelPeers.length > 0) {
    parts.push(`**Parallel lane:** ${parallelPeers.join(', ')} can run concurrently with you this wave.`);
  }

  return parts.join('\n');
}

export class MissionDagStore {
  private readonly filePath: string;
  private snapshot: MissionDagSnapshot;

  constructor(stateDir: string, initial?: MissionDagSnapshot) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, MISSION_DAG_FILE);
    if (initial) {
      this.snapshot = initial;
    } else if (fs.existsSync(this.filePath)) {
      this.snapshot = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as MissionDagSnapshot;
    } else {
      this.snapshot = buildMissionDagSnapshot({
        goal: '',
        runId: '',
        planningMode: 'flat',
        nodes: [],
      });
    }
  }

  static fromPlan(params: {
    stateDir: string;
    goal: string;
    runId: string;
    tasks: ReviewTask[];
    planningMode: MissionPlanningMode;
    dagNotes?: string;
  }): MissionDagStore {
    const nodes = tasksToNodes(params.tasks, params.planningMode);
    const snapshot = buildMissionDagSnapshot({
      goal: params.goal,
      runId: params.runId,
      planningMode: params.planningMode,
      nodes,
      dagNotes: params.dagNotes,
    });
    const store = new MissionDagStore(params.stateDir, snapshot);
    store.save();
    return store;
  }

  getSnapshot(): MissionDagSnapshot {
    return this.snapshot;
  }

  save(): void {
    this.snapshot.updatedAt = Date.now();
    fs.writeFileSync(this.filePath, JSON.stringify(this.snapshot, null, 2), 'utf-8');
  }

  exportJson(): string {
    return JSON.stringify(this.snapshot, null, 2);
  }

  addNodes(tasks: ReviewTask[]): void {
    const existing = new Set(this.snapshot.nodes.map((n) => n.id));
    for (const task of tasks) {
      if (existing.has(task.id)) continue;
      this.snapshot.nodes.push({
        id: task.id,
        title: task.title,
        agent: task.agent,
        description: task.description,
        dependsOn: [...task.dependsOn],
        priority: task.priority,
        status: 'pending',
      });
    }
    this.rebuildGraphMeta();
    this.save();
  }

  markInProgress(taskId: string, wave: number): void {
    this.updateNode(taskId, { status: 'in_progress', wave, startedAt: Date.now() });
  }

  markDone(taskId: string, hadBlocker = false): void {
    this.updateNode(taskId, {
      status: hadBlocker ? 'blocked' : 'done',
      completedAt: Date.now(),
      hadBlocker,
    });
  }

  markBlocked(taskId: string): void {
    this.updateNode(taskId, { status: 'blocked', hadBlocker: true });
  }

  refreshReadyStates(completedIds: Set<string>): void {
    for (const node of this.snapshot.nodes) {
      if (node.status === 'done' || node.status === 'blocked' || node.status === 'in_progress') continue;
      const depsMet = node.dependsOn.every((d) => completedIds.has(d));
      node.status = depsMet ? 'ready' : 'pending';
    }
    this.rebuildGraphMeta();
    this.save();
  }

  private updateNode(taskId: string, patch: Partial<MissionNode>): void {
    const node = this.snapshot.nodes.find((n) => n.id === taskId);
    if (!node) return;
    Object.assign(node, patch);
    this.rebuildGraphMeta();
    this.save();
  }

  private rebuildGraphMeta(): void {
    const nodeIds = this.snapshot.nodes.map((n) => n.id);
    this.snapshot.edges = buildEdgesFromTasks(this.snapshot.nodes);
    this.snapshot.criticalPath = computeCriticalPath(nodeIds, this.snapshot.edges);
    this.snapshot.completedNodeIds = this.snapshot.nodes
      .filter((n) => n.status === 'done')
      .map((n) => n.id);
    this.snapshot.activeNodeIds = this.snapshot.nodes
      .filter((n) => n.status === 'in_progress')
      .map((n) => n.id);
    this.snapshot.blockedNodeIds = this.snapshot.nodes
      .filter((n) => n.status === 'blocked')
      .map((n) => n.id);
    this.snapshot.progress = summarizeProgress(this.snapshot.nodes);
    this.snapshot.updatedAt = Date.now();
  }
}
