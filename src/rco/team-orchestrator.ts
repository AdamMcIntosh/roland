/**
 * RCO Team Orchestrator — PM-style parallel agent execution with review loop.
 *
 * Execution flow:
 *
 *   Phase 1 — Lead PM planning
 *     The Lead PM (Grok 4.3) reads the goal + Blackboard + roster and
 *     returns a structured task plan.
 *
 *   Phase 2 — Iterated wave execution (the PM control loop)
 *     Each wave runs all ready tasks in parallel. After every wave:
 *       - Worker signals are parsed (blockers posted to Blackboard, messages to Bus)
 *       - PM reviews results; blockers are surfaced prominently
 *       - PM decides: continue | adjust (spawn / unblock / re-scope)
 *     Loop continues until no tasks remain.
 *
 *   Phase 3 — Lead PM synthesis
 *     The PM reviews all results and produces the final deliverable.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  cleanupSdkSession,
  configureSdkProcessLimits,
  createShellExecStderrFilter,
  resolveSdkAgentLocalOptions,
  resolveSdkSettleMs,
  waitForSdkRun,
} from '../utils/sdk-lifecycle.js';

// Team CLI and supervisor import this module directly (not via index.ts).
configureSdkProcessLimits();
import { Blackboard } from './blackboard.js';
import { CommandBlackboard } from './command-blackboard.js';
import type { Callsign } from './command-blackboard.js';
import { MessageBus } from './message-bus.js';
import {
  buildLeadPMPlanningPrompt,
  buildLeadPMReviewPrompt,
  buildLeadPMSynthesisPrompt,
  buildFallbackSynthesisPrompt,
  isReviewDecision,
} from './pm-prompts.js';
import type { ReviewDecision, ReviewTask, WaveResult } from './pm-prompts.js';
import { buildClaudeToolCallingPrompt } from './prompts.js';
import { loadAllAgents, resolveAgentsDir } from './loadConfig.js';
import { toCursorModelId } from './model-routing.js';
import { parseWorkerSignals } from './worker-signals.js';
import type { AgentYaml } from './types.js';
import {
  AGENT_TIMEOUT_MS, AGENT_MAX_RETRIES,
  NETWORK_RETRY_DELAYS, GENERIC_RETRY_DELAYS, NETWORK_ERROR_PATTERNS,
  MAX_CONCURRENT_AGENTS, CIRCUIT_BREAKER_THRESHOLD, AGENT_WARMUP_DELAY_MS,
  BLACKBOARD_RESULT_MAX_CHARS,
} from './constants.js';
import { ProjectMemory } from './project-memory.js';
import {
  buildRetrospectivePrompt,
  parseRetrospectiveOutput,
  showMemoryProposal,
  applyRetroUpdate,
  parsePlanCitations,
  parseSelfCritique,
  collectHumanFeedback,
  type HumanFeedback,
} from './self-improvement.js';
import { loadProjectKnowledge, appendDecisions } from './project-knowledge.js';
import { buildTaskUsage, buildRunUsage, saveRunUsage } from './usage-tracker.js';
import type { TaskUsageRecord } from './usage-tracker.js';
import { HitlQueue } from './hitl.js';
import {
  loadUnscAgents,
  toSdkAgentDefinitions,
  legacyAgentToCallsign,
  type SdkAgentDefinition,
} from './unsc-agents.js';
import { finalizeSynthesisOutput } from './mission-complete.js';

/** Operator escalation threshold — cumulative blockers before surfacing to human command. */
const OPERATOR_ESCALATION_THRESHOLD = 3;

/** Max PM review parse failures before forcing an adjust decision with synthetic recovery. */
const PM_REVIEW_PARSE_FAILURE_THRESHOLD = 2;

/** Map legacy roster agent names to UNSC callsigns for Command Blackboard updates. */
function agentToCallsign(agentName: string): Callsign {
  const mapped = legacyAgentToCallsign(agentName);
  const callsigns: Callsign[] = ['Roland', 'Sparrow', 'Vanguard', 'Oracle', 'Sentinel', 'Forge', 'Specter'];
  const match = callsigns.find((c) => c.toLowerCase() === mapped);
  return match ?? 'Sparrow';
}

/**
 * Tracks blocker frequency and PM review failures for operator escalation.
 */
class EscalationTracker {
  private _blockerCount = 0;
  private _agentBlockers = new Map<string, number>();
  private _reviewParseFailures = 0;
  private _escalationNotes: string[] = [];

  recordBlocker(agent: string, description: string): void {
    this._blockerCount++;
    const count = (this._agentBlockers.get(agent) ?? 0) + 1;
    this._agentBlockers.set(agent, count);

    if (count >= 2) {
      this._escalationNotes.push(
        `Repeated blocker from ${agent} (${count}× this run): ${description.slice(0, 120)}`,
      );
    }
    if (this._blockerCount >= OPERATOR_ESCALATION_THRESHOLD) {
      this._escalationNotes.push(
        `Cumulative blocker threshold reached (${this._blockerCount}). Operator review recommended — scope or environment may need adjustment.`,
      );
    }
  }

  recordReviewParseFailure(waveNumber: number): boolean {
    this._reviewParseFailures++;
    if (this._reviewParseFailures >= PM_REVIEW_PARSE_FAILURE_THRESHOLD) {
      this._escalationNotes.push(
        `PM review JSON unparseable ${this._reviewParseFailures}× (wave ${waveNumber}). Forcing adjust recovery.`,
      );
      return true;
    }
    return false;
  }

  get escalationNotes(): readonly string[] {
    return [...new Set(this._escalationNotes)];
  }

  shouldEscalateToOperator(): boolean {
    return this._blockerCount >= OPERATOR_ESCALATION_THRESHOLD;
  }
}

