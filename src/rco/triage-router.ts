/**
 * ## Assumptions
 * - Hermes is the primary PM / strategist; Roland ClosedLoop is the execution engine.
 * - Pure ClosedLoop (use_pm_team: false) is the default and recommended path.
 * - [DEPRECATED] Legacy LeadPM / PM Team paths are not suggested by the triage router.
 * - Embedded in Cursor rules (.cursor/rules/triage-router.mdc) and Hermes skill (.hermes/SKILL.md).
 */

/** Canonical Roland Triage Router system prompt — keep in sync with .hermes/SKILL.md and triage-router.mdc */
export const TRIAGE_ROUTER_PROMPT = `You are the Roland Triage Router — a fast, expert assistant that helps route tasks directly to Roland's mature ClosedLoop harness while working inside the Roland codebase.

## Core Principles

- **Hermes** is the primary Project Manager / strategist (high-level planning and decomposition).
- **Roland** is the specialized execution engine (ClosedLoop).
- Always prefer **Pure ClosedLoop** (\`use_pm_team: false\`).
- Use generic, reusable loop templates.
- [DEPRECATED] Old LeadPM / PM Team paths — do not suggest unless the user explicitly requests legacy PM behavior.

## Available Templates (in order of preference)

1. \`full-cycle-verified-loop\` — Default / recommended for most tasks
2. \`feature-implementation-loop\` — New features
3. \`refactor-and-modernize-loop\` — Refactoring and cleanup
4. \`research-and-spec-loop\` — Research and design work

## Response Format (Always Use This)

**Recommended Action:**
\`\`\`bash
roland team "Clear and specific goal" --loop-template full-cycle-verified-loop
\`\`\`

**Why this template?** [One sentence]

**Acceptance Criteria:**
- [Bullet points]

**Notes:**
- Any relevant context, risks, or suggestions specific to the Roland codebase

## Key Guidelines

- Default to Pure ClosedLoop unless the user explicitly requests legacy PM behavior.
- Old LeadPM / PM Team paths are deprecated — avoid suggesting them.
- Be concise, decisive, and execution-oriented.
- If the user wants high-level planning or multi-step orchestration, recommend using **Hermes** first (\`roland chat\`, Cursor \`@roland\`).
- For monitoring a running loop, suggest opening the Roland dashboard (\`npm run serve-dashboard\` → http://127.0.0.1:8081).

You have deep knowledge of Roland's architecture (ClosedLoop, ModelRouter, generic templates, HITL, dashboard, etc.).`;

export interface LoopTemplateRecommendation {
  template: string;
  reason: string;
}

const TEMPLATE_CATALOG: Array<{
  template: string;
  reason: string;
  patterns: RegExp[];
}> = [
  {
    template: 'refactor-and-modernize-loop',
    reason: 'Refactoring or cleanup without behavior change — lint, unit, and typecheck gates.',
    patterns: [
      /\b(refactor|modernize|modernise|cleanup|clean up|de-slop|technical debt|rewrite|restructure)\b/i,
    ],
  },
  {
    template: 'research-and-spec-loop',
    reason: 'Research and design work that produces an actionable spec before implementation.',
    patterns: [
      /\b(research|investigate|explore options|specification|design doc|architecture review|feasibility)\b/i,
    ],
  },
  {
    template: 'feature-implementation-loop',
    reason: 'New feature delivery with unit, integration, and smoke verification gates.',
    patterns: [
      /\b(feature|implement|add|ship|build|endpoint|page|component|api|mcp tool|handler)\b/i,
    ],
  },
  {
    template: 'full-cycle-verified-loop',
    reason: 'Default production loop — reflection, exit conditions, and full verification gates.',
    patterns: [],
  },
];

/** Pick the best generic loop template for a goal (Pure ClosedLoop default). */
export function recommendLoopTemplate(message: string): LoopTemplateRecommendation {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Research template only when research intent dominates (not a ship/implement ask)
  const researchHit = TEMPLATE_CATALOG[1]!.patterns.some((p) => p.test(lower));
  const implementHit = /\b(implement|ship|add|build|deploy|code)\b/i.test(lower);
  if (researchHit && !implementHit) {
    return { template: TEMPLATE_CATALOG[1]!.template, reason: TEMPLATE_CATALOG[1]!.reason };
  }

  for (const entry of TEMPLATE_CATALOG) {
    if (entry.template === 'research-and-spec-loop') continue;
    if (entry.template === 'full-cycle-verified-loop') continue;
    if (entry.patterns.some((p) => p.test(lower))) {
      return { template: entry.template, reason: entry.reason };
    }
  }

  const defaultEntry = TEMPLATE_CATALOG[TEMPLATE_CATALOG.length - 1]!;
  return { template: defaultEntry.template, reason: defaultEntry.reason };
}

export function escapeGoalForShell(goal: string): string {
  return goal.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Build a Pure ClosedLoop team command with the recommended template. */
export function buildRolandTeamCommand(goal: string, template: string): string {
  const escaped = escapeGoalForShell(goal);
  return `roland team "${escaped}" --loop-template ${template}`;
}
