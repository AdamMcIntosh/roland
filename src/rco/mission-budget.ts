/**
 * Mission budget — per-run cost ceiling with CLI override and config defaults.
 *
 * Enforces:
 *   - CLI `--budget <usd>`
 *   - config.yaml `budget.mission_budget_usd` / `budget.daily_budget_usd`
 *   - computed ceiling: maxIterations × estimated_per_iteration_cost_usd
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadUsageHistory, type RunUsageRecord } from './usage-tracker.js';

export interface MissionBudgetYaml {
  mission_budget_usd?: number;
  daily_budget_usd?: number;
  estimated_per_iteration_cost_usd?: number;
  enforce_hard_ceiling?: boolean;
}

export interface MissionBudgetResolution {
  /** Effective USD ceiling for this mission, or null when unlimited. */
  ceilingUsd: number | null;
  source: 'cli' | 'config' | 'computed' | 'none';
  estimatedPerIterationUsd?: number;
  maxIterations?: number;
  enforceHardCeiling: boolean;
  dailyBudgetUsd?: number;
}

export interface MissionBudgetGuard {
  resolution: MissionBudgetResolution;
  spentUsd: number;
  recordSpending(usd: number): void;
  wouldExceed(additionalUsd: number): boolean;
  checkBeforeIteration(iteration: number): BudgetCheckResult;
  checkAfterSpend(): BudgetCheckResult;
}

export interface BudgetCheckResult {
  allowed: boolean;
  spentUsd: number;
  ceilingUsd: number | null;
  reason?: string;
}

const DEFAULT_ESTIMATED_PER_ITERATION_USD = 0.75;