interface AgentCallOptions {
  sdkAgents?: Record<string, SdkAgentDefinition>;
  /** When true, Agent.create uses name "Roland" and registers UNSC sub-agents. */
  isSupervisor?: boolean;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamTask extends ReviewTask {}

export interface TeamPlan {
  tasks: TeamTask[];
  pmNotes?: string;
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
  waveNumber:   number;
  errorCount:   number;
  failedAgents: string[];
  savedTasks:   Array<{ id: string; agent: string; title: string }>;
  blockedTasks: Array<{ id: string; agent: string; title: string }>;
}

export interface TeamOrchestratorOptions {
  goal: string;
  stateDir?: string;
  agentsDir?: string;
  /** Fired once after the Lead PM produces the initial task plan. */
  onPlanReady?: (tasks: TeamTask[]) => void;
  /** Fired before each wave's parallel tasks begin executing. */
  onWaveStart?: (waveNumber: number, tasks: TeamTask[]) => void;
  /** Fired just before a single task's agent call is dispatched. */
  onTaskStart?: (taskId: string, agent: string, title: string) => void;
  onTaskComplete?: (taskId: string, agent: string, output: string, hadBlocker: boolean) => void;
  onWaveComplete?: (waveNumber: number, decision: ReviewDecision) => void;
  /** Fired just before the PM agent reviews a completed wave. */
  onWaveReview?: (waveNumber: number) => void;
  /** Fired when the PM spawns additional tasks during an adjust decision. */
  onTasksSpawned?: (tasks: TeamTask[]) => void;
  /** Fired just before the Lead PM begins the final synthesis. */
  onSynthesizing?: () => void;
  /**
   * Fired when an agent signals a BLOCKER.
   * Receives: taskId, agent name, blocker description, current wave number.
   * Use this to fire contextual notifications from the calling code.
   */
  onBlockerDetected?: (taskId: string, agent: string, description: string, waveNumber: number) => void;
  /**
   * HITL command queue. When provided, the orchestrator polls it at the start
   * of each wave and acts on pause / resume / unblock / inject / replan / abort.
   */
  hitlQueue?: HitlQueue;
  /** Fired when the run is paused (paused=true) or resumed (paused=false). */
  onHitlPause?: (paused: boolean) => void;
  /** Fired when an abort command is queued — run will stop after current wave. */
  onAbortPending?: () => void;
  /**
   * Skip the self-improvement retrospective phase entirely.
   * Pass true for CI runs, benchmarks, or short one-off tasks.
   * Default: false.
   */
  noImprove?: boolean;
  /**
   * When true, the retrospective shows an interactive approval prompt (TTY only).
   * When false, new memory bullets are auto-accepted without user interaction.
   * Default: false (auto-accept).
   */
  interactive?: boolean;
  /**
   * Fired when the wave circuit breaker opens — a terminal network error has
   * exhausted all retries for at least one agent. Carries partial progress so
   * callers can render a rich UI (saved tasks, blocked tasks, resume command).
   * The run is paused via HITL immediately after this callback returns.
   */
  onCircuitBreak?: (info: CircuitBreakInfo) => void;
  /**
   * Existing readline interface to reuse for interactive prompts (rating, memory
   * approval). When provided, no competing readline is created on stdin — required
   * when called from the chat REPL to prevent closing stdin and killing the loop.
   */
  rl?: import('readline').Interface;
  /**
   * When true (default), tasks are executed one at a time with a PM review
   * after each individual task. This gives maximum PM control and uses only
   * one Cursor API connection at a time — recommended for long, complex goals
   * and unstable connections.
   *
   * When false (parallel mode), all dependency-free tasks in a wave run
   * concurrently up to MAX_CONCURRENT_AGENTS. Enable with --parallel or
   * ROLAND_PARALLEL=1.
   */
  sequential?: boolean;
  /** When true, suppress SDK shell-exec close-timeout noise on stderr. */
  quiet?: boolean;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function extractJsonBlock(text: string): unknown | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    console.error('[Team] Failed to parse PM JSON block:', (err as Error).message);
    console.error('[Team] Raw block (first 500 chars):', match[1].slice(0, 500));
    return null;
  }
}

function isTeamPlan(v: unknown): v is TeamPlan {
  return typeof v === 'object' && v !== null && 'tasks' in v && Array.isArray((v as TeamPlan).tasks);
}

function fallbackPlan(goal: string): TeamPlan {
  return {
    tasks: [{ id: 'task-1', title: goal.slice(0, 80), agent: 'executor', description: goal, dependsOn: [], priority: 'high' }],
    pmNotes: 'Fallback single-task plan — Lead PM did not return parseable JSON.',
  };
}

/** Auto-generated synthesis when the Lead PM fails to produce one after retries. */
function buildMinimalSynthesis(goal: string, taskResults: Record<string, TeamTaskResult>): string {
  const lines = [
    '# Roland — Minimal Synthesis (auto-generated fallback)',
    '',
    `**Goal:** ${goal}`,
    '',
    '> **Note:** Lead PM synthesis could not be generated after retries. This is an auto-generated summary from task outputs. Run is still alive — use `roland status` to monitor, or `roland team "..."` with a narrower goal to continue.',
    '',
    '## Tasks Completed',
    '',
  ];
  for (const [id, r] of Object.entries(taskResults)) {
    lines.push(`- **${id}** [${r.agent}] ${r.hadBlocker ? '⚠️ blocker' : '✓'}: "${r.taskTitle}"`);
  }
  lines.push('');
  lines.push('## Output Excerpts');
  lines.push('');
  for (const [id, r] of Object.entries(taskResults)) {
    const excerpt = r.output.slice(0, 600).replace(/\n{3,}/g, '\n\n');
    lines.push(`### ${id}: ${r.taskTitle}`);
    lines.push(excerpt);
    if (r.output.length > 600) lines.push('\n…(truncated)');
    lines.push('');
  }
  lines.push('## Next Steps');
  lines.push('');
  lines.push('1. Review the output excerpts above for files created or modified.');
  lines.push('2. Run `npm run test:run` (or project-specific test command) to check test status.');
  lines.push('3. Use `roland team "..."` with a more focused goal to continue.');
  lines.push('');
  lines.push('_Full synthesis unavailable — rerun with a narrower goal if this recurs._');
  return lines.join('\n');
}

// ── Concurrency limiter ───────────────────────────────────────────────────────

/**
 * Run an array of task factories with at most `limit` running concurrently.
 *
 * Works like Promise.all() but queues excess tasks behind a semaphore.
 * Result order matches input order. Any rejection propagates immediately
 * (same behaviour as Promise.all).
 *
 * This throttles large parallel waves so we never open more than
 * MAX_CONCURRENT_AGENTS sockets to the Cursor API at once, which is the
 * primary cause of ECONNRESET spikes during wide waves.
 *
 * Connection warmup: each worker slot is started AGENT_WARMUP_DELAY_MS apart
 * (default 1500 ms) to stagger TCP connection establishment and reduce
 * simultaneous socket pressure on the Cursor API. Set ROLAND_WARMUP_DELAY_MS=0
 * to disable.
 */
async function runConcurrent<T>(
  factories: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(factories.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < factories.length) {
      const idx = nextIdx++;
      results[idx] = await factories[idx]();
    }
  }

  const slots = Math.min(limit, factories.length);

  // Stagger slot starts to avoid opening all connections simultaneously.
  const workerPromises: Promise<void>[] = [];
  for (let i = 0; i < slots; i++) {
    if (i > 0 && AGENT_WARMUP_DELAY_MS > 0) {
      await new Promise<void>((r) => setTimeout(r, AGENT_WARMUP_DELAY_MS));
    }
    workerPromises.push(worker());
  }
  await Promise.all(workerPromises);
  return results;
}

// ── Jitter helper ─────────────────────────────────────────────────────────────

/**
 * Apply ±factor random jitter to a delay to de-synchronise concurrent retries
 * and prevent all failing agents from hammering the API at the same instant
 * (thundering-herd suppression).
 *
 * Example: withJitter(10_000, 0.3) → uniform random in [7_000, 13_000].
 * Floor at 100 ms prevents accidental near-zero delays.
 */
function withJitter(delayMs: number, factor = 0.3): number {
  const delta = Math.round(delayMs * factor * (Math.random() * 2 - 1));
  return Math.max(100, delayMs + delta);
}

// ── Wave circuit breaker ──────────────────────────────────────────────────────

