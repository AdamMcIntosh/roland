/**
 * Mission Complete footer — promotes Next Steps to a prominent end-of-run section.
 *
 * Used by team-orchestrator (roland team) and exported for orchestrate post-processing.
 */

import { HARDENING_BLOCKER_PATTERNS, isMinimalGoal } from './goal-scope.js';

export interface MissionCompleteContext {
  goal: string;
  blockersEncountered: number;
  wavesRun: number;
  taskCount: number;
  /** When true, use abbreviated footer and strip verbose synthesis sections. */
  minimalGoal?: boolean;
}

const MISSION_COMPLETE_HEADING = /###\s+(🎖\s+)?(UNSC\s+)?Mission Complete/i;

/** Footer block preceded by --- (canonical orchestrator format). */
const MISSION_COMPLETE_BLOCK =
  /\n---\n+\s*###\s+(🎖\s+)?(UNSC\s+)?Mission Complete[\s\S]*$/i;

/** Strip any prior Mission Complete footer the PM may have written despite instructions. */
export function stripMissionCompleteFooter(synthesis: string): string {
  let body = synthesis.replace(MISSION_COMPLETE_BLOCK, '').trimEnd();
  const match = body.match(MISSION_COMPLETE_HEADING);
  if (match?.index != null && match.index >= 0) {
    body = body.slice(0, match.index).trimEnd();
  }
  return body;
}

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

/** Remove a markdown ##/### section by heading title (case-insensitive). */
function stripSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:^|\\n)(#{1,3}\\s+${escaped})\\s*\\n[\\s\\S]*?(?=\\n#{1,3}\\s|\\n---\\n|$)`,
    'i',
  );
  const stripped = body.replace(re, '');
  // Also remove if section runs to EOF without a following header
  const reToEnd = new RegExp(`(?:^|\\n)(#{1,3}\\s+${escaped})\\s*\\n[\\s\\S]*$`, 'i');
  return stripped.replace(reToEnd, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** Strip machine-parsed / verbose sections already handled elsewhere. */
function stripNonDisplaySections(body: string, minimal: boolean): string {
  const alwaysStrip = [
    'Memory Extract',
    'Knowledge Update',
    'Pre-Synthesis Checklist',
    'Pre-Synthesis Assessment',
    'Deployment Checklist',
  ];
  let out = body;
  for (const h of alwaysStrip) out = stripSection(out, h);

  if (minimal) {
    for (const h of ['Risk Register', 'Key Decisions Made']) {
      out = stripSection(out, h);
    }
    out = collapseEmptyActionTiers(out);
  }

  return out.trimEnd();
}

/** When 🟡/🟢 subsections are all "None", drop them to reduce noise. */
function collapseEmptyActionTiers(body: string): string {
  let out = body;
  for (const tier of ['🟡 Pre-Production Checklist', '🟢 Backlog / V2', '🟢 Backlog']) {
    const re = new RegExp(
      `(\\n###\\s+${tier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*\\n(?:[^\\n]*none[^\\n]*\\n?)`,
      'i',
    );
    out = out.replace(re, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** Remove hardening-themed false blockers from minimal-task synthesis. */
export function sanitizeReleaseBlockersForMinimalGoal(body: string): string {
  const sectionRe = /(###\s+🔴\s+Release Blockers\s*\n)([\s\S]*?)(?=\n###\s|\n##\s|\n---\n|$)/i;
  const match = body.match(sectionRe);
  if (!match) return body;

  const [, header, content] = match;
  const noneLine = /🔴\s*none|no release blockers|all features delivered/i.test(content);
  if (noneLine) return body;

  const lines = content.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isNumberedBlocker = /^\d+[\.)]\s/.test(trimmed) || /^[-*]\s/.test(trimmed);
    if (!isNumberedBlocker) {
      kept.push(line);
      continue;
    }
    const isHardeningOnly = HARDENING_BLOCKER_PATTERNS.some((p) => p.test(trimmed));
    if (!isHardeningOnly) kept.push(line);
  }

  const filtered = kept.join('\n').trim();
  const hasRealBlocker = /^\d+[\.)]\s/m.test(filtered) || /^[-*]\s/m.test(filtered);
  const replacement = hasRealBlocker
    ? `${header}${filtered}\n`
    : `${header}🔴 None — requested change delivered; no deployment blockers for this scope.\n`;

  return body.replace(sectionRe, replacement);
}

/** Compact synthesis body before the Mission Complete footer is appended. */
export function compactSynthesisBody(body: string, goal: string): string {
  const minimal = isMinimalGoal(goal);
  let out = stripNonDisplaySections(body, minimal);
  if (minimal) out = sanitizeReleaseBlockersForMinimalGoal(out);
  return out.trimEnd();
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

  if (ctx.minimalGoal) {
    return [
      '1. Review the diff:',
      '',
      '```bash',
      'git diff',
      '```',
      '2. Run targeted tests if applicable:',
      '',
      '```bash',
      'npm run test:run',
      '```',
      '3. Commit when satisfied:',
      '',
      '```bash',
      'git add -A && git commit -m "chore: <describe change>"',
      '```',
    ].join('\n');
  }

  return [
    '1. Review the diff and any 🔴 Release Blockers above.',
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
  const minimal = ctx.minimalGoal ?? isMinimalGoal(ctx.goal);

  const statusLine =
    ctx.blockersEncountered > 0
      ? `**Handoff issued.** ${taskLabel} across ${waveLabel}. **${ctx.blockersEncountered} blocker(s)** — see 🔴 Release Blockers above.`
      : minimal
        ? `**Done.** ${taskLabel} across ${waveLabel}. Change ready for review.`
        : `**All objectives met.** ${taskLabel} across ${waveLabel}. Handoff ready for review.`;

  const stepsContent = nextSteps?.trim() ? nextSteps.trim() : buildDefaultNextSteps({ ...ctx, minimalGoal: minimal });

  if (minimal) {
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
    ].join('\n');
  }

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
    '```bash',
    'roland board-status --concise',
    '```',
    '',
    '#### Suggested Follow-Up Commands',
    '',
    '```bash',
    'roland board-status',
    `roland team "Continue from last run: ${goalSnippet}"`,
    'npm run test:run',
    '```',
  ].join('\n');
}

/** Ensure nothing appears after the canonical Mission Complete footer block. */
export function ensureFooterIsTerminal(output: string): string {
  const match = output.match(/\n---\n+\s*### 🎖 Mission Complete[\s\S]*$/);
  if (!match) return output.trimEnd();

  const start = output.lastIndexOf('\n---\n');
  const footerBlock = output.slice(start).trimEnd();
  const body = output.slice(0, start).trimEnd();
  return body ? `${body}\n\n${footerBlock}\n` : `${footerBlock}\n`;
}

/**
 * Strip any prior Mission Complete footer, extract Next Steps from the body,
 * compact the synthesis, and append the standardized Mission Complete section.
 */
export function finalizeSynthesisOutput(synthesis: string, ctx: MissionCompleteContext): string {
  const minimalGoal = ctx.minimalGoal ?? isMinimalGoal(ctx.goal);
  const { body: withStepsRemoved, nextSteps } = extractNextStepsSection(synthesis);
  const stripped = stripMissionCompleteFooter(withStepsRemoved);
  const body = compactSynthesisBody(stripped, ctx.goal);
  const footer = formatMissionCompleteFooter({ ...ctx, minimalGoal }, nextSteps);
  const trimmedBody = body.trimEnd();
  const combined = trimmedBody ? `${trimmedBody}\n\n${footer}` : footer;
  return ensureFooterIsTerminal(combined);
}
