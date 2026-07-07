/**
 * Shared types for team orchestration (ClosedLoop missions).
 */

import type { ReviewTask } from './pm-prompts.js';
import type { MissionPlanningMode } from './mission-dag.js';
import type { LoopHooks } from '../loop-engine/index.js';
import type { HitlQueue } from './hitl.js';
import type { TaskGitInfo } from './task-git-workflow.js';
import type { MissionBudgetGuard } from './mission-budget.js';

export interface TeamTask extends ReviewTask {}

export interface TeamPlan {
  tasks: TeamTask[];
  pmNotes?: string;
  planningMode?: MissionPlanningMode;
  dagNotes?: string;
}

export interface TeamTaskResult {
  taskTitle: string;
  agent: string;
  output: string;
  hadBlocker: boolean;
}

export interface TeamResult {
  goal: string;
  plan: TeamPlan;
  taskResults: Record<string, TeamTaskResult>;
  synthesis: string;
  wavesRun: number;
  blockersEncountered: number;
}

/** Payload delivered to the `onCircuitBreak` callback when the wave circuit breaker opens. */
export interface CircuitBreakInfo {
  waveNumber: number;
  errorCount: number;
  failedAgents: string[];
  savedTasks: Array<{ id: string; agent: string; title: string }>;
  blockedTasks: Array<{ id: string; agent: string; title: string }>;
}

export interface TeamOrchestratorOptions {
  goal: string;
  stateDir?: string;
  agentsDir?: string;
  onPlanReady?: (tasks: TeamTask[]) => void;
  onWaveStart?: (waveNumber: number, tasks: TeamTask[]) => void;
  onTaskStart?: (taskId: string, agent: string, title: string, git?: TaskGitInfo) => void;
  onTaskComplete?: (taskId: string, agent: string, output: string, hadBlocker: boolean, git?: TaskGitInfo) => void;
  onWaveComplete?: (waveNumber: number, decision: import('./pm-prompts.js').ReviewDecision) => void;
  onWaveReview?: (waveNumber: number) => void;
  onTasksSpawned?: (tasks: TeamTask[]) => void;
  onSynthesizing?: () => void;
  onBlockerDetected?: (taskId: string, agent: string, description: string, waveNumber: number) => void;
  hitlQueue?: HitlQueue;
  onHitlPause?: (paused: boolean) => void;
  onAbortPending?: () => void;
  noImprove?: boolean;
  interactive?: boolean;
  onCircuitBreak?: (info: CircuitBreakInfo) => void;
  rl?: import('readline').Interface;
  sequential?: boolean;
  quiet?: boolean;
  loopTemplate?: string;
  onLoopStateChange?: LoopHooks['onStateChange'];
  loopRunner?: import('../loop-engine/verification/index.js').CommandRunner;
  loopEmbedded?: boolean;
  loopIteration?: number;
  enablePmIntegration?: boolean;
  /** CLI `--budget` override (USD). */
  missionBudgetUsd?: number;
  /** Runtime budget guard (created by loop-orchestrator when ceiling is configured). */
  budgetGuard?: MissionBudgetGuard;
  runId?: string;
}
