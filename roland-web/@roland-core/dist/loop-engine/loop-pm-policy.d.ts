/**
 * ## Assumptions
 * - In Cursor, `@roland` + MCP triage handles PM — no Hermes dependency.
 * - Roland ClosedLoop is the loop execution engine (PACVRE harness); Pure ClosedLoop is the default.
 * - [DEPRECATED] Legacy PM Team (LeadPM, `use_pm_team: true`, `pm_plan`/`pm_act`) is advanced/legacy opt-in only.
 * - Global: `loop_engine.use_pm_team` in config.yaml (default false).
 * - Per-template: `use_pm_team: true` or `pm_plan/pm_act: always`.
 * - `pm_plan/pm_act: auto` invokes legacy PM only when global or template opt-in is true.
 * - `enablePmIntegration` on ClosedLoopOptions overrides both ways.
 */
import type { LoopTemplate } from './loop-phases.js';
export interface PmIntegrationStatus {
    enabled: boolean;
    /** Human-readable reason for logs and dashboard. */
    reason: string;
    source: 'disabled' | 'opt-in' | 'always' | 'override-on' | 'override-off';
}
export interface PmIntegrationResolveOptions {
    enablePmIntegration?: boolean;
}
/**
 * Resolve whether [DEPRECATED] legacy PM Team is wired into this loop mission.
 * @deprecated Prefer Pure ClosedLoop + @roland in Cursor. Legacy path kept for backward compatibility.
 */
export declare function resolvePmIntegrationStatus(template: LoopTemplate, opts?: PmIntegrationResolveOptions): PmIntegrationStatus;
export declare function isLoopPmTeamEnabled(template: LoopTemplate, opts?: PmIntegrationResolveOptions): boolean;
/** Dashboard / health label — Hermes + Pure ClosedLoop vs [DEPRECATED] legacy PM Team. */
export declare function formatPmIntegrationLabel(status: PmIntegrationStatus): string;
/** Structured log lines for loop mission startup (used when ModelRouter summary is skipped). */
export declare function logPmIntegrationMode(status: PmIntegrationStatus, templateName: string): void;
/**
 * ## Old PM Persona Deprecated — Pure ClosedLoop + @roland
 *
 * ```yaml
 * # Recommended: Pure ClosedLoop (default) — triage via @roland in Cursor
 * loop_engine:
 *   use_pm_team: false
 *
 * # [DEPRECATED] Legacy PM Team opt-in — advanced/legacy only
 * loop_engine:
 *   use_pm_team: true
 *
 * # Per-template legacy opt-in (feature-implementation-loop.yaml)
 * use_pm_team: true
 * pm_plan: auto
 * pm_act: auto
 * ```
 */
//# sourceMappingURL=loop-pm-policy.d.ts.map