/**
 * Per-wave circuit breaker.
 *
 * Tracks terminal network errors produced by agents in the current wave.
 * When the count reaches CIRCUIT_BREAKER_THRESHOLD the breaker opens and
 * subsequent tasks fast-fail immediately (synthetic BLOCKER, no retry loop)
 * rather than spending 5 × retry cycles waiting for a downed API.
 *
 * After the wave completes with an open breaker, the orchestrator pauses the
 * run via the HITL queue so the user can restore connectivity, then resume.
 *
 * Call reset() at the start of each new wave to clear state.
 */
class WaveCircuitBreaker {
  private _errorCount = 0;
  private _failedAgents: string[] = [];
  isOpen = false;

  recordNetworkError(agentName: string): void {
    this._errorCount++;
    this._failedAgents.push(agentName);
    if (!this.isOpen && this._errorCount >= CIRCUIT_BREAKER_THRESHOLD) {
      this.isOpen = true;
      console.error(
        `[Team]   ⚡ Circuit breaker opened — ${this._errorCount} network error${this._errorCount !== 1 ? 's' : ''} ` +
        `(threshold: ${CIRCUIT_BREAKER_THRESHOLD}). Queued tasks will fast-fail.`,
      );
    }
  }

  get errorCount(): number { return this._errorCount; }
  get failedAgents(): readonly string[] { return this._failedAgents; }

  reset(): void {
    this._errorCount = 0;
    this._failedAgents = [];
    this.isOpen = false;
  }
}

// ── Cursor SDK helper ─────────────────────────────────────────────────────────
// Timeout / retry constants live in constants.ts. On final failure, callCursorAgent
// returns a synthetic BLOCKER string so the PM can handle it in the next wave review
// instead of crashing the entire orchestration.

/**
 * Returns true when the error looks like a transient network / connection issue.
 * These get a faster retry schedule (NETWORK_RETRY_DELAYS) and a more
 * user-friendly message than generic SDK failures.
 */
function isNetworkError(err: Error): boolean {
  const msg = err.message;
  return NETWORK_ERROR_PATTERNS.some((p) =>
    msg.toLowerCase().includes(p.toLowerCase()),
  );
}

/** Single attempt: one SDK call with a hard timeout and a 60 s heartbeat. */
async function callCursorAgentOnce(
  agentName: string,
  modelId: string,
  prompt: string,
  callOptions?: AgentCallOptions,
): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error('CURSOR_API_KEY is not set');

  const { Agent } = await import('@cursor/sdk') as typeof import('@cursor/sdk');
  const sdkAgents = callOptions?.sdkAgents;
  const hasSubAgents = sdkAgents && Object.keys(sdkAgents).length > 0;

  type SdkAgent = Awaited<ReturnType<typeof Agent.create>>;
  type SdkRun = Awaited<ReturnType<SdkAgent['send']>>;

  let agent: SdkAgent | undefined;
  let run: SdkRun | undefined;

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      name: callOptions?.isSupervisor ? 'Roland' : agentName,
      local: resolveSdkAgentLocalOptions(agentName, {
        cwd: process.cwd(),
        settingSources: hasSubAgents ? (['project'] as const) : [],
      }) as import('@cursor/sdk').LocalAgentOptions,
      ...(hasSubAgents ? { agents: sdkAgents } : {}),
    });

    run = await agent.send(prompt);

    const result = await waitForSdkRun(run, {
      timeoutMs: AGENT_TIMEOUT_MS,
      agentName,
      heartbeatIntervalMs: 60_000,
      onHeartbeat: (elapsedMs) => {
        const m = (elapsedMs / 60_000).toFixed(1);
        console.error(`[Team]   ⏳ ${agentName} still running… (${m}m elapsed)`);
      },
    });

    if (result.status === 'error' || result.status === 'cancelled') {
      throw new Error(`Agent "${agentName}" ${result.status}: ${result.result ?? 'no detail'}`);
    }
    return result.result ?? '';
  } finally {
    const settleMs = resolveSdkSettleMs(agentName, prompt);
    const { forced } = await cleanupSdkSession(agent, run, { settleMs, agentName });
    if (forced) {
      console.error(`[Team]   🧹 ${agentName} — force cleanup applied after settle (${settleMs}ms)`);
    }
  }
}

/**
 * Resilient wrapper: retries transient failures with separate back-off tables
 * and ±30% jitter to de-synchronise concurrent retries.
 *
 * Network / connection errors (ECONNRESET, ConnectError, UND_ERR_SOCKET…) use
 * NETWORK_RETRY_DELAYS (2 s → 6 s → 12 s → 25 s → 40 s → 60 s → 90 s) + jitter.
 * All other errors use GENERIC_RETRY_DELAYS (5 s → 12 s → 25 s → 40 s → 60 s → 90 s → 120 s) + jitter.
 * Both tables have 7 entries → 7 total attempts when AGENT_MAX_RETRIES = 6.
 *
 * Circuit breaker: if the wave-level WaveCircuitBreaker is already open when
 * this is called, the call returns a synthetic fast-fail BLOCKER immediately
 * without attempting any SDK calls, cutting hang time during widespread outages.
 *
 * Each network-error retry attempt (not just final exhaustion) is recorded in the
 * circuit breaker. With CIRCUIT_BREAKER_THRESHOLD=3 and 4 concurrent agents all
 * hitting connection errors, the circuit opens after ~3 retry failures (within
 * seconds) rather than waiting for one agent to exhaust all 7 attempts (~4 min).
 *
 * On final failure returns a synthetic BLOCKER so the PM can handle it in the
 * next wave review without crashing the entire orchestration.
 */
