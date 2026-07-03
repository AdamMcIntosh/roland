/**
 * ## Assumptions
 * - Loop Engineering readiness checks run before heavy template missions.
 * - Validates ModelRouter dispatch, templates, config, template lint, and optional SDK context.
 * - Does not invoke live LLM calls — config + structural checks only.
 */
import fs from 'fs';
import path from 'path';
import { ModelRouter, resetModelRouter, } from '../models/model-router.js';
import { LoopTemplates, lintAllLoopTemplates, CORE_GENERIC_TEMPLATES, } from './loop-templates.js';
import { loadLoopEngineConfig, clearLoopEngineConfigCache } from './loop-config.js';
import { resolvePmIntegrationStatus } from './loop-pm-policy.js';
function check(id, ok, message, severity = ok ? 'info' : 'error') {
    return { id, ok, severity, message };
}
/** Run all Loop Engineering readiness checks (no network/LLM calls). */
export function runLoopReadinessCheck(options = {}) {
    clearLoopEngineConfigCache();
    resetModelRouter();
    const checks = [];
    const loopCfg = loadLoopEngineConfig();
    checks.push(check('loop_config', true, `loop_engine loaded — default_dispatch=${loopCfg.defaultDispatch ?? 'cursor_sdk'} use_pm_team=${loopCfg.usePmTeam ?? false}`));
    const configCandidates = [
        options.configPath,
        path.join(process.cwd(), 'config.yaml'),
    ].filter(Boolean);
    const configFound = configCandidates.some((p) => fs.existsSync(p));
    checks.push(check('config_yaml', configFound, configFound ? 'config.yaml found' : 'config.yaml not found — using ModelRouter defaults', configFound ? 'info' : 'warn'));
    let router;
    try {
        router = ModelRouter.fromConfig(options.configPath);
        checks.push(check('model_router', true, 'ModelRouter initialized'));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        checks.push(check('model_router', false, `ModelRouter failed: ${msg}`));
        return {
            ready: false,
            timestamp: Date.now(),
            checks,
            validation: {
                ok: false,
                missing: [],
                warnings: [],
                dispatchWarnings: [],
                defaultDispatch: 'cursor_sdk',
                cursorSdkAvailable: false,
            },
            defaultTemplate: null,
            dispatchSummary: '',
            templateLint: [],
        };
    }
    const validation = ModelRouter.validateOnStartup(router);
    checks.push(check('required_roles', validation.ok, validation.ok
        ? 'Required loop roles resolve (pm, coding, critic, verifier)'
        : `Missing roles: ${validation.missing.join(', ')}`));
    for (const w of validation.warnings.slice(0, 3)) {
        checks.push(check('role_fallback', true, w, 'warn'));
    }
    for (const w of validation.dispatchWarnings) {
        checks.push(check('dispatch', true, w, 'warn'));
    }
    checks.push(check('cursor_sdk_key', validation.cursorSdkAvailable || validation.defaultDispatch === 'direct', validation.cursorSdkAvailable
        ? 'CURSOR_API_KEY set — SDK dispatch available'
        : validation.defaultDispatch === 'direct'
            ? 'Direct dispatch mode — CURSOR_API_KEY not required'
            : 'CURSOR_API_KEY missing — SDK default will fall back to direct provider at runtime', validation.cursorSdkAvailable ? 'info' : 'warn'));
    const coreRoles = ['pm', 'coding', 'critic', 'verifier'];
    for (const role of coreRoles) {
        const d = router.resolveDispatch(role, { log: false });
        checks.push(check(`dispatch_${role}`, Boolean(d.model), `${role}: ${d.method} → ${d.displayLabel} (${d.reason})`));
    }
    const templates = new LoopTemplates();
    const templateList = templates.list();
    checks.push(check('loop_templates', templateList.length > 0, `${templateList.length} loop template(s) loaded`));
    for (const err of templates.getLoadErrors()) {
        checks.push(check('template_load', false, `Malformed template ${err.file}: ${err.message}`));
    }
    const defaultName = loopCfg.default_template ?? 'standard-code-loop';
    const defaultTpl = templates.get(defaultName);
    checks.push(check('default_template', Boolean(defaultTpl), defaultTpl
        ? `Default template "${defaultTpl.name}" valid (${defaultTpl.phases.length} phases)`
        : `Default template "${defaultName}" not found`));
    if (defaultTpl) {
        const pmStatus = resolvePmIntegrationStatus(defaultTpl);
        checks.push(check('pm_integration_default', true, `Default template PM mode: ${pmStatus.enabled ? 'PM-Enhanced' : 'Pure ClosedLoop'} — ${pmStatus.reason}`));
    }
    for (const coreName of CORE_GENERIC_TEMPLATES) {
        const core = templates.get(coreName);
        checks.push(check(`core_template_${coreName}`, Boolean(core), core
            ? `${coreName}: ${core.phases.map((p) => p.phase).join('→')}`
            : `Missing core generic template "${coreName}"`));
    }
    const templateLint = lintAllLoopTemplates(templates);
    const lintErrors = templateLint.filter((i) => i.severity === 'error');
    const lintWarns = templateLint.filter((i) => i.severity === 'warn');
    checks.push(check('template_lint', lintErrors.length === 0, lintErrors.length === 0
        ? `Template lint passed (${templateList.length} templates, ${lintWarns.length} warn)`
        : `Template lint failed: ${lintErrors.length} error(s)`));
    for (const issue of lintErrors.slice(0, 5)) {
        checks.push(check(`lint_${issue.code}_${issue.template}`, false, `[${issue.template}] ${issue.message}`));
    }
    for (const issue of lintWarns.slice(0, 3)) {
        checks.push(check(`lint_${issue.code}_${issue.template}`, true, `[${issue.template}] ${issue.message}`, 'warn'));
    }
    const ready = checks.every((c) => c.ok || c.severity === 'warn');
    return {
        ready,
        timestamp: Date.now(),
        checks,
        validation,
        defaultTemplate: defaultTpl?.name ?? null,
        dispatchSummary: router.formatRoutingSummary(),
        templateLint,
    };
}
/** Human-readable report for CLI / CI. */
export function formatLoopReadinessReport(report) {
    const lines = [
        '═══════════════════════════════════════════════════════════',
        ' Loop Engineering Readiness Check',
        '═══════════════════════════════════════════════════════════',
        `Status: ${report.ready ? '✅ READY' : '❌ NOT READY'}`,
        `Dispatch: ${report.validation.defaultDispatch} · SDK key: ${report.validation.cursorSdkAvailable ? 'yes' : 'no'}`,
        `Default template: ${report.defaultTemplate ?? '(none)'}`,
        `Routing: ${report.dispatchSummary}`,
        '',
    ];
    const errors = report.checks.filter((c) => !c.ok && c.severity === 'error');
    const warns = report.checks.filter((c) => c.severity === 'warn' || (!c.ok && c.severity !== 'error'));
    const infos = report.checks.filter((c) => c.ok && c.severity === 'info');
    if (errors.length) {
        lines.push('Errors:');
        for (const c of errors)
            lines.push(`  ✗ [${c.id}] ${c.message}`);
        lines.push('');
    }
    if (warns.length) {
        lines.push('Warnings:');
        for (const c of warns)
            lines.push(`  ⚠ [${c.id}] ${c.message}`);
        lines.push('');
    }
    lines.push('Checks:');
    for (const c of report.checks.filter((x) => x.severity !== 'warn' && (x.ok || x.severity === 'error'))) {
        lines.push(`  ${c.ok ? '✓' : '✗'} [${c.id}] ${c.message}`);
    }
    if (infos.length) {
        lines.push('');
        lines.push('Info:');
        for (const c of infos.slice(0, 8))
            lines.push(`  · ${c.message}`);
    }
    lines.push('');
    lines.push(report.ready
        ? 'System is ready for Loop Engineering missions.'
        : 'Fix errors above before running complex loop templates.');
    return lines.join('\n');
}
//# sourceMappingURL=loop-readiness.js.map