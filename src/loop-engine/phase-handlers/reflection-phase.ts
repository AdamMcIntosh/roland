/**
 * ## Assumptions
 * - Reflection runs post-iteration when `template.reflection` is true or Reflect phase exists.
 * - Structured format follows loops.elorm.xyz reflection pattern for actionable learnings.
 * - Content is persisted to `.roland/loops/<loop-id>/reflection.md` via LoopMemory.
 * - Latest reflection is fed into Plan and Critique phases on subsequent iterations.
 */

import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import type { LoopMemory, StructuredReflection } from '../loop-memory.js';
import { formatSpecProgressSummary } from '../spec-progress.js';

export interface ReflectionPhaseHandlerOptions {
  memory?: LoopMemory;
}

export class ReflectionPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Reflect;

  constructor(private readonly opts: ReflectionPhaseHandlerOptions = {}) {}

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const structured = buildStructuredReflection(ctx);
    const content = formatStructuredReflection(ctx.iteration, structured);
    let summary = `Reflection recorded for iteration ${ctx.iteration}`;

    if (this.opts.memory) {
      this.opts.memory.appendReflection(ctx.iteration, content, structured);
      summary = `Reflection appended to ${this.opts.memory.loopId}/reflection.md`;
    }

    const preview =
      structured.keyLearnings[0] ??
      structured.whatWorkedWell[0] ??
      structured.whatFailed[0] ??
      'learnings recorded';

    ctx.commandBoard?.appendBullet(
      'Key Decisions',
      `[REFLECT] Iter ${ctx.iteration} (conf=${structured.confidenceScore ?? 'n/a'}): ${preview.slice(0, 100)}`,
    );

    ctx.blackboard.post({
      type: 'artifact',
      title: `Loop: Reflection (iteration ${ctx.iteration})`,
      content,
      status: 'done',
      author: 'loop-engine',
      priority: 'low',
      tags: ['loop', 'reflection'],
      relatedIds: [],
    });

    return { success: true, summary };
  }
}

function buildStructuredReflection(ctx: PhaseHandlerContext): StructuredReflection {
  const v = ctx.state.lastVerification;
  const c = ctx.state.lastCritique;
  const r = ctx.state.lastRetry;
  const spec = ctx.specProgress;

  const whatWorkedWell: string[] = [];
  const whatFailed: string[] = [];
  const keyLearnings: string[] = [];
  const nextStrategy: string[] = [];

  if (v?.accepted) {
    whatWorkedWell.push(`Verification accepted — ${v.summary}`);
    if (v.confidence != null) {
      whatWorkedWell.push(`Confidence reached ${Math.round(v.confidence * 100)}%`);
    }
    if (v.strategies?.length) {
      const passed = v.strategies.filter((s) => s.pass).map((s) => s.type);
      if (passed.length) whatWorkedWell.push(`Passing gates: ${passed.join(', ')}`);
    }
  } else if (v) {
    whatFailed.push(`Verification not accepted — ${v.summary}`);
    const failed = v.strategies?.filter((s) => !s.pass).map((s) => s.type) ?? [];
    if (failed.length) whatFailed.push(`Failing gates: ${failed.join(', ')}`);
  }

  if (c) {
    if (c.strengths?.length) {
      for (const s of c.strengths.slice(0, 3)) whatWorkedWell.push(s);
    }
    if (c.issues?.length) {
      for (const issue of c.issues.slice(0, 5)) whatFailed.push(issue);
    }
    if (c.suggestions?.length) {
      for (const s of c.suggestions.slice(0, 3)) nextStrategy.push(s);
    }
    if (c.retryDecision === 'retry' || c.retryDecision === 'retry_focused') {
      nextStrategy.push('Address critique issues before re-verify on next iteration.');
    } else if (c.retryDecision === 'proceed') {
      nextStrategy.push('Critique approved — maintain current approach and close remaining gaps.');
    }
  }

  if (r) {
    nextStrategy.push(`Retry strategy: ${r.strategy} — focus: ${r.focusAreas.join(', ') || 'full scope'}`);
  }

  if (spec && spec.total > 0) {
    keyLearnings.push(formatSpecProgressSummary(spec));
    if (!spec.allComplete) {
      const pending = spec.items.filter((i) => !i.complete).slice(0, 3).map((i) => i.text);
      nextStrategy.push(`Complete spec items: ${pending.join('; ')}`);
    } else {
      whatWorkedWell.push('All spec/checklist items marked complete.');
    }
  }

  if (v?.accepted) {
    keyLearnings.push('Carry forward patterns that passed verification gates.');
  } else {
    keyLearnings.push('Prioritize failing gates and critique issues on the next pass.');
  }

  if (c?.retryDecision === 'escalate') {
    keyLearnings.push('Escalation triggered — operator review required before continuing.');
  }

  const confidenceScore = deriveConfidenceScore(v?.confidence, v?.accepted, c?.retryDecision);

  return {
    whatWorkedWell: dedupe(whatWorkedWell),
    whatFailed: dedupe(whatFailed),
    keyLearnings: dedupe(keyLearnings),
    nextStrategy: dedupe(nextStrategy),
    confidenceScore,
  };
}