async function callCursorAgent(
  agentName: string,
  modelId: string,
  prompt: string,
  circuitBreaker?: WaveCircuitBreaker,
  callOptions?: AgentCallOptions,
): Promise<string> {
  // Fast-fail if the circuit is already open — skip all retry attempts
  if (circuitBreaker?.isOpen) {
    console.error(`[Team]   ⚡ ${agentName} — circuit open, task fast-failed (API connectivity issue)`);
    return [
      '## 🚨 BLOCKER',
      `**Description:** Agent "${agentName}" skipped — circuit breaker active (repeated network errors this wave).`,
      'Partial progress from earlier tasks has been saved to the project blackboard.',
      'Use `roland resume` (CLI) or `/resume` (chat) to continue once connectivity is restored.',
      '**Needs from:** lead-pm',
      '**Impact:** Task skipped due to API connection failure wave. PM will retry after resume.',
    ].join('\n');
  }

  let lastErr: Error = new Error('unknown');
  const maxAttempts = AGENT_MAX_RETRIES + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callCursorAgentOnce(agentName, modelId, prompt, callOptions);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));

      const netError = isNetworkError(lastErr);

      // Record every network-error attempt (not just final exhaustion) so the
      // circuit breaker can open quickly during widespread outages, even before
      // any single agent has burned through all its retries.
      if (netError) {
        circuitBreaker?.recordNetworkError(agentName);
      }

      if (attempt >= maxAttempts) break;

      const delayTable = netError ? NETWORK_RETRY_DELAYS : GENERIC_RETRY_DELAYS;
      const baseDelay = delayTable[attempt - 1] ?? delayTable[delayTable.length - 1];
      const delay = withJitter(baseDelay);   // ±30% random jitter

      if (netError) {
        console.error(
          `[Team]   🌐 ${agentName} — connection error, retrying in ${(delay / 1000).toFixed(1)}s` +
          ` (attempt ${attempt}/${maxAttempts}) — run is still alive; use 'roland status' to monitor`,
        );
      } else {
        console.error(
          `[Team]   ⚠️  ${agentName} attempt ${attempt} failed: ${lastErr.message.slice(0, 100)}` +
          ` — retrying in ${(delay / 1000).toFixed(1)}s`,
        );
      }

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // All retries exhausted — surface as a blocker instead of crashing.
  const netError = isNetworkError(lastErr);
  const errSummary = lastErr.message.slice(0, 120);

  console.error(
    `[Team]   💀 ${agentName} failed after ${maxAttempts} attempts` +
    (netError ? ' (connection error)' : '') +
    `: ${errSummary}`,
  );

  // (Network errors already recorded to the circuit breaker inside the retry loop above.)

  const lines = [
    '## 🚨 BLOCKER',
    `**Description:** Agent "${agentName}" failed to respond after ${maxAttempts} attempts.`,
    netError
      ? `Connection error: ${errSummary}\nThis appears to be a transient Cursor API issue. Partial progress from completed tasks has been saved to the project blackboard.`
      : `Last error: ${errSummary}`,
    netError
      ? 'Use `roland resume` (CLI) or `/resume` (chat) to continue once connectivity is restored. The PM will re-scope or retry this task.'
      : '',
    '**Needs from:** lead-pm',
    '**Impact:** This task produced no output and must be retried or re-scoped by the PM.',
  ].filter(Boolean);

  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runTeam(opts: TeamOrchestratorOptions): Promise<TeamResult> {
  const {
    goal, stateDir = '.roland', agentsDir: agentsDirOverride,
    onPlanReady, onWaveStart, onTaskStart, onTaskComplete, onWaveComplete,
    onWaveReview, onTasksSpawned, onSynthesizing,
    onBlockerDetected, hitlQueue,
    onHitlPause, onAbortPending,
    noImprove = false, interactive = false, rl,
    onCircuitBreak,
    sequential = false,
    quiet = false,
  } = opts;

  const restoreStderr = quiet ? createShellExecStderrFilter() : undefined;
  try {
    return await runTeamInner({
      goal, stateDir, agentsDir: agentsDirOverride,
      onPlanReady, onWaveStart, onTaskStart, onTaskComplete, onWaveComplete,
      onWaveReview, onTasksSpawned, onSynthesizing,
      onBlockerDetected, hitlQueue,
      onHitlPause, onAbortPending,
      noImprove, interactive, rl,
      onCircuitBreak,
      sequential,
      quiet,
    });
  } finally {
    restoreStderr?.();
  }
}

