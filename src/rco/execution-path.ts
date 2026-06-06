/**
 * Roland execution-path triage — Direct (Cursor chat) vs Team (roland team / roland_run_team).
 *
 * Used by:
 *   - MCP `triage` tool (execution_path field)
 *   - Orchestrator / Roland system prompts (EXECUTION_PATH_FRAMEWORK)
 *   - Unit tests for routing examples
 */

export type ExecutionPath = 'direct' | 'team';

export interface ExecutionPathDecision {
  path: ExecutionPath;
  reasons: string[];
  /** Rough effort estimate in minutes */
  estimatedMinutes: number;
  /** When path is 'team', the offer line Roland shows before spawning */
  teamOffer: string | null;
  /** One-line visible summary for the operator */
  summary: string;
  /** True when operator used a force-team trigger — bypasses normal scoring */
  forced?: boolean;
  /** Goal with force-team triggers stripped (for roland_run_team / roland team) */
  cleanedGoal?: string;
}

/** Case-insensitive triggers that force Team path regardless of task size. */
export const FORCE_TEAM_TRIGGERS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /--force-team\b/i, label: '--force-team' },
  { pattern: /\bforce team\b/i, label: 'force team' },
  { pattern: /\bfull team\b/i, label: 'full team' },
  { pattern: /\brun as team\b/i, label: 'run as team' },
  { pattern: /\bspawn team\b/i, label: 'spawn team' },
];

/** Detect power-user force-team override in the operator message. */
export function detectForceTeam(message: string): boolean {
  return FORCE_TEAM_TRIGGERS.some(({ pattern }) => pattern.test(message));
}

/** Return the matched force-team trigger label, if any. */
export function matchedForceTeamTrigger(message: string): string | null {
  for (const { pattern, label } of FORCE_TEAM_TRIGGERS) {
    if (pattern.test(message)) return label;
  }
  return null;
}

/** Strip force-team triggers so the remainder is a clean goal for PM team runs. */
export function stripForceTeamTriggers(message: string): string {
  let result = message;
  for (const { pattern } of FORCE_TEAM_TRIGGERS) {
    result = result.replace(pattern, ' ');
  }
  return result
    .replace(/\s+/g, ' ')
    .replace(/^\s*[:\-–—]\s*/, '')
    .trim();
}

/** Embedded in Roland system prompts — keep in sync with classifyExecutionPath heuristics. */
export const EXECUTION_PATH_FRAMEWORK = `## Execution Path Triage (mandatory — every new request)

Before acting, classify the request as **Direct** or **Team**. State your decision visibly in one line (use the \`summary\` shape from \`triage\` when available).

### Direct — handle in this Cursor chat (fast path)

- Small, **single-file** edits (comment, typo, rename, one-liner)
- Simple questions, debugging help, research, or quick fixes
- Clarifications or planning discussions (no implementation yet)
- Tasks estimated **< 30 minutes**
- No structured tests, blackboard waves, or Sparrow + Vanguard collaboration required

**When Direct:** proceed immediately with Cursor tools. Do **not** call \`roland_run_team\`.

### Team — spawn \`roland team\` / \`roland_run_team\` (full mission)

- Multi-step features or refactors
- Multiple files / components / services
- Needs testing, Command Blackboard tracking, synthesis, or structured waves
- Estimated **> 30–45 minutes**
- Benefits from Sparrow (implement) + Vanguard (test-author → test-executor) + Sentinel review

**When Team:** do **not** start implementing in chat. Respond with:

> This is a good candidate for a full team mission. Shall I start \`roland team "<goal>"\` now?

Wait for operator confirmation unless they explicitly asked to launch the team.

### Force-team override (power user)

Operators can bypass scoring and force **Team** with any of these triggers (case-insensitive):

- \`--force-team\`
- \`force team\`
- \`full team\`
- \`run as team\`
- \`spawn team\`

Examples: \`Add a comment to index.js --force-team\` · \`Just do the full team run: improve the logger\`

**When force-team is detected:** skip normal triage scoring, respond *"Understood — forcing full team mission."*, and call \`roland_run_team\` immediately (no confirmation). Use \`cleanedGoal\` from \`triage\` — triggers stripped from the message.

### Trade-offs

| Path | Pros | Cons |
|------|------|------|
| **Direct** | Fast feedback, low overhead, ideal for Q&A and tiny edits | Loses PM waves, blackboard, synthesis, and test orchestration |
| **Team** | Parallel callsigns, blockers surfaced, tests wired, Mission Complete footer | Higher latency and token cost; overkill for trivial edits |`;

const DIRECT_SIGNALS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /\badd (a )?comment\b/i, reason: 'Single-file comment edit', weight: 5 },
  { pattern: /\b(fix|correct) (a )?(typo|spelling)\b/i, reason: 'Typo or spelling fix', weight: 5 },
  { pattern: /\b(rename|remove unused|delete unused)\b/i, reason: 'Small rename or cleanup', weight: 4 },
  { pattern: /\b(why|how does|how do|what is|what are|explain|describe)\b/i, reason: 'Question or explanation', weight: 4 },
  { pattern: /\b(debug help|help me debug|investigate why)\b/i, reason: 'Debugging assistance', weight: 3 },
  { pattern: /\b(clarify|clarification|planning discussion|discuss approach)\b/i, reason: 'Planning or clarification', weight: 4 },
  { pattern: /\bquick fix\b/i, reason: 'Explicit quick fix', weight: 4 },
  { pattern: /\bone[- ]line(r)?\b/i, reason: 'One-liner scope', weight: 4 },
  { pattern: /\b(read|show|list|find where)\b/i, reason: 'Read-only research', weight: 3 },
];

