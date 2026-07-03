/**
 * ## Assumptions
 * - Loop Engineering readiness checks run before heavy template missions.
 * - Validates ModelRouter dispatch, templates, config, template lint, and optional SDK context.
 * - Does not invoke live LLM calls — config + structural checks only.
 */
import { type ModelRouterValidation } from '../models/model-router.js';
import { type TemplateLintIssue } from './loop-templates.js';
export type ReadinessSeverity = 'error' | 'warn' | 'info';
export interface ReadinessCheck {
    id: string;
    ok: boolean;
    severity: ReadinessSeverity;
    message: string;
}
export interface LoopReadinessReport {
    ready: boolean;
    timestamp: number;
    checks: ReadinessCheck[];
    validation: ModelRouterValidation;
    defaultTemplate: string | null;
    dispatchSummary: string;
    templateLint: TemplateLintIssue[];
}
/** Run all Loop Engineering readiness checks (no network/LLM calls). */
export declare function runLoopReadinessCheck(options?: {
    configPath?: string;
}): LoopReadinessReport;
/** Human-readable report for CLI / CI. */
export declare function formatLoopReadinessReport(report: LoopReadinessReport): string;
//# sourceMappingURL=loop-readiness.d.ts.map