async function runTeamInner(opts: TeamOrchestratorOptions): Promise<TeamResult> {
  const {
    goal, stateDir = '.roland', agentsDir: agentsDirOverride,
    onPlanReady, onWaveStart, onTaskStart, onTaskComplete, onWaveComplete,
    onWaveReview, onTasksSpawned, onSynthesizing,
    onBlockerDetected, hitlQueue,
    onHitlPause, onAbortPending,
    noImprove = false, interactive = false, rl,
    onCircuitBreak,
    sequential = false,
  } = opts;

  // ── Usage tracking ────────────────────────────────────────────────────────
  const runId    = Date.now().toString(36);
  const runStart = Date.now();
  const allTaskUsage: TaskUsageRecord[] = [];

  // ── Coordination layer ────────────────────────────────────────────────────
  console.error('[Team] Initializing coordination layer...');
  const blackboard = new Blackboard(stateDir);
  const commandBoard = new CommandBlackboard(stateDir);
  const bus = new MessageBus(stateDir);
  const memory = new ProjectMemory(stateDir);
  const memorySnapshot = memory.smartSnapshot(goal);
  if (memorySnapshot) console.error('[Team] Project memory loaded — smart recall injecting into planning prompt');

  // UNSC sub-agents for SDK delegation (Roland supervisor + worker callsigns)
  const unscAgentMap = loadUnscAgents();
  const sdkAgents = toSdkAgentDefinitions(unscAgentMap);
  if (Object.keys(sdkAgents).length > 0) {
    console.error(`[Team] UNSC sub-agents registered: ${Object.keys(sdkAgents).join(', ')}`);
  }

  // Seed Command Blackboard with mission objective
  commandBoard.appendBullet('Mission Objectives', `[P2 active] ${goal}`);
  commandBoard.setAgentStatus({ callsign: 'Roland', state: 'active', lastUpdated: Date.now(), note: 'Lead PM planning' });

  const getCommandBlackboardSnapshot = () => commandBoard.smartSnapshot(goal);

  const knowledge = loadProjectKnowledge(process.cwd());
  if (knowledge.files.length > 0) {
    console.error(`[Team] Project knowledge loaded — ${knowledge.summary}`);
  }

  blackboard.post({ type: 'task', title: 'TEAM GOAL', content: goal, status: 'in_progress', author: 'system', priority: 'critical', tags: ['goal'], relatedIds: [] });

  const agentsDir = resolveAgentsDir(import.meta.url, agentsDirOverride);
  const rosterMap = loadAllAgents(agentsDir, { excludeVariants: true });
  const roster: AgentYaml[] = Array.from(rosterMap.values());
  console.error(`[Team] Roster: ${roster.length} agents from ${agentsDir}`);

  // ── Model config banner ───────────────────────────────────────────────────
  console.error('[Team] ─────────────────────────────────────────────────────');
  console.error('[Team] Model config:');
  console.error('[Team]   Lead PM     → gpt-5.4-nano     (Roland supervisor + UNSC sub-agents)');
  console.error('[Team]   All engineers → composer-2.5 (reasoning, execution, tests, docs)');
  console.error('[Team] ─────────────────────────────────────────────────────');

  // ── Shared execution state ─────────────────────────────────────────────────
  const taskResults: Record<string, TeamTaskResult> = {};
  const completedIds = new Set<string>();
  let totalBlockers    = 0;
  let currentWaveNumber = 0; // tracks active wave for onBlockerDetected calls
  const waveCircuit    = new WaveCircuitBreaker(); // reused across waves; reset per-wave
  const escalation     = new EscalationTracker();
  const supervisorCallOpts: AgentCallOptions = { sdkAgents, isSupervisor: true };
  const workerCallOpts: AgentCallOptions = { sdkAgents };

  // ── HITL processor ────────────────────────────────────────────────────────
  // Called at the start of each wave. Returns true if the run should be aborted.
  async function processHitl(): Promise<boolean> {
    if (!hitlQueue) return false;

    // If paused, block here until resumed or timed out
    if (hitlQueue.isPaused()) {
      onHitlPause?.(true);
      const shouldAbort = await hitlQueue.waitForResume();
      onHitlPause?.(false);
      if (shouldAbort) return true;
    }

    const cmds = hitlQueue.drainAll();
    for (const cmd of cmds) {
      switch (cmd.cmd) {
        case 'pause':
          hitlQueue.setPaused(true);
          onHitlPause?.(true);
          if (await hitlQueue.waitForResume()) {
            onHitlPause?.(false);
            return true;
          }
          onHitlPause?.(false);
          break;
        case 'unblock': {
          const target = cmd.taskId ?? '';
          const msg    = cmd.message ?? 'Unblocked by human operator';
          if (target) {
            // Fix: look up agent name from task ID so the message is delivered
            // to the agent's inbox (workers read bus.inboxSummary(task.agent)).
            const allKnownTasks = [...plan.tasks, ...remaining];
            const taskDef     = allKnownTasks.find((t) => t.id === target);
            const agentTarget = taskDef?.agent ?? target;
            bus.send('human', agentTarget, 'Human Unblock', msg);
            console.error(`[HITL] ↑ Unblocked ${target} → ${agentTarget}: "${msg.slice(0, 80)}"`);
          }
          break;
        }
        case 'inject':
          if (cmd.text) {
            blackboard.post({
              type: 'decision', title: 'Human Directive',
              content: cmd.text, status: 'pending',
              author: 'human', priority: 'high',
              tags: ['hitl', 'human-directive'], relatedIds: [],
            });
            console.error(`[HITL] 💉 Injected: "${cmd.text.slice(0, 80)}"`);
          }
          break;
        case 'replan':
          blackboard.post({
            type: 'decision', title: 'Replan Requested',
            content: 'Human operator requested a replan. Re-evaluate all remaining tasks and adjust the plan as needed.',
            status: 'pending', author: 'human', priority: 'critical',
            tags: ['hitl', 'replan'], relatedIds: [],
          });
          console.error('[HITL] 🔄 Replan request posted — PM will see it on next wave review');
          break;
        case 'abort':
          console.error('[HITL] 🛑 Abort received — stopping after current wave');
          onAbortPending?.();
          return true;
        default:
          break;
      }
    }
    return false;
  }

  // ── executeTask closure ────────────────────────────────────────────────────
  async function executeTask(task: TeamTask): Promise<WaveResult> {
    const agentKey = task.agent.toLowerCase().replace(/\s+/g, '-');
    const agentYaml: AgentYaml = rosterMap.get(agentKey) ?? { name: task.agent };

    // Upstream context from completed dependencies
    const upstreamParts = task.dependsOn
      .map((d) => taskResults[d] ? `### From ${d} (${taskResults[d].agent})\n${taskResults[d].output}` : '')
      .filter(Boolean);
    const upstreamContext = upstreamParts.join('\n\n');

    // Messages from the PM or other agents
    const inbox = bus.inboxSummary(task.agent);

    const fullContext = [
      task.description,
      upstreamContext && `\n## Context from Upstream Tasks\n\n${upstreamContext}`,
      inbox && `\n## Your Inbox (from Lead PM or colleagues)\n\n${inbox}`,
    ].filter(Boolean).join('\n');

    // Build prompt with full team awareness
    const workerPrompt = buildClaudeToolCallingPrompt({
      agentYaml,
      taskContext: fullContext,
      stepInput: upstreamContext || undefined,
      teamGoal: goal,
      blackboardSnapshot: blackboard.snapshot(),
      commandBlackboardSnapshot: getCommandBlackboardSnapshot(),
      teamSize: roster.length,
    });

    const callsign = agentToCallsign(task.agent);
    const modelId = toCursorModelId(agentYaml.claude_model ?? '', task.agent);
    console.error(`[Team]   → ${task.agent} [${callsign}] (${modelId}): "${task.title}"`);

    commandBoard.setAgentStatus({
      callsign,
      state: 'active',
      currentTaskId: task.id,
      lastUpdated: Date.now(),
      note: task.title.slice(0, 60),
    });

    // Diagnostic: log the first 400 chars of the task description for test-author
    // so we can verify the ESM reminder is actually reaching the agent.
    if (agentKey === 'test-author') {
      const descPreview = task.description.slice(0, 400).replace(/\n/g, ' ↵ ');
      console.error(`[Team]   📋 [test-author] description[:400]: ${descPreview}`);
    }

    onTaskStart?.(task.id, task.agent, task.title);
    const taskCallStart = Date.now();
    const output = await callCursorAgent(callsign, modelId, workerPrompt, waveCircuit, workerCallOpts);
    allTaskUsage.push(buildTaskUsage(task.id, task.title, task.agent, modelId, workerPrompt.length, output.length, Date.now() - taskCallStart));

    // ── Parse worker signals ───────────────────────────────────────────────
    const signals = parseWorkerSignals(output);
    const hadBlocker = signals.blockers.length > 0;

    if (hadBlocker) {
      totalBlockers += signals.blockers.length;
      for (const blocker of signals.blockers) {
        console.error(`[Team]   🚨 BLOCKER from ${task.agent}: ${blocker.description.slice(0, 100)}`);
        escalation.recordBlocker(task.agent, blocker.description);
        commandBoard.appendBullet('Open Intel', `[BLOCKER] ${callsign} on "${task.title}": ${blocker.description.slice(0, 200)}`);
        commandBoard.setAgentStatus({
          callsign,
          state: 'blocked',
          currentTaskId: task.id,
          lastUpdated: Date.now(),
          note: blocker.description.slice(0, 80),
        });
        blackboard.post({
          type: 'blocker',
          title: `BLOCKER: ${task.agent} on "${task.title}"`,
          content: blocker.description,
          status: 'pending',
          author: task.agent,
          priority: 'critical',
          tags: ['blocker', task.id],
          relatedIds: [],
        });
        // Fire blocker notification callback (wired to Notifier in team-cli.ts)
        onBlockerDetected?.(task.id, task.agent, blocker.description, currentWaveNumber);
      }
    }

    for (const msg of signals.messages) {
      console.error(`[Team]   📨 ${task.agent} → ${msg.to}: "${msg.subject}"`);
      bus.send(task.agent, msg.to, msg.subject, msg.body);
    }

    // Record result
    taskResults[task.id] = { taskTitle: task.title, agent: task.agent, output, hadBlocker };
    completedIds.add(task.id);

    // Post result to Blackboard
    blackboard.post({
      type: 'result',
      title: `Result: ${task.title}`,
      content: output.length > BLACKBOARD_RESULT_MAX_CHARS
        ? output.slice(0, BLACKBOARD_RESULT_MAX_CHARS) + '\n…(truncated)'
        : output,
      status: 'done',
      author: task.agent,
      priority: 'medium',
      tags: ['result', task.id],
      relatedIds: [],
    });

    onTaskComplete?.(task.id, task.agent, output, hadBlocker);
    console.error(`[Team]   ✓ ${task.agent} done: "${task.title}"${hadBlocker ? ' 🚨 (blocker signalled)' : ''}`);

    if (!hadBlocker) {
      commandBoard.setAgentStatus({
        callsign,
        state: 'complete',
        currentTaskId: task.id,
        lastUpdated: Date.now(),
      });
      commandBoard.appendAgentLog(
        callsign,
        `${task.title}: ${output.slice(0, 200).replace(/\n/g, ' ')}`,
      );
      commandBoard.appendBullet('Active Tasks', `[done] ${task.id} — ${callsign}: ${task.title}`);
    }

    return { taskId: task.id, taskTitle: task.title, agent: task.agent, output, hasBlocker: hadBlocker };
  }

  // ── Phase 1: Lead PM planning ─────────────────────────────────────────────
  console.error('[Team] Phase 1: Lead PM planning...');

  const planningPrompt = buildLeadPMPlanningPrompt({
    goal,
    blackboardSnapshot: blackboard.snapshot(),
    roster,
    inboxMessages: bus.inboxSummary('Lead-PM') || undefined,
    projectMemory: memorySnapshot || undefined,
    projectKnowledge: knowledge.injectionBlock || undefined,
    commandBlackboard: getCommandBlackboardSnapshot(),
  });
  const pmPlanStart = Date.now();
  const planText = await callCursorAgent('Lead-PM', 'gpt-5.4-nano', planningPrompt, undefined, supervisorCallOpts);
  allTaskUsage.push(buildTaskUsage('pm-planning', 'Lead PM: Planning', 'Lead-PM', 'gpt-5.4-nano', planningPrompt.length, planText.length, Date.now() - pmPlanStart));

  const rawPlan = extractJsonBlock(planText);
  const plan: TeamPlan = isTeamPlan(rawPlan) ? rawPlan : fallbackPlan(goal);
  console.error(`[Team] Plan: ${plan.tasks.length} task(s)${plan.pmNotes ? ` — ${plan.pmNotes.slice(0, 80)}` : ''}`);

  for (const task of plan.tasks) {
    blackboard.post({ type: 'task', title: task.title, content: task.description, status: 'pending', author: 'Lead-PM', assignee: task.agent, priority: task.priority as 'critical' | 'high' | 'medium' | 'low', tags: ['dispatched', task.id], relatedIds: [] });
    const callsign = agentToCallsign(task.agent);
    commandBoard.appendBullet('Active Tasks', `[pending] ${task.id} — ${callsign}: ${task.title}`);
  }
  commandBoard.setAgentStatus({ callsign: 'Roland', state: 'active', lastUpdated: Date.now(), note: `Wave control — ${plan.tasks.length} task(s)` });
  onPlanReady?.(plan.tasks);

  // ── Display memory citations (show user learning-in-action) ───────────────
  if (memorySnapshot) {
    const citations = parsePlanCitations(planText);
    if (citations.length > 0) {
      console.error(`[Team] 🧠 Memory influenced this plan (${citations.length} citation${citations.length !== 1 ? 's' : ''}):`);
      for (const c of citations) console.error(`[Team]   · ${c.slice(0, 120)}`);
    }
  }

  // ── Phase 2: PM control loop ──────────────────────────────────────────────
  console.error('[Team] Phase 2: Starting PM control loop...');

  const remaining = [...plan.tasks];
  let waveNumber = 0;

  while (remaining.length > 0) {
    waveNumber++;
    currentWaveNumber = waveNumber;

    // ── HITL check ────────────────────────────────────────────────────────
    if (await processHitl()) {
      console.error(`[Team] HITL abort — stopping after wave ${waveNumber - 1}`);
      break;
    }

    const allReady = remaining.filter((t) => t.dependsOn.every((d) => completedIds.has(d)));

    let ready: TeamTask[];
    if (allReady.length === 0) {
      console.error('[Team] WARNING: unresolvable dependencies — running remaining tasks to avoid deadlock');
      ready = remaining.splice(0);
    } else {
      // Sequential mode: one task per wave for maximum PM control.
      // Parallel mode: all ready tasks run concurrently (up to MAX_CONCURRENT_AGENTS).
      ready = sequential ? [allReady[0]] : allReady;
      for (const t of ready) remaining.splice(remaining.indexOf(t), 1);
    }

    const modeLabel = sequential
      ? `Step ${waveNumber}  [${ready[0]?.agent ?? '?'}]`
      : `Wave ${waveNumber}: ${ready.length} task(s) in parallel`;
    console.error(`[Team] ${modeLabel} — ${ready.map((t) => t.id).join(', ')}`);
    onWaveStart?.(waveNumber, ready);

    // Reset circuit breaker for this wave (clears error count and open flag)
    waveCircuit.reset();

    // Execute wave with concurrency cap (MAX_CONCURRENT_AGENTS) to avoid
    // overwhelming the Cursor API with too many simultaneous socket connections.
    if (ready.length > MAX_CONCURRENT_AGENTS) {
      console.error(`[Team]   ⚡ Wave ${waveNumber}: throttling ${ready.length} tasks to ${MAX_CONCURRENT_AGENTS} concurrent slots`);
    }
    const waveResults = await runConcurrent(
      ready.map((task) => () => executeTask(task)),
      MAX_CONCURRENT_AGENTS,
    );

    // ── Circuit breaker check ─────────────────────────────────────────────
    // If CIRCUIT_BREAKER_THRESHOLD network errors occurred this wave, pause the
    // run so the user can restore connectivity before the PM review proceeds.
    const circuitBroke = waveCircuit.isOpen;
    if (circuitBroke) {
      const succeeded = waveResults.filter((r) => !r.hasBlocker);
      const blocked   = waveResults.filter((r) => r.hasBlocker);

      // Notify caller with structured info for rich UI rendering
      onCircuitBreak?.({
        waveNumber,
        errorCount:   waveCircuit.errorCount,
        failedAgents: [...waveCircuit.failedAgents],
        savedTasks:   succeeded.map((r) => ({ id: r.taskId, agent: r.agent, title: r.taskTitle })),
        blockedTasks: blocked.map((r) => ({ id: r.taskId, agent: r.agent, title: r.taskTitle })),
      });

      const SEP = '─'.repeat(58);
      console.error('');
      console.error(`[Team] 🔴  ${SEP}`);
      console.error('[Team] 🔴  Cursor connection dropped — run paused');
      console.error(`[Team] 🔴  ${SEP}`);
      console.error('[Team] 🔴');
      console.error(`[Team] 🔴  Wave ${waveNumber} was interrupted by a network error.`);
      console.error('[Team] 🔴');
      if (succeeded.length > 0) {
        console.error(`[Team] 🔴  Tasks completed and saved (${succeeded.length}):`);
        for (const r of succeeded) {
          console.error(`[Team] 🔴    ✓  ${r.taskId}  ${r.agent}  "${r.taskTitle.slice(0, 45)}"`);
        }
      } else {
        console.error('[Team] 🔴  No tasks completed cleanly this wave.');
      }
      if (blocked.length > 0) {
        console.error('[Team] 🔴');
        console.error(`[Team] 🔴  Tasks that need to be retried (${blocked.length}):`);
        for (const r of blocked) {
          console.error(`[Team] 🔴    ✗  ${r.taskId}  ${r.agent}  "${r.taskTitle.slice(0, 45)}"`);
        }
      }
      console.error('[Team] 🔴');
      console.error('[Team] 🔴  When connectivity is restored, resume with:');
      console.error('[Team] 🔴    roland resume        (in another terminal)');
      console.error('[Team] 🔴    /resume              (in chat)');
      console.error('[Team] 🔴');
      console.error('[Team] 🔴  The PM will retry blocked tasks automatically.');
      console.error(`[Team] 🔴  ${SEP}`);
      console.error('');

      // Record partial progress on blackboard for PM visibility
      blackboard.post({
        type: 'decision',
        title: `Circuit Breaker: Wave ${waveNumber} — ${waveCircuit.errorCount} Network Error${waveCircuit.errorCount !== 1 ? 's' : ''}`,
        content: [
          `Wave ${waveNumber} hit ${waveCircuit.errorCount} network error${waveCircuit.errorCount !== 1 ? 's' : ''} (ECONNRESET / ConnectError). Run paused for connectivity recovery.`,
          succeeded.length > 0
            ? `Completed and saved: ${succeeded.map((r) => `${r.taskId} (${r.agent})`).join(', ')}`
            : 'No tasks completed cleanly this wave.',
          blocked.length > 0
            ? `Need PM retry after resume: ${blocked.map((r) => `${r.taskId} (${r.agent})`).join(', ')}`
            : '',
          'Resume with: roland resume',
        ].filter(Boolean).join('\n'),
        status: 'pending',
        author: 'system',
        priority: 'critical',
        tags: ['circuit-breaker', 'network-error', `wave-${waveNumber}`],
        relatedIds: [],
      });

      // Pause via HITL — orchestrator blocks at start of next wave
      if (hitlQueue) {
        hitlQueue.setPaused(true);
        onHitlPause?.(true);
      } else {
        // No HITL queue — log clearly so the user knows to restart
        console.error('[Team] ⚡  NOTE: HITL queue not available — run will continue but may hit more errors.');
        console.error('[Team] ⚡  Consider restarting with: roland team "..." after restoring connectivity.');
      }

      waveCircuit.reset();
    }

    // ── PM Review ─────────────────────────────────────────────────────────
    // Skip when the circuit broke this wave — the PM review would also fail on
    // a downed connection. PM reviews normally after the run is resumed.
    if (remaining.length > 0 && !circuitBroke) {
      // Collect blockers detected this wave
      const detectedBlockers = waveResults
        .filter((r) => r.hasBlocker)
        .flatMap((r) => {
          const sigs = parseWorkerSignals(r.output);
          return sigs.blockers.map((b) => `[${r.agent}] ${b.description}`);
        });

      const hasBlockers = detectedBlockers.length > 0;
      if (hasBlockers) {
        console.error(`[Team] Wave ${waveNumber} done — ⚠️  ${detectedBlockers.length} blocker(s) detected, asking PM to resolve...`);
      } else {
        console.error(`[Team] Wave ${waveNumber} done — asking PM to review...`);
      }
      onWaveReview?.(waveNumber);

      const reviewPrompt = buildLeadPMReviewPrompt({
        goal,
        waveNumber,
        waveResults,
        remainingTasks: remaining,
        blackboardSnapshot: blackboard.snapshot(),
        roster,
        inboxMessages: bus.inboxSummary('Lead-PM') || undefined,
        detectedBlockers: detectedBlockers.length > 0 ? detectedBlockers : undefined,
        commandBlackboard: getCommandBlackboardSnapshot(),
        escalationNotes: escalation.escalationNotes.length > 0 ? [...escalation.escalationNotes] : undefined,
      });
      const pmReviewStart = Date.now();
      const reviewText = await callCursorAgent('Lead-PM', 'gpt-5.4-nano', reviewPrompt, undefined, supervisorCallOpts);
      allTaskUsage.push(buildTaskUsage(`pm-review-${waveNumber}`, `Lead PM: Wave ${waveNumber} Review`, 'Lead-PM', 'gpt-5.4-nano', reviewPrompt.length, reviewText.length, Date.now() - pmReviewStart));

      const rawDecision = extractJsonBlock(reviewText);
      let decision: ReviewDecision = isReviewDecision(rawDecision)
        ? rawDecision
        : { decision: 'continue' };

      // Error recovery: unparseable review with blockers → force adjust
      if (!isReviewDecision(rawDecision) && hasBlockers) {
        const forceAdjust = escalation.recordReviewParseFailure(waveNumber);
        if (forceAdjust || hasBlockers) {
          console.error('[Team] ⚠️  PM review JSON unparseable with active blockers — forcing adjust recovery');
          decision = {
            decision: 'adjust',
            pmNotes: 'Auto-recovery: PM review response was not parseable JSON. Blockers require resolution before continuing.',
            unblocks: detectedBlockers.map((b) => ({
              forAgent: waveResults.find((r) => b.includes(`[${r.agent}]`))?.agent ?? 'executor',
              message: `PM auto-recovery: resolve blocker — ${b.slice(0, 200)}`,
            })),
          };
        }
      }

      // Operator escalation when cumulative blockers exceed threshold
      if (escalation.shouldEscalateToOperator()) {
        const note = `Operator escalation: ${totalBlockers} blockers this run. Review scope, environment, or provide HITL directive via /inject.`;
        commandBoard.appendBullet('Open Intel', `[ESCALATION] ${note}`);
        console.error(`[Team] ⚠️  ${note}`);
        if (hitlQueue && !hitlQueue.isPaused()) {
          hitlQueue.setPaused(true);
          onHitlPause?.(true);
          console.error('[Team] Run paused for operator review — use `roland resume` or `/resume` after addressing blockers.');
        }
      }

      onWaveComplete?.(waveNumber, decision);

      if (decision.decision === 'continue') {
        console.error(`[Team] PM: wave ${waveNumber} approved — continuing`);
      } else {
        console.error(`[Team] PM adjusting${decision.pmNotes ? ': ' + decision.pmNotes.slice(0, 100) : ''}`);

        const spawnedTasks = decision.newTasks ?? [];
        for (const task of spawnedTasks) {
          console.error(`[Team]   + spawn ${task.id} → ${task.agent} ("${task.title}")`);
          remaining.push(task);
          blackboard.post({ type: 'task', title: task.title, content: task.description, status: 'pending', author: 'Lead-PM', assignee: task.agent, priority: task.priority as 'critical' | 'high' | 'medium' | 'low', tags: ['spawned', task.id], relatedIds: [] });
        }
        if (spawnedTasks.length > 0) onTasksSpawned?.(spawnedTasks);

        for (const u of decision.unblocks ?? []) {
          console.error(`[Team]   ↑ unblock ${u.forAgent}: "${u.message.slice(0, 80)}"`);
          bus.send('Lead-PM', u.forAgent, 'PM Unblock Guidance', u.message);
        }

        for (const r of decision.rescopes ?? []) {
          const task = remaining.find((t) => t.id === r.taskId);
          if (task) {
            console.error(`[Team]   ✎ re-scope ${r.taskId}`);
            task.description = r.newDescription;
          }
        }
      }
    } else {
      console.error(`[Team] Wave ${waveNumber} done — no remaining tasks, moving to synthesis`);
    }
  }

  // ── Phase 3: Lead PM synthesis ────────────────────────────────────────────
  console.error('[Team] Phase 3: Lead PM synthesis...');
  onSynthesizing?.();

  const synthesisCtx = {
    goal,
    blackboardSnapshot: blackboard.snapshot(),
    roster,
    inboxMessages: bus.inboxSummary('Lead-PM') || undefined,
    taskResults,
    commandBlackboard: getCommandBlackboardSnapshot(),
  };
  const synthesisPrompt = buildLeadPMSynthesisPrompt(synthesisCtx);
  const pmSynthStart = Date.now();
  let synthesis = await callCursorAgent('Lead-PM', 'gpt-5.4-nano', synthesisPrompt, undefined, supervisorCallOpts);
  allTaskUsage.push(buildTaskUsage('pm-synthesis', 'Lead PM: Synthesis', 'Lead-PM', 'gpt-5.4-nano', synthesisPrompt.length, synthesis.length, Date.now() - pmSynthStart));

  // "no detail" fallback: empty, too-short, or blocker-string responses mean the full
  // synthesis failed. Retry once with a minimal focused prompt; if that also fails,
  // auto-generate a plain-text summary from task outputs so the run always finishes.
  const synthesisFailed = (s: string) => !s.trim() || s.trim().length < 200 || s.includes('## 🚨 BLOCKER');
  if (synthesisFailed(synthesis)) {
    console.error('[Team] ⚠️  Synthesis returned no detail — retrying with fallback prompt...');
    console.error('[Team] ⚠️  Run is still alive — use `roland status` to monitor');
    const fallbackPrompt = buildFallbackSynthesisPrompt(synthesisCtx);
    const pmFallbackStart = Date.now();
    synthesis = await callCursorAgent('Lead-PM', 'gpt-5.4-nano', fallbackPrompt, undefined, supervisorCallOpts);
    allTaskUsage.push(buildTaskUsage('pm-synthesis-fallback', 'Lead PM: Fallback Synthesis', 'Lead-PM', 'gpt-5.4-nano', fallbackPrompt.length, synthesis.length, Date.now() - pmFallbackStart));

    if (synthesisFailed(synthesis)) {
      console.error('[Team] ⚠️  Fallback synthesis also failed — auto-generating minimal summary from task outputs');
      synthesis = buildMinimalSynthesis(goal, taskResults);
    }
  }

  console.error('[Team] Synthesis complete');

  // Merge Command Blackboard updates from synthesis
  const boardUpdates = commandBoard.extractAndMerge(synthesis);
  if (boardUpdates > 0) {
    console.error(`[Team] Command Blackboard updated — ${boardUpdates} new bullet(s) in .roland/command-blackboard.md`);
  }
  commandBoard.setAgentStatus({ callsign: 'Roland', state: 'complete', lastUpdated: Date.now(), note: 'Mission synthesis complete' });
  commandBoard.appendBullet('Mission Objectives', `[complete] ${goal.slice(0, 120)}`);

  // ── Persist memory extract ────────────────────────────────────────────────
  const appended = memory.extractAndAppend(synthesis, goal, runId);
  if (appended) {
    console.error('[Team] Project memory updated — .roland/memory.md');
  } else {
    console.error('[Team] No Memory Extract found in synthesis — memory unchanged');
  }

  // ── Persist knowledge update (DECISIONS.md) ───────────────────────────────
  const decisionsAdded = appendDecisions(synthesis, goal, runId, process.cwd());
  if (decisionsAdded > 0) {
    console.error(`[Team] DECISIONS.md updated — ${decisionsAdded} new decision(s) appended`);
  }

  // ── Phase 4: Self-improvement retrospective ───────────────────────────────
  if (!noImprove) {
    // Collect optional human feedback (interactive scroll/TTY mode only)
    let humanFeedback: HumanFeedback | undefined;
    if (interactive && Boolean((process.stderr as NodeJS.WriteStream).isTTY)) {
      const fb = await collectHumanFeedback(goal, { isTTY: true, timeoutSeconds: 30, rl });
      if (fb) {
        humanFeedback = fb;
        console.error(`[Team] Feedback recorded: ${fb.rating}/10${fb.notes ? ` — "${fb.notes.slice(0, 60)}"` : ''}`);
      }
    }

    console.error('[Team] Phase 4: Self-improvement retrospective (v2)...');

    const taskSummary = Object.entries(taskResults)
      .map(([id, r]) => `- ${id} [${r.agent}]: "${r.taskTitle}"${r.hadBlocker ? ' ⚠️ blocker' : ' ✓'}`)
      .join('\n');

    const retroPrompt  = buildRetrospectivePrompt(goal, synthesis, taskSummary, memory.structuredSnapshot(), humanFeedback);
    const pmModel      = toCursorModelId('', 'lead-pm');
    const retroStart   = Date.now();
    const retroText    = await callCursorAgent('Lead-PM', pmModel, retroPrompt, undefined, supervisorCallOpts);
    allTaskUsage.push(buildTaskUsage(
      'pm-retrospective', 'Lead PM: Retrospective', 'Lead-PM', pmModel,
      retroPrompt.length, retroText.length, Date.now() - retroStart,
    ));

    const retroMap = parseRetrospectiveOutput(retroText);
    if (retroMap) {
      const existingSections = memory.parsedSections();
      const decision = await showMemoryProposal(retroMap, existingSections, {
        quiet:          !interactive,
        isTTY:          Boolean((process.stderr as NodeJS.WriteStream).isTTY),
        timeoutSeconds: 15,
        rl,
      });

      if (decision === 'accepted') {
        const added = applyRetroUpdate(retroMap, stateDir, goal, runId);
        if (added > 0) {
          console.error(`[Team] Memory improved — ${added} new bullet(s) written to .roland/memory.md`);
        } else {
          console.error('[Team] Retrospective produced no new bullets — memory unchanged');
        }
      } else {
        console.error('[Team] Memory update skipped by user');
      }
    } else {
      console.error('[Team] Retrospective: nothing new to document this run');
    }

    // Display PM self-critique (always shown when present, regardless of memory acceptance)
    const critique = parseSelfCritique(retroText);
    if (critique) {
      const lines = critique.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 5);
      console.error('[Team] 💭 Planning self-critique:');
      for (const line of lines) console.error(`[Team]   ${line.slice(0, 115)}`);
    }
  }

  // ── Save usage record ─────────────────────────────────────────────────────
  const runUsage = buildRunUsage({
    runId, runStart, runEnd: Date.now(),
    goal, wavesRun: waveNumber, blockersEncountered: totalBlockers,
    tasks: allTaskUsage,
  });
  saveRunUsage(stateDir, runUsage);
  console.error(
    `[Team] Usage: ~${runUsage.totalTokens.toLocaleString()} est. tokens` +
    ` | ~$${runUsage.totalCostUsd.toFixed(4)} est. cost` +
    ` | ${runUsage.tasks.length} agent call(s)` +
    ` | saved to ${stateDir}/usage-history.json`,
  );

  const goalEntry = blackboard.read({ type: 'task', status: 'in_progress' }).find((e) => e.tags.includes('goal'));
  if (goalEntry) blackboard.patch(goalEntry.id, { status: 'done' });

  const { buildBoardStatusReport, formatConciseUnscSummary } = await import('./board-report.js');
  const boardReport = buildBoardStatusReport(stateDir, goal);
  console.error('\n' + formatConciseUnscSummary(boardReport) + '\n');
  console.error('[Team] Full intel: `roland board-status` · JSON: `roland board-status --json`');

  synthesis = finalizeSynthesisOutput(synthesis, {
    goal,
    blockersEncountered: totalBlockers,
    wavesRun: waveNumber,
    taskCount: Object.keys(taskResults).length,
  });

  return { goal, plan, taskResults, synthesis, wavesRun: waveNumber, blockersEncountered: totalBlockers };
}
