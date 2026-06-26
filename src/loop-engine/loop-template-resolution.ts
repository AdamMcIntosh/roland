/**
 * ## Assumptions
 * - Template YAML verification merges with loop_engine.verification.strategies by type.
 * - Shorthand verification arrays (type names only) filter config strategies — backward compatible.
 * - Between-iterations hooks resolve: phase.after → template.between_iterations → config.between_iterations.
 * - Built-in actions expand to project commands from config where possible.
 */

import type {
  BetweenIterationsBuiltinAction,
  BetweenIterationsHookConfig,
  LoopTemplate,
  PhaseConfig,
  PhaseVerificationEntry,
  TemplateVerificationStep,
  VerificationStrategyDefinition,
} from './loop-phases.js';
import { Phase } from './loop-phases.js';
import { loadLoopEngineConfig } from './loop-config.js';
import {
  DEFAULT_VERIFICATION_STRATEGIES,
  resolveStrategies,
  getBuiltinStrategy,
  coerceVerificationStrategies,
  getStrategyWeight,
  getStrategySuccessThreshold,
  type VerificationStrategyConfig,
} from './verification/verification-strategies.js';

export interface ResolvedBetweenIterationsHook {
  command: string;
  label: string;
  timeoutMs: number;
  optional: boolean;
  dryRun: boolean;
  exitOnFailure: boolean;
  /** When true, skip command execution (critique-only and dry-run). */
  noOp: boolean;
  source: 'template' | 'phase-after' | 'phase-between' | 'config' | 'builtin';
  /** Built-in action when set (git-commit uses dedicated handler). */
  action?: BetweenIterationsBuiltinAction;
  /** git-commit action options. */
  gitCommit?: {
    messageTemplate: string;
    includeFiles?: string[];
    autoStage: boolean;
    dryRun: boolean;
    requireApproval: boolean;
    approvalTimeoutMs: number;
    autoRejectOnTimeout: boolean;
  };
}

const DEFAULT_BETWEEN_TIMEOUT_MS = 120_000;

function isTypeFilterEntry(entry: PhaseVerificationEntry): entry is TemplateVerificationStep {
  return typeof entry === 'string';
}

function isFullStrategy(entry: PhaseVerificationEntry): entry is VerificationStrategyDefinition {
  return typeof entry === 'object' && entry !== null && 'type' in entry;
}

/** Normalize legacy string or object hook config from YAML. */
export function normalizeBetweenIterationsHook(
  raw: string | BetweenIterationsHookConfig | undefined,
): BetweenIterationsHookConfig | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? { command: trimmed } : undefined;
  }
  return raw;
}

function expandBuiltinAction(
  action: BetweenIterationsBuiltinAction,
): Pick<ResolvedBetweenIterationsHook, 'command' | 'label' | 'noOp'> {
  const cfg = loadLoopEngineConfig();
  switch (action) {
    case 'run-tests': {
      const unit =
        cfg.verification?.strategies?.find((s) => s.type === 'unit') ??
        DEFAULT_VERIFICATION_STRATEGIES.find((s) => s.type === 'unit');
      return {
        command: unit?.command ?? 'npm test',
        label: 'run-tests',
        noOp: false,
      };
    }
    case 'git-commit':
      return {
        command: '',
        label: 'git-commit',
        noOp: false,
      };
    case 'critique-only':
      return { command: '', label: 'critique-only', noOp: true };
    default:
      return { command: '', label: action, noOp: true };
  }
}

function normalizeHookFields(
  hook: BetweenIterationsHookConfig & Record<string, unknown>,
): BetweenIterationsHookConfig {
  return {
    command: hook.command,
    action: hook.action,
    timeoutMs: hook.timeoutMs ?? (hook.timeout_ms as number | undefined),
    optional: hook.optional,
    dryRun: hook.dryRun ?? (hook.dry_run as boolean | undefined),
    exitOnFailure: hook.exitOnFailure ?? (hook.exit_on_failure as boolean | undefined),
    messageTemplate: hook.messageTemplate ?? (hook.message_template as string | undefined),
    includeFiles: hook.includeFiles ?? (hook.include_files as string[] | undefined),
    autoStage: hook.autoStage ?? (hook.auto_stage as boolean | undefined),
    requireApproval: hook.requireApproval ?? (hook.require_approval as boolean | undefined),
    approvalTimeoutMs:
      hook.approvalTimeoutMs ?? (hook.approval_timeout_ms as number | undefined),
    autoRejectOnTimeout:
      hook.autoRejectOnTimeout ?? (hook.auto_reject_on_timeout as boolean | undefined),
  };
}