function deriveConfidenceScore(
  gateConfidence: number | undefined,
  accepted: boolean | undefined,
  retryDecision: string | undefined,
): number | null {
  if (gateConfidence == null) return null;
  let score = Math.round(gateConfidence * 100);
  if (accepted === false) score = Math.min(score, 49);
  if (retryDecision === 'escalate') score = Math.min(score, 25);
  if (retryDecision === 'proceed' && accepted) score = Math.max(score, 75);
  return Math.max(0, Math.min(100, score));
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Render the canonical structured reflection markdown block. */
export function formatStructuredReflection(
  iteration: number,
  structured: StructuredReflection,
): string {
  const lines: string[] = [];
  lines.push(`## Iteration ${iteration} Reflection`);
  lines.push('');
  lines.push('**What worked well:**');
  appendBullets(lines, structured.whatWorkedWell, '- (none recorded)');
  lines.push('');
  lines.push('**What failed / needs improvement:**');
  appendBullets(lines, structured.whatFailed, '- (none recorded)');
  lines.push('');
  lines.push('**Key learnings:**');
  appendBullets(lines, structured.keyLearnings, '- (none recorded)');
  lines.push('');
  lines.push('**Next iteration strategy:**');
  appendBullets(lines, structured.nextStrategy, '- Continue current approach');
  lines.push('');
  lines.push(
    `**Confidence in current approach (0-100):** ${structured.confidenceScore ?? 'n/a'}`,
  );
  return lines.join('\n');
}

function appendBullets(lines: string[], items: string[], fallback: string): void {
  if (items.length === 0) {
    lines.push(fallback);
    return;
  }
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

/** Parse structured reflection sections from markdown content (for dashboard/history). */
export function parseStructuredReflection(content: string): StructuredReflection | null {
  if (!content.includes('## Iteration') || !content.includes('**What worked well:**')) {
    return null;
  }
  return {
    whatWorkedWell: extractSection(content, '**What worked well:**', '**What failed'),
    whatFailed: extractSection(content, '**What failed / needs improvement:**', '**Key learnings'),
    keyLearnings: extractSection(content, '**Key learnings:**', '**Next iteration'),
    nextStrategy: extractSection(content, '**Next iteration strategy:**', '**Confidence'),
    confidenceScore: extractConfidence(content),
  };
}

function extractSection(content: string, startMarker: string, endMarker: string): string[] {
  const start = content.indexOf(startMarker);
  if (start < 0) return [];
  const afterStart = content.slice(start + startMarker.length);
  const end = afterStart.indexOf(endMarker);
  const block = end >= 0 ? afterStart.slice(0, end) : afterStart;
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') && !l.includes('(none recorded)'))
    .map((l) => l.slice(2).trim());
}

function extractConfidence(content: string): number | null {
  const match = content.match(/\*\*Confidence in current approach \(0-100\):\*\*\s*(\d+|n\/a)/i);
  if (!match || match[1] === 'n/a') return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** @deprecated Use formatStructuredReflection — kept for tests importing buildReflectionContent. */
function buildReflectionContent(ctx: PhaseHandlerContext): string {
  return formatStructuredReflection(ctx.iteration, buildStructuredReflection(ctx));
}

export { buildReflectionContent, buildStructuredReflection };

/**
 * ## Reflection + Spec-First Integration Complete
 *
 * Reflections are saved to `.roland/loops/<loop-id>/reflection.md` in a consistent format.
 * The latest reflection is injected into Plan and Critique phase context on subsequent iterations.
 */
