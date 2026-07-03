/**
 * Loop Phase Model — canonical phases for Loop Engineering missions.
 *
 * Standard loop: Plan → Act → Verify → Critique → Retry → Escalate → Observe
 */
export declare const Phase: {
    readonly Plan: "plan";
    readonly Act: "act";
    readonly Verify: "verify";
    readonly Critique: "critique";
    readonly Retry: "retry";
    readonly Escalate: "escalate";
    readonly Observe: "observe";
    readonly Reflect: "reflect";
};
export type Phase = (typeof Phase)[keyof typeof Phase];
export declare const ALL_PHASES: readonly Phase[];
/** Verification strategy types selectable in loop templates. */
export type TemplateVerificationStep = 'unit' | 'integration' | 'smoke' | 'e2e' | 'lint' | 'typecheck';
/** Full verification strategy definition in template YAML (merged with config by type). */
export interface VerificationStrategyDefinition {
    type: TemplateVerificationStep;
    /** Shell command — falls back to config/builtin for this type when omitted. */
    command?: string;
    timeoutMs?: number;
    optional?: boolean;
    /** Relative weight in EvaluationGate confidence scoring (0–1 typical). */
    weight?: number;
    /** Confidence contribution when this strategy passes (0–1). */
    successThreshold?: number;
    /** Per-strategy minimum confidence floor when passed. */
    minConfidence?: number;
    /** Log only — do not execute the command. */
    dryRun?: boolean;
}
/** Shorthand or full verification config on a verify phase. */
export type PhaseVerificationEntry = TemplateVerificationStep | VerificationStrategyDefinition;
/** Built-in between-iterations / phase-after actions. */
export type BetweenIterationsBuiltinAction = 'run-tests' | 'git-commit' | 'critique-only';
/** Declarative hook run between iterations or after a phase. */
export interface BetweenIterationsHookConfig {
    /** Shell command — use alone or let `action` expand to a default command. */
    command?: string;
    /** Built-in declarative action (expands via loop-template-resolution). */
    action?: BetweenIterationsBuiltinAction;
    timeoutMs?: number;
    /** When true, hook failure is recorded but does not block the loop. */
    optional?: boolean;
    /** Log hook intent without executing (safety preview). Default true for git-commit action. */
    dryRun?: boolean;
    /** When true, loop fails/stops if the hook exits non-zero. */
    exitOnFailure?: boolean;
    /** git-commit action: commit message template ({goal}, {iteration}, {phase}, {template}). */
    messageTemplate?: string;
    /** git-commit action: stage only these paths (default: all changes when autoStage). */
    includeFiles?: string[];
    /** git-commit action: stage includeFiles or all changes before commit (default false in dry_run). */
    autoStage?: boolean;
    /** git-commit: pause loop and require operator approval before real commit (default false). */
    requireApproval?: boolean;
    /** git-commit HITL: max wait for operator decision (default 30 min). */
    approvalTimeoutMs?: number;
    /** git-commit HITL: auto-reject when approval_timeout_ms elapses (default true). */
    autoRejectOnTimeout?: boolean;
}
/** Exit condition types — inspired by loops.elorm.xyz explicit exit rules. */
export type ExitConditionType = 'all_gates_pass' | 'confidence_streak' | 'command_success' | 'custom';
/** Declarative exit rule loaded from YAML or supplied programmatically. */
export interface ExitConditionConfig {
    id?: string;
    type: ExitConditionType;
    /** Human-readable label for dashboard and logs. */
    description?: string;
    /** For confidence_streak — minimum weighted confidence (default 0.85). */
    minConfidence?: number;
    /** For confidence_streak — consecutive accepted iterations required (default 2). */
    consecutiveIterations?: number;
    /** For command_success — command that must exit 0 (defaults to betweenIterations). */
    command?: string;
    /** For custom — programmatic evaluator (not serializable from YAML). */
    evaluate?: (ctx: import('./exit-conditions.js').ExitEvaluationContext) => boolean;
}
/** [DEPRECATED] Legacy PM Team Engine routing for Plan/Act phases inside ClosedLoop. */
export type PmTeamMode = 'auto' | 'always' | 'never';
/** Optional gating for YAML-defined specialist spawns. */
export interface SpawnConditions {
    /** Spawn only when iteration >= this value (1-based). */
    iterationMin?: number;
    /** Spawn only when iteration <= this value (1-based). */
    iterationMax?: number;
    /** Spawn only when retryCount >= this value. */
    retryMin?: number;
    /** Spawn only on the first iteration. */
    firstIterationOnly?: boolean;
    /** Skip the first iteration. */
    afterFirstIteration?: boolean;
}
/** YAML-configurable specialist spawn for a loop phase. */
export interface SpecialistSpawnDefinition {
    /** Agent persona or generic role (pm, coding, verifier, researcher, etc.). */
    role: string;
    /** Number of spawn intents for this role (default 1). */
    count?: number;
    /** When true, this spawn becomes the phase primary agent. */
    primary?: boolean;
    /** Prompt/reason template — supports {goal}, {iteration}, {phase}, {retry}. */
    promptTemplate?: string;
    /** Optional spawn gating conditions. */
    conditions?: SpawnConditions;
    /** When true, spawn failure does not block the phase. */
    optional?: boolean;
}
/** Per-phase configuration within a loop template. */
export interface PhaseConfig {
    phase: Phase;
    /** Human-readable label for dashboard/logs */
    label?: string;
    /** Optional agent persona hint for this phase (future wiring) */
    agent?: string;
    /** Skip this phase when optional and no handler result is required */
    optional?: boolean;
    /**
     * Verify-phase strategies — shorthand type list or full strategy objects.
     * Merged with loop_engine.verification.strategies in loop-template-resolution.
     */
    verification?: PhaseVerificationEntry[];
    /** Hook run after this phase completes (shell, script, or built-in action). */
    after?: BetweenIterationsHookConfig;
    /** Phase-scoped between-iteration hook (alias for after on long-running phases). */
    betweenIterations?: BetweenIterationsHookConfig;
    /** [DEPRECATED] Override template-level legacy PM Team routing for this phase. */
    pmTeam?: PmTeamMode;
    /** YAML-defined specialist spawns — overrides PHASE_SPECIALIST_DEFAULTS when present. */
    specialistSpawns?: SpecialistSpawnDefinition[];
}
/** A reusable loop template — loaded from recipes/loops/*.yaml */
export interface LoopTemplate {
    name: string;
    description: string;
    /** When true, prefer the canonical name in aliasOf for new missions. */
    deprecated?: boolean;
    /** Canonical template this deprecated name mirrors. */
    aliasOf?: string;
    phases: PhaseConfig[];
    /** Outer loop iterations before escalation (default: 5) */
    maxIterations?: number;
    /** Max retry attempts before HITL escalation (default: 3) */
    maxRetries?: number;
    /** Consecutive verify failures before HITL (default: 4, independent of maxRetries) */
    escalationThreshold?: number;
    /** Test-mode overrides — used when isTestMode or ROLAND_LOOP_TEST_MODE=1 */
    testModeMaxRetries?: number;
    testModeEscalationThreshold?: number;
    /** Wall-clock timeout for the entire loop (ms). Default from config or 30 min. */
    timeoutMs?: number;
    /** Enable exponential backoff before retry iterations */
    exponentialBackoff?: boolean;
    /** Structured kickoff prompt shown at loop start (loops.elorm.xyz pattern). */
    kickoff?: string;
    /** Between-iteration hook — legacy shell string or declarative hook object. */
    betweenIterations?: string | BetweenIterationsHookConfig;
    /** Write reflection learnings to LoopMemory before next iteration. */
    reflection?: boolean;
    /** Explicit exit rules — all must pass to complete early. */
    exitConditions?: ExitConditionConfig[];
    /** Minimum confidence for EvaluationGate acceptance override. */
    minConfidence?: number;
    /** [DEPRECATED] Legacy PM Team routing for Plan phase (default: never for minimal templates). */
    pmPlan?: PmTeamMode;
    /** [DEPRECATED] Legacy PM Team routing for Act phase (default: never for minimal templates). */
    pmAct?: PmTeamMode;
    /** [DEPRECATED] Per-template legacy PM Team opt-in — advanced only; prefer Hermes + Pure ClosedLoop. */
    usePmTeam?: boolean;
}
export declare function isPhase(value: string): value is Phase;
export declare function phaseLabel(config: PhaseConfig): string;
//# sourceMappingURL=loop-phases.d.ts.map