function resolveHookConfig(
  hook: BetweenIterationsHookConfig,
  source: ResolvedBetweenIterationsHook['source'],
): ResolvedBetweenIterationsHook | undefined {
  const normalized = normalizeHookFields(hook as BetweenIterationsHookConfig & Record<string, unknown>);
  const isGitCommit = normalized.action === 'git-commit';
  const dryRun = normalized.dryRun ?? (isGitCommit ? true : false);
  let command = normalized.command?.trim() ?? '';
  let label = command || normalized.action || source;
  let noOp = dryRun && !isGitCommit;

  if (normalized.action) {
    const expanded = expandBuiltinAction(normalized.action);
    command = normalized.command?.trim() || expanded.command;
    label = normalized.action;
    noOp = normalized.action === 'critique-only' || (dryRun && normalized.action !== 'git-commit');
  }

  if (!command && !normalized.action && !dryRun) return undefined;

  const resolved: ResolvedBetweenIterationsHook = {
    command,
    label,
    timeoutMs: normalized.timeoutMs ?? DEFAULT_BETWEEN_TIMEOUT_MS,
    optional: normalized.optional ?? false,
    dryRun,
    exitOnFailure: normalized.exitOnFailure ?? false,
    noOp,
    source,
    action: normalized.action,
  };

  if (isGitCommit) {
    resolved.gitCommit = {
      messageTemplate:
        normalized.messageTemplate ??
        'loop({iteration}): {goal}',
      includeFiles: normalized.includeFiles,
      autoStage: normalized.autoStage ?? false,
      dryRun,
      requireApproval: normalized.requireApproval ?? false,
      approvalTimeoutMs: normalized.approvalTimeoutMs ?? 30 * 60 * 1000,
      autoRejectOnTimeout: normalized.autoRejectOnTimeout ?? true,
    };
    resolved.noOp = false;
  }

  return resolved;
}

/** Resolve between-iterations hook: phase.after → phase.betweenIterations → template → config. */
export function resolveBetweenIterationsHook(
  template: LoopTemplate,
  scope?: { phaseConfig?: PhaseConfig },
): ResolvedBetweenIterationsHook | undefined {
  const phase = scope?.phaseConfig;
  if (phase?.after) {
    const resolved = resolveHookConfig(phase.after, 'phase-after');
    if (resolved) return resolved;
  }
  if (phase?.betweenIterations) {
    const resolved = resolveHookConfig(phase.betweenIterations, 'phase-between');
    if (resolved) return resolved;
  }

  const templateHook = normalizeBetweenIterationsHook(template.betweenIterations);
  if (templateHook) {
    const resolved = resolveHookConfig(templateHook, 'template');
    if (resolved) return resolved;
  }

  const cfg = loadLoopEngineConfig();
  const configHook = normalizeBetweenIterationsHook(cfg.betweenIterations);
  if (configHook) {
    const resolved = resolveHookConfig(configHook, 'config');
    if (resolved) return resolved;
  }

  return undefined;
}

/** Backward-compatible string command for exit conditions and legacy callers. */
export function resolveBetweenIterationsCommand(template: LoopTemplate): string | undefined {
  const hook = resolveBetweenIterationsHook(template);
  if (!hook || hook.noOp) return undefined;
  return hook.command || undefined;
}

