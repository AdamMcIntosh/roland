/**
 * Reflection phase — captures iteration learnings before the next pass.
 *
 * Writes structured reflections to LoopMemory (reflection.md + state.json).
 */

import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
import { Phase } from '../loop-phases.js';
import type { LoopMemory } from '../loop-memory.js';

export interface ReflectionPhaseHandlerOptions {
  memory?: LoopMemory;
}

export class ReflectionPhaseHandler implements PhaseHandler {
  readonly phase = Phase.Reflect;

  constructor(private readonly opts: ReflectionPhaseHandlerOptions = {}) {}

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const content = buildReflectionContent(ctx);
    let summary = `Reflection recorded for iteration ${ctx.iteration}`;

    if (this.opts.memory) {
      this.opts.memory.appendReflection(ctx.iteration, content);
      summary = `Reflection appended to ${this.opts.memory.loopId}/reflection.md`;
    }

    ctx.commandBoard?.appendBullet(
      'Key Decisions',
      `[REFLECT] Iteration ${ctx.iteration}: ${content.split('\n')[0]?.slice(0, 120) ?? 'learnings recorded'}`,
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

function buildReflectionContent(ctx: PhaseHandlerContext): string {
  const lines: string[] = [];
  lines.push(`**Goal:** ${ctx.goal}`);
  lines.push(`**Iteration:** ${ctx.iteration}`);

  const v = ctx.state.lastVerification;
  if (v) {
    lines.push(`**Verification:** ${v.summary}`);
    if (v.confidence != null) lines.push(`**Confidence:** ${v.confidence}`);
    if (v.accepted != null) lines.push(`**Accepted:** ${v.accepted}`);
  }

  const c = ctx.state.lastCritique;
  if (c) {
    lines.push(`**Critique decision:** ${c.retryDecision ?? 'n/a'}`);
    if (c.summary) lines.push(`**Critique summary:** ${c.summary}`);
    if (c.issues?.length) {
      lines.push('**Issues:**');
      for (const issue of c.issues.slice(0, 5)) {
        lines.push(`- ${issue}`);
      }
    }
  }

  const r = ctx.state.lastRetry;
  if (r) {
    lines.push(`**Retry strategy:** ${r.strategy} — focus: ${r.focusAreas.join(', ') || 'full scope'}`);
  }

  lines.push('');
  lines.push('**Learnings:**');
  lines.push(
    v?.accepted
      ? '- Verification gates passed; carry forward patterns that worked.'
      : '- Verification incomplete — prioritize failing gates on next iteration.',
  );
  if (c?.retryDecision === 'retry') {
    lines.push('- Critique requested retry — address identified gaps before re-verify.');
  }

  return lines.join('\n');
}

export { buildReflectionContent };