const TEAM_SIGNALS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /\brefactor\b/i, reason: 'Multi-step refactor', weight: 5 },
  { pattern: /\bimplement\b/i, reason: 'Feature implementation', weight: 4 },
  { pattern: /\b(multi[- ]step|end[- ]to[- ]end|full feature|complete)\b/i, reason: 'Multi-step or full feature', weight: 5 },
  { pattern: /\b(test|tests|testing|unit test|regression|e2e|test suite)\b/i, reason: 'Requires test orchestration', weight: 4 },
  { pattern: /\b(blackboard|command blackboard|synthesis|structured waves?)\b/i, reason: 'Blackboard / synthesis workflow', weight: 5 },
  { pattern: /\b(migration|migrate|rewrite|overhaul)\b/i, reason: 'Large migration or rewrite', weight: 5 },
  { pattern: /\b(oauth|authentication system|authorization flow)\b/i, reason: 'Cross-cutting auth work', weight: 4 },
  { pattern: /\bsecurity audit\b/i, reason: 'Security audit scope', weight: 5 },
  { pattern: /\b(across|throughout|multiple files|several files|all endpoints|every route)\b/i, reason: 'Multi-file / multi-component scope', weight: 4 },
  { pattern: /\b\w+\s+service\b/i, reason: 'Service-level change', weight: 3 },
  { pattern: /\b(integrate|integration with)\b/i, reason: 'Integration work', weight: 3 },
  { pattern: /\b(with pino|with winston|with logging|structured logging|request logging)\b/i, reason: 'Structured logging feature', weight: 4 },
  { pattern: /\bsparrow\b.*\bvanguard\b|\bvanguard\b.*\bsparrow\b/i, reason: 'Explicit Sparrow + Vanguard collaboration', weight: 6 },
];

const SINGLE_FILE_PATTERN =
  /\b(?:to|in|on|into|file)\s+[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|md|yaml|yml)\b/i;

const MULTI_FILE_PATTERN =
  /\b(across|throughout|multiple files|several files|all endpoints|every route|components?)\b/i;

function escapeGoalForShell(goal: string): string {
  return goal.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Classify whether Roland should act in chat (direct) or offer a PM team run (team). */
export function classifyExecutionPath(message: string): ExecutionPathDecision {
  const trimmed = message.trim();

  if (!trimmed) {
    return {
      path: 'direct',
      reasons: ['Empty message — default to direct'],
      estimatedMinutes: 5,
      teamOffer: null,
      summary: '**Execution path:** Direct (default)',
    };
  }

  const forceTrigger = matchedForceTeamTrigger(trimmed);
  if (forceTrigger) {
    const cleanedGoal = stripForceTeamTriggers(trimmed) || trimmed;
    const escapedGoal = escapeGoalForShell(cleanedGoal);
    return {
      path: 'team',
      forced: true,
      cleanedGoal,
      reasons: [`Force-team override (${forceTrigger}) — bypassing normal triage scoring`],
      estimatedMinutes: 45,
      teamOffer: `Understood — forcing full team mission. Launch \`roland team "${escapedGoal}"\` now (no confirmation needed).`,
      summary: '**Execution path:** Team — force-team override (operator request)',
    };
  }

  let score = 0;
  const reasons: string[] = [];

  for (const { pattern, reason, weight } of DIRECT_SIGNALS) {
    if (pattern.test(trimmed)) {
      score -= weight;
      reasons.push(`Direct: ${reason}`);
    }
  }

  for (const { pattern, reason, weight } of TEAM_SIGNALS) {
    if (pattern.test(trimmed)) {
      score += weight;
      reasons.push(`Team: ${reason}`);
    }
  }

  const hasSingleFile = SINGLE_FILE_PATTERN.test(trimmed);
  const hasMultiFile = MULTI_FILE_PATTERN.test(trimmed);

  if (hasSingleFile && !hasMultiFile) {
    score -= 3;
    reasons.push('Direct: Single file target mentioned');
  }

  if (hasMultiFile) {
    score += 3;
    if (!reasons.some((r) => r.includes('Multi-file'))) {
      reasons.push('Team: Multi-file / multi-component scope');
    }
  }

  const path: ExecutionPath = score >= 3 ? 'team' : 'direct';
  const estimatedMinutes =
    path === 'team' ? Math.max(45, 30 + Math.min(score, 8) * 5) : score <= -5 ? 5 : Math.max(10, 25 + score * 2);

  const escapedGoal = escapeGoalForShell(trimmed);
  const teamOffer =
    path === 'team'
      ? `This is a good candidate for a full team mission. Shall I start \`roland team "${escapedGoal}"\` now?`
      : null;

  const directReasons = reasons.filter((r) => r.startsWith('Direct')).slice(0, 2);
  const teamReasons = reasons.filter((r) => r.startsWith('Team')).slice(0, 2);

  const summary =
    path === 'team'
      ? `**Execution path:** Team — ${teamReasons.join('; ') || 'Complexity warrants PM orchestration'} (~${estimatedMinutes}+ min)`
      : `**Execution path:** Direct — ${directReasons.join('; ') || 'Small, focused task'} (~${estimatedMinutes} min)`;

  return { path, reasons, estimatedMinutes, teamOffer, summary };
}
