/**
 * ## P1 Final Consolidation (v1.4.0)
 *
 * Thin team router — delegates to ClosedLoop (default) or legacy PM engine (`--legacy-pm`).
 *
 * - Loop-template missions → `runClosedLoopMission()` (Pure ClosedLoop)
 * - Legacy PM Team → `src/legacy/pm-team/` (removal target: v1.6.0)
 * - ClosedLoop PM embed slices → `runLegacyPmTeam()` via `pmSlice` / `loopEmbedded`
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
import { hasLoopTemplate, runClosedLoopMission } from './loop-orchestrator.js';
import { runLegacyPmTeam, LEGACY_PM_REMOVAL_VERSION } from '../legacy/pm-team/index.js';

configureSdkProcessLimits();

export type {
  TeamTask,
  TeamPlan,
  TeamTaskResult,
  TeamResult,
  CircuitBreakInfo,
  TeamOrchestratorOptions,
} from '../legacy/pm-team/types.js';

export { LEGACY_PM_REMOVAL_VERSION };

import type { TeamOrchestratorOptions, TeamResult } from '../legacy/pm-team/types.js';

/** Suppress [Team] progress logs — used for --quiet runs (synthesis-only output). */
function muteConsoleError(): () => void {
  const prev = console.error;
  console.error = () => {};
  return () => { console.error = prev; };
}

/**
 * Run a team mission — routes to ClosedLoop when `loopTemplate` is set,
 * otherwise legacy PM waves (or PM embed slices when `loopEmbedded`).
 */
export async function runTeam(opts: TeamOrchestratorOptions): Promise<TeamResult> {
  const {
    goal,
    stateDir = '.roland',
    quiet = false,
    loopTemplate,
    loopEmbedded,
  } = opts;

  const restoreStderr = quiet ? createShellExecStderrFilter() : undefined;
  const restoreLog = quiet ? muteConsoleError() : undefined;

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
        const label = hasLoopTemplate(loopTemplate) ? '[Loop]' : '[Team]';
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

    const result = hasLoopTemplate(loopTemplate)
      ? await runClosedLoopMission(opts)
      : await runLegacyPmTeam(opts);

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

/**
 * ## P1 Consolidation Complete
 *
 * team-orchestrator.ts reduced to thin router (~120 lines).
 * Legacy PM bulk lives in src/legacy/pm-team/ (removal: v1.6.0).
 */
