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
import { Blackboard } from './blackboard.js';
import { MessageBus } from './message-bus.js';
import {
  buildLeadPMPlanningPrompt,
  buildLeadPMReviewPrompt,
  buildLeadPMSynthesisPrompt,
  isReviewDecision,
} from './pm-prompts.js';
import type { ReviewDecision, ReviewTask, WaveResult } from './pm-prompts.js';
import { buildClaudeToolCallingPrompt } from './prompts.js';
import { loadAllAgents, resolveAgentsDir } from './loadConfig.js';
import { toCursorModelId } from './model-routing.js';
import { parseWorkerSignals } from './worker-signals.js';
import type { AgentYaml } from './types.js';
import { AGENT_TIMEOUT_MS, AGENT_MAX_RETRIES, RETRY_BASE_DELAY, BLACKBOARD_RESULT_MAX_CHARS } from './constants.js';
import { ProjectMemory } from './project-memory.js';
import { buildTaskUsage, buildRunUsage, saveRunUsage } from './usage-tracker.js';
import type { TaskUsageRecord } from './usage-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ── Cursor SDK helper ─────────────────────────────────────────────────────────
// Timeout / retry constants live in constants.ts. On final failure, callCursorAgent
// returns a synthetic BLOCKER string so the PM can handle it in the next wave review
// instead of crashing the entire orchestration.

/** Single attempt: one SDK call with a hard timeout and a 60 s heartbeat. */
async function callCursorAgentOnce(agentName: string, modelId: string, prompt: string): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error('CURSOR_API_KEY is not set');

  const { Agent } = await import('@cursor/sdk') as typeof import('@cursor/sdk');
  const agent = await Agent.create({
    apiKey,
    model: { id: modelId },
    name: agentName,
    local: { cwd: process.cwd() },
  });

  const run   = await agent.send(prompt);
  const start = Date.now();

  // Heartbeat: lets users see long-running agents are alive, not hung.
  const heartbeat = setInterval(() => {
    const m = ((Date.now() - start) / 60_000).toFixed(1);
    console.error(`[Team]   ⏳ ${agentName} still running… (${m}m elapsed)`);
  }, 60_000);

  // Hard timeout — cleared in the finally block whether we win or lose the race.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(
        `Agent "${agentName}" timed out after ${(AGENT_TIMEOUT_MS / 60_000).toFixed(0)} min. ` +
        `Raise the limit with ROLAND_AGENT_TIMEOUT_MS (ms).`,
      ));
    }, AGENT_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([run.wait(), timeoutPromise]);
    if (result.status === 'error' || result.status === 'cancelled') {
      throw new Error(`Agent "${agentName}" ${result.status}: ${result.result ?? 'no detail'}`);
    }
    return result.result ?? '';
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeoutId);
  }
}

/**
 * Resilient wrapper: retries transient failures with exponential back-off.
 * If all attempts fail, returns a synthetic BLOCKER signal so the PM can
 * handle the failure gracefully rather than crashing the orchestration.
 */