/** Merge template phase verification with loop_engine.verification.strategies. */
export function resolveVerificationStrategies(
  template: LoopTemplate,
  phaseConfig?: PhaseConfig,
): VerificationStrategyConfig[] {
  const cfg = loadLoopEngineConfig();
  const configStrategies = coerceVerificationStrategies(cfg.verification?.strategies);
  const raw = phaseConfig?.verification;

  if (!raw || raw.length === 0) {
    return configStrategies;
  }

  if (isTypeFilterEntry(raw[0]!)) {
    return resolveStrategies(configStrategies, raw as TemplateVerificationStep[]);
  }

  const configByType = new Map(configStrategies.map((s) => [s.type, s]));

  const resolved: VerificationStrategyConfig[] = [];
  for (const entry of raw) {
    if (!isFullStrategy(entry)) continue;
    const base = configByType.get(entry.type) ?? getBuiltinStrategy(entry.type);
    resolved.push({
      type: entry.type,
      command: entry.command ?? base?.command ?? 'npm test',
      timeoutMs: entry.timeoutMs ?? base?.timeoutMs,
      optional: entry.optional ?? base?.optional,
      weight: entry.weight ?? base?.weight ?? getStrategyWeight(entry.type),
      successThreshold: getStrategySuccessThreshold(
        entry.type,
        entry.optional ?? base?.optional,
        entry.successThreshold ?? base?.successThreshold,
      ),
      minConfidence: entry.minConfidence ?? base?.minConfidence,
      dryRun: entry.dryRun ?? base?.dryRun,
    });
  }
  return resolved.length > 0 ? resolved : DEFAULT_VERIFICATION_STRATEGIES;
}

/** Verification summary for verify phase (or first verify phase in template). */
export function summarizeVerificationConfig(template: LoopTemplate): string | null {
  const verifyPhase = template.phases.find((p) => p.phase === Phase.Verify);
  if (!verifyPhase?.verification?.length) {
    const cfg = loadLoopEngineConfig();
    const types = coerceVerificationStrategies(cfg.verification?.strategies).map((s) => s.type);
    return types.length ? `config: ${types.join('+')}` : null;
  }

  const strategies = resolveVerificationStrategies(template, verifyPhase);
  const parts = strategies.map((s) => {
    const opt = s.optional ? '?' : '';
    const dry = s.dryRun ? '(dry)' : '';
    const wt = s.weight != null ? `@${s.weight}` : '';
    const th = s.successThreshold != null && s.successThreshold < 1 ? `≥${s.successThreshold}` : '';
    return `${s.type}${wt}${th}${opt}${dry}`;
  });
  return `verify: ${parts.join('+')}`;
}

/** Resolve EvaluationGate min_confidence: template → config → default. */
export function resolveMinConfidence(
  template: LoopTemplate,
  override?: number,
): number {
  if (override !== undefined) return override;
  if (template.minConfidence !== undefined) return template.minConfidence;
  const cfg = loadLoopEngineConfig();
  return cfg.verification?.minConfidence ?? 0.85;
}

/** Between-iterations hook summary for logs and dashboard. */
export function summarizeBetweenIterationsConfig(template: LoopTemplate): string | null {
  const hook = resolveBetweenIterationsHook(template);
  if (!hook) return null;
  const flags = [
    hook.dryRun ? 'dry-run' : null,
    hook.gitCommit?.requireApproval ? 'hitl-approval' : null,
    hook.optional ? 'optional' : null,
    hook.exitOnFailure ? 'exit-on-failure' : null,
    hook.gitCommit?.messageTemplate ? 'msg-template' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const suffix = flags ? ` (${flags})` : '';
  if (hook.noOp) return `${hook.label}${suffix}`;
  return `${hook.label}: ${hook.command}${suffix}`;
}

/** Phase-level after hooks declared in template. */
export function listPhaseAfterHooks(template: LoopTemplate): string[] {
  return template.phases
    .filter((p) => p.after || p.betweenIterations)
    .map((p) => {
      const hook = resolveBetweenIterationsHook(template, { phaseConfig: p });
      return hook ? `${p.phase}→${hook.label}` : p.phase;
    });
}

/**
 * ## Verification Strategies + Between-Iterations Hooks Complete
 *
 * Central resolution for declarative loop template verification and hooks.
 */
