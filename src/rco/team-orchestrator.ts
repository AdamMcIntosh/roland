/**
 * ## P1 Final Consolidation (v1.6.0)
 *
 * Thin team router — delegates all missions to ClosedLoop (Pure ClosedLoop default).
 */

import path from 'path';
import {
  configureSdkProcessLimits,
  createShellExecStderrFilter,
} from '../utils/sdk-lifecycle.js';
import {
  ensureMissionProjectContext,
  resolveMissionProjectRoot,
} from '../utils/mcp-project-context.js';
import { recommendLoopTemplate } from './triage-router.js';
import { hasLoopTemplate, runClosedLoopMission } from './loop-orchestrator.js';

configureSdkProcessLimits();

export type {
  TeamTask,
  TeamPlan,
  TeamTaskResult,
  TeamResult,
  CircuitBreakInfo,
  TeamOrchestratorOptions,
} from './team-types.js';

import type { TeamOrchestratorOptions, TeamResult } from './team-types.js';

/** Suppress [Team] progress logs — used for --quiet runs (synthesis-only output). */
function muteConsoleError(): () => void {
  const prev = console.error;
  console.error = () => {};
  return () => { console.error = prev; };
}

function resolveLoopTemplate(opts: TeamOrchestratorOptions): string {
  const explicit = opts.loopTemplate?.trim();
  if (explicit) return explicit;
  return recommendLoopTemplate(opts.goal).template;
}

/**
 * Run a team mission — always routes through ClosedLoop with an auto-selected template when omitted.
 */
export async function runTeam(opts: TeamOrchestratorOptions): Promise<TeamResult> {
  const {
    goal,
    stateDir = '.roland',
    quiet = false,
    loopEmbedded,
  } = opts;

  const restoreStderr = quiet ? createShellExecStderrFilter() : undefined;
  const restoreLog = quiet ? muteConsoleError() : undefined;

  const loopTemplate = resolveLoopTemplate(opts);

  try {
    const resolvedStateDir = path.resolve(stateDir);
    const projectRoot = resolveMissionProjectRoot(resolvedStateDir);

    if (!loopEmbedded) {
      ensureMissionProjectContext({ projectRoot, stateDir: resolvedStateDir });
    }

    if (!loopEmbedded) {
      const { prepareMissionStart } = await import('./mission-state.js');
      const { formatCleanupReport } = await import('./board-cleanup.js');
      const cleanupResult = prepareMissionStart(stateDir, goal, { projectRoot });
      const boardResult = cleanupResult.boardCleanup as import('./board-cleanup.js').BoardCleanupResult | undefined;
      if (
        cleanupResult.metaArchived ||
        cleanupResult.loopArtifactsReset ||
        (boardResult && (
          boardResult.blackboardArchived > 0 ||
          boardResult.commandBoard.activeTasksRemoved.length > 0 ||
          boardResult.commandBoard.objectivesArchived.length > 0
        ))
      ) {
        const label = '[Loop]';
        console.error(`${label} Mission start hygiene — prior state archived`);
        if (boardResult) {
          for (const line of formatCleanupReport(boardResult).split('\n').slice(1, 4)) {
            if (line.trim()) console.error(`${label}   ${line}`);
          }
        }
        if (cleanupResult.loopArtifactsReset) {
          console.error(`${label}   loop-state + checkpoint reset for fresh mission`);
        }
      }
    }

    const result = await runClosedLoopMission({ ...opts, loopTemplate });

    if (!opts.loopEmbedded) {
      try {
        const { notifyHermesMissionCompleteFromTeamResult } = await import('./hitl-hermes.js');
        notifyHermesMissionCompleteFromTeamResult(stateDir, result);
      } catch {
        /* Hermes notification must not break mission return */
      }
    }
    return result;
  } catch (err) {
    if (!opts.loopEmbedded) {
      try {
        const { notifyHermesMissionFailed } = await import('./hitl-hermes.js');
        notifyHermesMissionFailed(stateDir, goal, err);
      } catch {
        /* non-fatal */
      }
    }
    throw err;
  } finally {
    restoreStderr?.();
    restoreLog?.();
  }
}

export { hasLoopTemplate };