async function callCursorAgent(agentName: string, modelId: string, prompt: string): Promise<string> {
  let lastErr: Error = new Error('unknown');

  for (let attempt = 1; attempt <= AGENT_MAX_RETRIES + 1; attempt++) {
    try {
      return await callCursorAgentOnce(agentName, modelId, prompt);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt <= AGENT_MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * attempt;
        console.error(
          `[Team]   ⚠️  ${agentName} attempt ${attempt} failed: ${lastErr.message.slice(0, 100)}` +
          ` — retrying in ${delay / 1000}s`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted — surface as a blocker instead of crashing.
  console.error(`[Team]   💀 ${agentName} failed after ${AGENT_MAX_RETRIES + 1} attempts: ${lastErr.message.slice(0, 120)}`);
  return [
    '## 🚨 BLOCKER',
    `**Description:** Agent "${agentName}" failed to respond after ${AGENT_MAX_RETRIES + 1} attempts.`,
    `Last error: ${lastErr.message}`,
    '**Needs from:** lead-pm',
    '**Impact:** This task produced no output and must be retried or re-scoped by the PM.',
  ].join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runTeam(opts: TeamOrchestratorOptions): Promise<TeamResult> {
  const {
    goal, stateDir = '.roland', agentsDir: agentsDirOverride,
    onPlanReady, onWaveStart, onTaskStart, onTaskComplete, onWaveComplete,
    onWaveReview, onTasksSpawned, onSynthesizing,
  } = opts;

  // ── Usage tracking ────────────────────────────────────────────────────────
  const runId    = Date.now().toString(36);
  const runStart = Date.now();
  const allTaskUsage: TaskUsageRecord[] = [];

  // ── Coordination layer ────────────────────────────────────────────────────
  console.error('[Team] Initializing coordination layer...');
  const blackboard = new Blackboard(stateDir);
  const bus = new MessageBus(stateDir);
  const memory = new ProjectMemory(stateDir);
  const memorySnapshot = memory.snapshot();
  if (memorySnapshot) console.error('[Team] Project memory loaded — injecting into planning prompt');

  blackboard.post({ type: 'task', title: 'TEAM GOAL', content: goal, status: 'in_progress', author: 'system', priority: 'critical', tags: ['goal'], relatedIds: [] });

  const agentsDir = resolveAgentsDir(import.meta.url, agentsDirOverride);
  const rosterMap = loadAllAgents(agentsDir, { excludeVariants: true });
  const roster: AgentYaml[] = Array.from(rosterMap.values());
  console.error(`[Team] Roster: ${roster.length} agents from ${agentsDir}`);

  // ── Model config banner ───────────────────────────────────────────────────
  console.error('[Team] ─────────────────────────────────────────────────────');
  console.error('[Team] Model config:');
  console.error('[Team]   Lead PM     → grok-4.3     (orchestration + planning)');
  console.error('[Team]   All engineers → composer-2.5 (reasoning, execution, tests, docs)');
  console.error('[Team] ─────────────────────────────────────────────────────');

  // ── Shared execution state ─────────────────────────────────────────────────
  const taskResults: Record<string, TeamTaskResult> = {};
  const completedIds = new Set<string>();
  let totalBlockers = 0;

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
      teamSize: roster.length,
    });

    const modelId = toCursorModelId(agentYaml.claude_model ?? '', task.agent);
    console.error(`[Team]   → ${task.agent} (${modelId}): "${task.title}"`);

    // Diagnostic: log the first 400 chars of the task description for test-author
    // so we can verify the ESM reminder is actually reaching the agent.
    if (agentKey === 'test-author') {
      const descPreview = task.description.slice(0, 400).replace(/\n/g, ' ↵ ');
      console.error(`[Team]   📋 [test-author] description[:400]: ${descPreview}`);
    }

    onTaskStart?.(task.id, task.agent, task.title);
    const taskCallStart = Date.now();
    const output = await callCursorAgent(task.agent, modelId, workerPrompt);
    allTaskUsage.push(buildTaskUsage(task.id, task.title, task.agent, modelId, workerPrompt.length, output.length, Date.now() - taskCallStart));

    // ── Parse worker signals ───────────────────────────────────────────────
    const signals = parseWorkerSignals(output);
    const hadBlocker = signals.blockers.length > 0;

    if (hadBlocker) {
      totalBlockers += signals.blockers.length;
      for (const blocker of signals.blockers) {
        console.error(`[Team]   🚨 BLOCKER from ${task.agent}: ${blocker.description.slice(0, 100)}`);
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

    return { taskId: task.id, taskTitle: task.title, agent: task.agent, output, hasBlocker: hadBlocker };
  }

  // ── Phase 1: Lead PM planning ─────────────────────────────────────────────
  console.error('[Team] Phase 1: Lead PM planning...');

  const planningPrompt = buildLeadPMPlanningPrompt({ goal, blackboardSnapshot: blackboard.snapshot(), roster, inboxMessages: bus.inboxSummary('Lead-PM') || undefined, projectMemory: memorySnapshot || undefined });
  const pmPlanStart = Date.now();
  const planText = await callCursorAgent('Lead-PM', 'grok-4.3', planningPrompt);
  allTaskUsage.push(buildTaskUsage('pm-planning', 'Lead PM: Planning', 'Lead-PM', 'grok-4.3', planningPrompt.length, planText.length, Date.now() - pmPlanStart));

  const rawPlan = extractJsonBlock(planText);
  const plan: TeamPlan = isTeamPlan(rawPlan) ? rawPlan : fallbackPlan(goal);
  console.error(`[Team] Plan: ${plan.tasks.length} task(s)${plan.pmNotes ? ` — ${plan.pmNotes.slice(0, 80)}` : ''}`);

  for (const task of plan.tasks) {
    blackboard.post({ type: 'task', title: task.title, content: task.description, status: 'pending', author: 'Lead-PM', assignee: task.agent, priority: task.priority as 'critical' | 'high' | 'medium' | 'low', tags: ['dispatched', task.id], relatedIds: [] });
  }
  onPlanReady?.(plan.tasks);

  // ── Phase 2: PM control loop ──────────────────────────────────────────────
  console.error('[Team] Phase 2: Starting PM control loop...');

  const remaining = [...plan.tasks];
  let waveNumber = 0;

  while (remaining.length > 0) {
    waveNumber++;

    const ready = remaining.filter((t) => t.dependsOn.every((d) => completedIds.has(d)));
    if (ready.length === 0) {
      console.error('[Team] WARNING: unresolvable dependencies — running remaining tasks to avoid deadlock');
      ready.push(...remaining.splice(0));
    } else {
      for (const t of ready) remaining.splice(remaining.indexOf(t), 1);
    }

    console.error(`[Team] Wave ${waveNumber}: ${ready.length} task(s) in parallel — ${ready.map((t) => t.id).join(', ')}`);
    onWaveStart?.(waveNumber, ready);

    // Execute wave in parallel
    const waveResults = await Promise.all(ready.map((task) => executeTask(task)));

    // ── PM Review ─────────────────────────────────────────────────────────
    if (remaining.length > 0) {
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
      });
      const pmReviewStart = Date.now();
      const reviewText = await callCursorAgent('Lead-PM', 'grok-4.3', reviewPrompt);
      allTaskUsage.push(buildTaskUsage(`pm-review-${waveNumber}`, `Lead PM: Wave ${waveNumber} Review`, 'Lead-PM', 'grok-4.3', reviewPrompt.length, reviewText.length, Date.now() - pmReviewStart));

      const rawDecision = extractJsonBlock(reviewText);
      const decision: ReviewDecision = isReviewDecision(rawDecision)
        ? rawDecision
        : { decision: 'continue' };

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

  const synthesisPrompt = buildLeadPMSynthesisPrompt({ goal, blackboardSnapshot: blackboard.snapshot(), roster, inboxMessages: bus.inboxSummary('Lead-PM') || undefined, taskResults });
  const pmSynthStart = Date.now();
  const synthesis = await callCursorAgent('Lead-PM', 'grok-4.3', synthesisPrompt);
  allTaskUsage.push(buildTaskUsage('pm-synthesis', 'Lead PM: Synthesis', 'Lead-PM', 'grok-4.3', synthesisPrompt.length, synthesis.length, Date.now() - pmSynthStart));
  console.error('[Team] Synthesis complete');

  // ── Persist memory extract ────────────────────────────────────────────────
  const appended = memory.extractAndAppend(synthesis, goal, runId);
  if (appended) {
    console.error('[Team] Project memory updated — .roland/memory.md');
  } else {
    console.error('[Team] No Memory Extract found in synthesis — memory unchanged');
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

  return { goal, plan, taskResults, synthesis, wavesRun: waveNumber, blockersEncountered: totalBlockers };
}
