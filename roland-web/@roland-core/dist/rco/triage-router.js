/**
 * ## P2 Polish & Reach
 *
 * Roland Triage Router — routes tasks to Pure ClosedLoop templates using regex signals
 * (primary) plus cheap structural signals as tie-breakers (diff size, file types, familiarity).
 */
import { gatherStructuralSignals, structuralTemplateBias, } from './triage-structural.js';
/** Canonical Roland Triage Router system prompt — keep in sync with triage-router.mdc */
export const TRIAGE_ROUTER_PROMPT = `You are the Roland Triage Router — a fast, expert assistant that helps route tasks directly to Roland's mature ClosedLoop harness while working inside the Roland codebase.

## Core Principles

- **In Cursor:** \`@roland\` + MCP (\`triage\`, \`roland_run_team\`) is the full PM + triage interface — no separate Hermes layer required.
- **Roland** is the specialized execution engine (ClosedLoop).
- Always prefer **Pure ClosedLoop** (\`use_pm_team: false\`).
- Use generic, reusable loop templates.
- [DEPRECATED] Old LeadPM / PM Team paths — do not suggest unless the user explicitly requests legacy PM behavior.
- **Hermes** (\`roland chat\` CLI) is optional — for terminal-only workflows outside Cursor; do not tell Cursor users they need it.

## Available Templates (7 canonical)

1. \`small-fix-loop\` — Small bug fixes, hotfixes, typos, minor changes (fast; unit tests optional)
2. \`standard-code-loop\` — **Default** for most software work (plan → act → verify → critique)
3. \`feature-implementation-loop\` — New features with integration/smoke gates
4. \`refactor-and-modernize-loop\` — Refactoring and cleanup
5. \`research-and-plan-loop\` — Research and design work (produces actionable plan/spec)
6. \`full-cycle-verified-loop\` — Heavy verification, reflection, exit conditions
7. \`maintenance-loop\` — Dependency updates, CI/lint hygiene, chores

## Response Format (Always Use This)

**Recommended Action:**
\`\`\`bash
roland team "Clear and specific goal"
\`\`\`

Optional template override:
\`\`\`bash
roland team "Clear and specific goal" --loop-template standard-code-loop
\`\`\`

**Why this template?** [One sentence]

**Acceptance Criteria:**
- [Bullet points]

## Key Guidelines

- Default to \`standard-code-loop\` unless scope signals a different template.
- Post-run reconstruction: \`roland mission-audit --last --format markdown\`.
- Dashboard (\`npm run serve-dashboard\`) is a **read-only monitor** — launch missions via CLI.

You have deep knowledge of Roland's architecture (ClosedLoop, ModelRouter, generic templates, HITL, dashboard, etc.).`;
const REGEX_WEIGHT = 2.5;
const STRUCTURAL_WEIGHT = 0.35;
const TEMPLATE_CATALOG = [
    {
        template: 'small-fix-loop',
        reason: 'Small bug fix, hotfix, typo, or minor change — fast loop with optional unit tests.',
        regexScore: 4,
        patterns: [
            /\b(small fix|hotfix|quick fix|minor (change|fix|update|improvement)|cosmetic|patch)\b/i,
            /\bfix (a )?(small|minor|simple|quick)\b/i,
            /\b(fix|correct) (a )?(typo|spelling|word)\b/i,
            /\b(one[- ]line(r)?|tiny change|trivial fix)\b/i,
        ],
    },
    {
        template: 'maintenance-loop',
        reason: 'Maintenance, dependency updates, CI/lint hygiene, or repo chores.',
        regexScore: 4,
        patterns: [
            /\b(maintenance|dependenc(y|ies)|upgrade packages?|bump version|ci fix|lint fix|housekeeping)\b/i,
        ],
    },
    {
        template: 'refactor-and-modernize-loop',
        reason: 'Refactoring or cleanup without behavior change — lint, unit, and typecheck gates.',
        regexScore: 4,
        patterns: [
            /\b(refactor|modernize|modernise|cleanup|clean up|de-slop|technical debt|rewrite|restructure)\b/i,
        ],
    },
    {
        template: 'research-and-plan-loop',
        reason: 'Research and design work that produces an actionable plan or spec before implementation.',
        regexScore: 4,
        patterns: [
            /\b(research|investigate|explore options|specification|design doc|architecture review|feasibility)\b/i,
        ],
    },
    {
        template: 'feature-implementation-loop',
        reason: 'New feature delivery with unit, integration, and smoke verification gates.',
        regexScore: 3,
        patterns: [
            /\b(feature|implement|add|ship|build|endpoint|page|component|api|mcp tool|handler)\b/i,
        ],
    },
    {
        template: 'full-cycle-verified-loop',
        reason: 'Heavy verification loop — reflection, exit conditions, and full verification gates.',
        regexScore: 2,
        patterns: [
            /\b(full verification|heavy verification|production hardening|security audit|comprehensive test)\b/i,
        ],
    },
    {
        template: 'standard-code-loop',
        reason: 'Default software loop — plan, implement, verify, critique for most work.',
        regexScore: 1,
        patterns: [],
    },
];
function scoreTemplates(message, structural) {
    const lower = message.trim().toLowerCase();
    const scores = new Map();
    for (const entry of TEMPLATE_CATALOG) {
        scores.set(entry.template, { score: 0, reasons: [] });
    }
    let topRegexScore = 0;
    for (const entry of TEMPLATE_CATALOG) {
        if (entry.patterns.some((p) => p.test(lower))) {
            const cur = scores.get(entry.template);
            cur.score += entry.regexScore * REGEX_WEIGHT;
            cur.reasons.push(`Regex: matched ${entry.template}`);
            topRegexScore = Math.max(topRegexScore, cur.score);
        }
    }
    const applyStructural = topRegexScore < REGEX_WEIGHT * 2;
    if (applyStructural && structural.available) {
        const bias = structuralTemplateBias(structural);
        if (bias.smallFixWeight > 0) {
            const cur = scores.get('small-fix-loop');
            cur.score += bias.smallFixWeight * STRUCTURAL_WEIGHT;
            cur.reasons.push(...bias.reasons);
        }
        if (bias.verificationWeight > 0) {
            const cur = scores.get('full-cycle-verified-loop');
            cur.score += bias.verificationWeight * STRUCTURAL_WEIGHT;
            cur.reasons.push(...bias.reasons);
        }
        if (bias.researchWeight > 0) {
            const cur = scores.get('research-and-plan-loop');
            cur.score += bias.researchWeight * STRUCTURAL_WEIGHT;
            cur.reasons.push(...bias.reasons);
        }
    }
    const standard = scores.get('standard-code-loop');
    if (topRegexScore === 0) {
        standard.score = 3;
        standard.reasons.push('Default: standard-code-loop (no regex match)');
    }
    else if (standard.score === 0) {
        standard.score = 1;
        standard.reasons.push('Default: standard-code-loop');
    }
    return scores;
}
/** Pick the best generic loop template for a goal (Pure ClosedLoop default). */
export function recommendLoopTemplate(message, projectRoot) {
    const trimmed = message.trim();
    const structural = gatherStructuralSignals(projectRoot ?? process.cwd());
    const scores = scoreTemplates(trimmed, structural);
    const researchHit = /\b(research|investigate|explore options|specification|design doc)\b/i.test(trimmed);
    const implementHit = /\b(implement|ship|add|build|deploy|code)\b/i.test(trimmed);
    if (researchHit && !implementHit) {
        const entry = TEMPLATE_CATALOG.find((e) => e.template === 'research-and-plan-loop');
        return {
            template: entry.template,
            reason: entry.reason,
            signals: structural.available ? structuralTemplateBias(structural).reasons : undefined,
        };
    }
    let best = 'standard-code-loop';
    let bestScore = -1;
    const allReasons = [];
    for (const [template, { score, reasons }] of scores) {
        if (score > bestScore) {
            bestScore = score;
            best = template;
            allReasons.length = 0;
            allReasons.push(...reasons);
        }
    }
    const entry = TEMPLATE_CATALOG.find((e) => e.template === best) ?? TEMPLATE_CATALOG[TEMPLATE_CATALOG.length - 1];
    return {
        template: entry.template,
        reason: entry.reason,
        signals: allReasons.length ? allReasons : undefined,
    };
}
export function escapeGoalForShell(goal) {
    return goal.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
/** Build a Pure ClosedLoop team command with the recommended template. */
export function buildRolandTeamCommand(goal, template) {
    const escaped = escapeGoalForShell(goal);
    return `roland team "${escaped}" --loop-template ${template}`;
}
//# sourceMappingURL=triage-router.js.map