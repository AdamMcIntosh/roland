import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  MissionDagStore,
  buildEdgesFromTasks,
  computeCriticalPath,
  detectCycle,
  formatMissionGraphSummary,
  formatNodeDagContext,
  getReadyNodeIds,
  isComplexGoalForDag,
  isDagPlanningEnabled,
  buildMissionDagSnapshot,
  tasksToNodes,
} from '../../src/rco/mission-dag.js';
import type { ReviewTask } from '../../src/rco/pm-prompts.js';

const sampleTasks: ReviewTask[] = [
  {
    id: 'task-1',
    title: 'Login endpoint',
    agent: 'executor',
    description: 'Implement login',
    dependsOn: [],
    priority: 'high',
  },
  {
    id: 'task-2',
    title: 'JWT issuance',
    agent: 'executor',
    description: 'Add JWT',
    dependsOn: ['task-1'],
    priority: 'high',
  },
  {
    id: 'task-3',
    title: 'Auth tests',
    agent: 'test-author',
    description: 'Write tests',
    dependsOn: ['task-2'],
    priority: 'medium',
  },
];

describe('mission-dag', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-dag-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buildEdgesFromTasks derives edges from dependsOn', () => {
    const edges = buildEdgesFromTasks(sampleTasks);
    expect(edges).toEqual([
      { from: 'task-1', to: 'task-2' },
      { from: 'task-2', to: 'task-3' },
    ]);
  });

  it('computeCriticalPath finds longest chain', () => {
    const edges = buildEdgesFromTasks(sampleTasks);
    expect(computeCriticalPath(sampleTasks.map((t) => t.id), edges)).toEqual([
      'task-1',
      'task-2',
      'task-3',
    ]);
  });

  it('detectCycle flags cyclic graphs', () => {
    const cyclic = [
      { id: 'a', dependsOn: ['c'] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ];
    const edges = buildEdgesFromTasks(cyclic);
    expect(detectCycle(['a', 'b', 'c'], edges).length).toBeGreaterThan(0);
  });

  it('isComplexGoalForDag detects multi-feature auth goals', () => {
    const goal =
      'Implement full user authentication with login endpoint, validation, JWT issuance, rate limiting, and tests';
    expect(isComplexGoalForDag(goal)).toBe(true);
    expect(isComplexGoalForDag('Add a comment to README')).toBe(false);
  });

  it('isDagPlanningEnabled respects ROLAND_MISSION_DAG env', () => {
    const simple = 'Fix typo';
    expect(isDagPlanningEnabled(simple, { ROLAND_MISSION_DAG: '0' })).toBe(false);
    expect(isDagPlanningEnabled(simple, { ROLAND_MISSION_DAG: '1' })).toBe(true);
  });

  it('getReadyNodeIds returns nodes with satisfied dependencies', () => {
    const nodes = tasksToNodes(sampleTasks, 'dag');
    nodes[0].status = 'done';
    const ready = getReadyNodeIds(nodes, new Set(['task-1']));
    expect(ready).toEqual(['task-2']);
  });

  it('MissionDagStore persists and updates node status', () => {
    const store = MissionDagStore.fromPlan({
      stateDir: tmpDir,
      goal: 'Auth feature',
      runId: 'run-1',
      tasks: sampleTasks,
      planningMode: 'dag',
      dagNotes: 'Critical path: task-1 → task-2 → task-3',
    });

    const file = path.join(tmpDir, 'mission-dag.json');
    expect(fs.existsSync(file)).toBe(true);

    store.markInProgress('task-1', 1);
    store.markDone('task-1');
    store.refreshReadyStates(new Set(['task-1']));

    const snap = store.getSnapshot();
    expect(snap.completedNodeIds).toContain('task-1');
    expect(snap.nodes.find((n) => n.id === 'task-2')?.status).toBe('ready');
    expect(snap.criticalPath).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('formatMissionGraphSummary includes progress and critical path', () => {
    const snap = buildMissionDagSnapshot({
      goal: 'Auth',
      runId: 'r1',
      planningMode: 'dag',
      nodes: tasksToNodes(sampleTasks, 'dag'),
      dagNotes: 'test',
    });
    const summary = formatMissionGraphSummary(snap);
    expect(summary).toContain('Critical path');
    expect(summary).toContain('task-1 → task-2 → task-3');
  });

  it('formatNodeDagContext describes upstream and downstream', () => {
    const snap = buildMissionDagSnapshot({
      goal: 'Auth',
      runId: 'r1',
      planningMode: 'dag',
      nodes: tasksToNodes(sampleTasks, 'dag'),
    });
    snap.completedNodeIds = ['task-1'];
    snap.nodes[0].status = 'done';
    snap.nodes[1].status = 'ready';

    const ctx = formatNodeDagContext(snap, 'task-2');
    expect(ctx).toContain('task-2');
    expect(ctx).toContain('task-1');
    expect(ctx).toContain('task-3');
    expect(ctx).toContain('Critical path');
  });
});
