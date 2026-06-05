/**
 * Mission Complete footer — promotes Next Steps to a prominent end-of-run section.
 *
 * Used by team-orchestrator (roland team) and exported for orchestrate post-processing.
 */

export interface MissionCompleteContext {
  goal: string;
  blockersEncountered: number;
  wavesRun: number;
  taskCount: number;
}

const MISSION_COMPLETE_BLOCK =
  /\n---\n+\s*###\s+(🎖\s+)?(UNSC\s+)?Mission Complete[\s\S]*?(?=\n##\s|$)/i;

/** Section headers whose body is extracted and moved to the Mission Complete footer. */
const NEXT_STEPS_SECTION =
  /(?:^|\n)(##\s+Next Steps|##\s+Immediate Next Steps|###\s+Next Steps|###\s+Immediate Next Steps)\s*\n([\s\S]*?)(?=\n##\s|\n---\n|$)/i;

/**
 * Extract a Next Steps section from synthesis body (if present).
 * Returns stripped body and extracted step content (without the header).
 */
export function extractNextStepsSection(synthesis: string): { body: string; nextSteps: string | null } {
  const match = synthesis.match(NEXT_STEPS_SECTION);
  if (!match) return { body: synthesis.trimEnd(), nextSteps: null };

  const nextSteps = match[2]?.trim() ?? null;
  const before = synthesis.slice(0, match.index).trimEnd();
  const after = synthesis.slice(match.index! + match[0].length).trimStart();
  const body = after ? `${before}\n\n${after}`.trimEnd() : before;
  return { body, nextSteps: nextSteps || null };
}

function buildDefaultNextSteps(ctx: MissionCompleteContext): string {
  if (ctx.blockersEncountered > 0) {
    return [
      `1. Resolve ${ctx.blockersEncountered} blocker(s) listed in 🔴 Release Blockers above.`,
      '2. Run the test suite to verify fixes:',
      '',
      '```bash',
      'npm run test:run',
      '```',
      '3. Continue with a focused follow-up:',
      '',
      '```bash',
      `roland team "Resolve blockers from: ${ctx.goal.slice(0, 80)}"`,
      '```',
    ].join('\n');
  }

  return [
    '1. Review artifacts and 🔴 Release Blockers (if any) in the synthesis above.',
    '2. Run the test suite:',
    '',
    '```bash',
    'npm run test:run',
    '```',
    '3. Commit when satisfied:',
    '',
    '```bash',
    'git add -A && git commit -m "feat: <describe changes>"',
    '```',
  ].join('\n');
}

/** Build the prominent Mission Complete footer (always the last section of stdout). */
export function formatMissionCompleteFooter(ctx: MissionCompleteContext, nextSteps: string | null): string {
  const taskLabel = ctx.taskCount === 1 ? '1 task' : `${ctx.taskCount} tasks`;
  const waveLabel = ctx.wavesRun === 1 ? '1 wave' : `${ctx.wavesRun} waves`;

  const statusLine =
    ctx.blockersEncountered > 0
      ? `**Handoff issued.** ${taskLabel} executed across ${waveLabel}. **${ctx.blockersEncountered} blocker(s)** require operator action before deployment — see 🔴 Release Blockers above.`
      : `**All objectives met.** ${taskLabel} executed across ${waveLabel}. Handoff is ready for operator review and deployment.`;

  const stepsContent = nextSteps?.trim() ? nextSteps.trim() : buildDefaultNextSteps(ctx);
  const goalSnippet = ctx.goal.length > 60 ? `${ctx.goal.slice(0, 60)}…` : ctx.goal;

  return [
    '---',
    '',
    '### 🎖 Mission Complete',
    '',
    statusLine,
    '',
    '#### Next Steps',
    '',
    stepsContent,
    '',
    '#### Battlespace Status',
    '',
    'Refresh mission intel at any time:',
    '',
    '```bash',
    'roland board-status --concise',
    '```',
    '',
    '#### Suggested Follow-Up Commands',
    '',
    '```bash',
    '# Full board digest (blockers first)',
    'roland board-status',
    '',
    '# Refine or extend this mission',
    `roland team "Continue from last run: ${goalSnippet}"`,
    '',
    '# Run test suite',
    'npm run test:run',
    '```',
  ].join('\n');
}

/**
 * Strip any prior Mission Complete footer, extract Next Steps from the body,
 * and append the standardized Mission Complete section as the final output.
 */
export function finalizeSynthesisOutput(synthesis: string, ctx: MissionCompleteContext): string {
  const { body: withStepsRemoved, nextSteps } = extractNextStepsSection(synthesis);
  const body = withStepsRemoved.replace(MISSION_COMPLETE_BLOCK, '').trimEnd();
  const footer = formatMissionCompleteFooter(ctx, nextSteps);
  return `${body.trimEnd()}\n\n${footer}\n`;
}