function findConfigYaml(): string | null {
  const candidates = [
    path.join(process.cwd(), 'config.yaml'),
    path.resolve(import.meta.dirname, '..', '..', 'config.yaml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Read mission-budget fields from config.yaml `budget:` section. */
export function loadMissionBudgetYaml(): MissionBudgetYaml {
  const configPath = findConfigYaml();
  if (!configPath) return {};
  try {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const budget = raw?.budget;
    if (!budget || typeof budget !== 'object') return {};
    const b = budget as Record<string, unknown>;
    return {
      mission_budget_usd:
        typeof b.mission_budget_usd === 'number' ? b.mission_budget_usd : undefined,
      daily_budget_usd:
        typeof b.daily_budget_usd === 'number' ? b.daily_budget_usd : undefined,
      estimated_per_iteration_cost_usd:
        typeof b.estimated_per_iteration_cost_usd === 'number'
          ? b.estimated_per_iteration_cost_usd
          : undefined,
      enforce_hard_ceiling:
        typeof b.enforce_hard_ceiling === 'boolean' ? b.enforce_hard_ceiling : undefined,
    };
  } catch {
    return {};
  }
}

/** Sum mission costs logged today (local calendar day) from usage-history.json. */
export function getDailySpendUsd(stateDir: string, now = Date.now()): number {
  const history = loadUsageHistory(stateDir);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  return history
    .filter((r) => r.timestamp >= dayStart)
    .reduce((s, r) => s + r.totalCostUsd, 0);
}

export function resolveMissionBudget(opts: {
  cliBudgetUsd?: number;
  maxIterations?: number;
  yaml?: MissionBudgetYaml;
}): MissionBudgetResolution {
  const yaml = opts.yaml ?? loadMissionBudgetYaml();
  const enforceHardCeiling = yaml.enforce_hard_ceiling !== false;
  const estimatedPerIterationUsd =
    yaml.estimated_per_iteration_cost_usd ?? DEFAULT_ESTIMATED_PER_ITERATION_USD;
  const maxIterations = opts.maxIterations;

  if (typeof opts.cliBudgetUsd === 'number' && opts.cliBudgetUsd > 0) {
    return {
      ceilingUsd: opts.cliBudgetUsd,
      source: 'cli',
      estimatedPerIterationUsd,
      maxIterations,
      enforceHardCeiling,
      dailyBudgetUsd: yaml.daily_budget_usd,
    };
  }

  const configMission = yaml.mission_budget_usd;
  const computed =
    maxIterations != null && maxIterations > 0
      ? maxIterations * estimatedPerIterationUsd
      : null;

  if (typeof configMission === 'number' && configMission > 0) {
    const ceiling =
      computed != null ? Math.min(configMission, computed) : configMission;
    return {
      ceilingUsd: ceiling,
      source: computed != null && ceiling === computed ? 'computed' : 'config',
      estimatedPerIterationUsd,
      maxIterations,
      enforceHardCeiling,
      dailyBudgetUsd: yaml.daily_budget_usd,
    };
  }

  if (computed != null && computed > 0) {
    return {
      ceilingUsd: computed,
      source: 'computed',
      estimatedPerIterationUsd,
      maxIterations,
      enforceHardCeiling,
      dailyBudgetUsd: yaml.daily_budget_usd,
    };
  }

  return {
    ceilingUsd: null,
    source: 'none',
    estimatedPerIterationUsd,
    maxIterations,
    enforceHardCeiling,
    dailyBudgetUsd: yaml.daily_budget_usd,
  };
}

export function createMissionBudgetGuard(opts: {
  resolution: MissionBudgetResolution;
  stateDir: string;
  initialSpentUsd?: number;
}): MissionBudgetGuard {
  let spentUsd = opts.initialSpentUsd ?? 0;
  const { resolution } = opts;

  const evaluate = (): BudgetCheckResult => {
    if (!resolution.enforceHardCeiling || resolution.ceilingUsd == null) {
      return { allowed: true, spentUsd, ceilingUsd: resolution.ceilingUsd };
    }

    if (spentUsd >= resolution.ceilingUsd) {
      return {
        allowed: false,
        spentUsd,
        ceilingUsd: resolution.ceilingUsd,
        reason: formatBudgetExceededMessage(spentUsd, resolution.ceilingUsd, resolution.source),
      };
    }

    if (resolution.dailyBudgetUsd != null && resolution.dailyBudgetUsd > 0) {
      const dailySpent = getDailySpendUsd(opts.stateDir) + spentUsd;
      if (dailySpent >= resolution.dailyBudgetUsd) {
        return {
          allowed: false,
          spentUsd,
          ceilingUsd: resolution.ceilingUsd,
          reason:
            `Daily budget ceiling reached (~$${dailySpent.toFixed(2)} / $${resolution.dailyBudgetUsd.toFixed(2)}). ` +
            'Increase budget.daily_budget_usd in config.yaml or wait until tomorrow.',
        };
      }
    }

    return { allowed: true, spentUsd, ceilingUsd: resolution.ceilingUsd };
  };

  return {
    resolution,
    get spentUsd() {
      return spentUsd;
    },
    recordSpending(usd: number) {
      if (usd > 0) spentUsd += usd;
    },
    wouldExceed(additionalUsd: number) {
      if (!resolution.enforceHardCeiling || resolution.ceilingUsd == null) return false;
      return spentUsd + additionalUsd > resolution.ceilingUsd;
    },
    checkBeforeIteration(iteration: number) {
      const est = resolution.estimatedPerIterationUsd ?? DEFAULT_ESTIMATED_PER_ITERATION_USD;
      if (this.wouldExceed(est)) {
        return {
          allowed: false,
          spentUsd,
          ceilingUsd: resolution.ceilingUsd,
          reason:
            `Mission budget would be exceeded before iteration ${iteration} ` +
            `(~$${(spentUsd + est).toFixed(2)} > $${resolution.ceilingUsd!.toFixed(2)} ceiling). ` +
            'Raise --budget or budget.mission_budget_usd in config.yaml.',
        };
      }
      return evaluate();
    },
    checkAfterSpend() {
      return evaluate();
    },
  };
}

export function formatBudgetExceededMessage(
  spentUsd: number,
  ceilingUsd: number,
  source: MissionBudgetResolution['source'],
): string {
  const src =
    source === 'cli'
      ? ' (--budget override)'
      : source === 'config'
        ? ' (config budget.mission_budget_usd)'
        : source === 'computed'
          ? ' (maxIterations × estimated_per_iteration_cost_usd)'
          : '';
  return (
    `Mission budget ceiling reached: ~$${spentUsd.toFixed(2)} spent of $${ceilingUsd.toFixed(2)} limit${src}. ` +
    'Mission stopped gracefully — review usage-history.json and raise the budget if needed.'
  );
}

/** Format a one-line budget status for stderr during runs. */
export function formatBudgetStatusLine(guard: MissionBudgetGuard): string {
  const { ceilingUsd } = guard.resolution;
  if (ceilingUsd == null) return `[Budget] No mission ceiling — ~$${guard.spentUsd.toFixed(4)} spent so far`;
  const pct = ceilingUsd > 0 ? Math.round((guard.spentUsd / ceilingUsd) * 100) : 0;
  return `[Budget] ~$${guard.spentUsd.toFixed(4)} / $${ceilingUsd.toFixed(2)} (${pct}%)`;
}

export function summarizeRunUsageForDisplay(record: RunUsageRecord): {
  totalCostUsd: number;
  totalTokens: number;
  durationMs: number;
  modelsUsed: string[];
  taskCount: number;
} {
  const models = [...new Set(record.tasks.map((t) => t.model).filter(Boolean))];
  return {
    totalCostUsd: record.totalCostUsd,
    totalTokens: record.totalTokens,
    durationMs: record.durationMs,
    modelsUsed: models,
    taskCount: record.tasks.length,
  };
}
