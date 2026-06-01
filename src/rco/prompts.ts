/**
 * RCO agent prompts — builds the instruction sent to each Cursor agent.
 *
 * Format is natural markdown prose. Real Cursor agents respond in structured
 * natural language; the orchestrator passes that text verbatim as context to
 * the next step.
 *
 * Agents are given:
 *   - Their role identity (from agentYaml.role_prompt)
 *   - Team context: overall goal, PM accountability, Blackboard state, team size
 *   - Their specific task and any upstream context
 *   - A dedicated Signaling section (blockers + messages) — placed before
 *     Response Format so it is read, not skimmed
 *
 * Blocker signaling supports two formats:
 *   1. Formal section:  ## 🚨 BLOCKER  (preferred for significant blockers)
 *   2. Inline shorthand: **BLOCKED:** reason  (quick flag mid-response)
 * Both are parsed by worker-signals.ts and surfaced to the PM before the next wave.
 */

import type { AgentYaml } from './types.js';
import type { FileBundle } from '../utils/file-gatherer.js';
import { formatBundleAsMarkdown } from '../utils/file-gatherer.js';
import { ClaudePromptPayloadSchema } from '../schemas.js';

export interface ToolCallingPromptInput {
  agentYaml: AgentYaml;
  taskContext: string;
  stepInput?: string;
  stateSummary?: Record<string, unknown>;
  fileBundle?: FileBundle;
  /** Overall team goal — injected as team context so agents know why they're here. */
  teamGoal?: string;
  /** Current Blackboard snapshot — agents can see what colleagues have done. */
  blackboardSnapshot?: string;
  /** Number of agents on the team — gives agents a sense of scale. */
  teamSize?: number;
}

/**
 * Build the instruction prompt sent to a Cursor agent.
 *
 * Section order:
 *   # Your Role          — agent persona (sets identity)
 *   ## Team Context      — goal, PM accountability, blackboard (shared awareness)
 *   ## Your Task         — the specific task for this step
 *   ## Output from Previous Agent — upstream handoff (if any)
 *   ## Project Files     — relevant file excerpts (if gathered)
 *   ## Capabilities      — tools the agent should apply
 *   ## How to Signal     — blocker + message protocol (before Response Format so it's read)
 *   ## Response Format   — how to structure the reply
 */
export function buildClaudeToolCallingPrompt(input: ToolCallingPromptInput): string {
  const payload = ClaudePromptPayloadSchema.safeParse({
    agentName: input.agentYaml.name ?? 'agent',
    stepInput: input.stepInput,
    taskContext: input.taskContext,
    tools: input.agentYaml.tools ?? [],
    model: input.agentYaml.claude_model,
    stateSummary: input.stateSummary,
  });
  const p = payload.success
    ? payload.data
    : { agentName: 'agent', taskContext: input.taskContext, tools: [] as string[] };

  const sections: string[] = [];

  // ── Role identity ─────────────────────────────────────────────────────────
  const rolePrompt = input.agentYaml.role_prompt;
  if (rolePrompt) {
    sections.push(`# Your Role\n\n${rolePrompt}`);
  } else {
    sections.push(`# Your Role\n\nYou are **${p.agentName}**, a specialist agent in an AI engineering team.`);
  }

  // ── Team context ──────────────────────────────────────────────────────────
  if (input.teamGoal || input.blackboardSnapshot || input.teamSize) {
    const teamParts: string[] = [];

    if (input.teamSize) {
      teamParts.push(
        `You are one of **${input.teamSize} specialist agents** working in parallel on this team. ` +
        `A **Lead PM (claude-opus-4-7)** planned this work, assigned this task specifically to you, and will review ` +
        `your output before the next wave starts. Other agents may be waiting on what you produce — ` +
        `be specific and actionable. Vague outputs cause re-work or blocked colleagues.`
      );
    } else {
      teamParts.push(
        `You are part of a specialist engineering team. A **Lead PM** assigned this task to you and will ` +
        `review your output before the next wave starts. Other agents may depend on what you produce — ` +
        `be specific and actionable.`
      );
    }

    if (input.teamGoal) {
      teamParts.push(`\n**Overall Team Goal:** ${input.teamGoal}`);
    }

    if (input.blackboardSnapshot && input.blackboardSnapshot !== '(Blackboard is empty)') {
      teamParts.push(`\n**Shared Blackboard (what the team knows so far):**\n\n${input.blackboardSnapshot}`);
    }

    sections.push(`## Team Context\n\n${teamParts.join('\n')}`);
  }

  // ── Task context ──────────────────────────────────────────────────────────
  sections.push(`## Your Task\n\n${p.taskContext}`);

  // ── Previous agent output ─────────────────────────────────────────────────
  if (p.stepInput) {
    sections.push(`## Output from Previous Agent\n\n${p.stepInput}`);
  }

  // ── Relevant project files ────────────────────────────────────────────────
  if (input.fileBundle && input.fileBundle.files.length > 0) {
    sections.push(`## Project Files\n\n${formatBundleAsMarkdown(input.fileBundle)}`);
  }

  // ── Capabilities ──────────────────────────────────────────────────────────
  const toolsList = p.tools && p.tools.length > 0 ? p.tools : [];
  if (toolsList.length > 0) {
    sections.push(
      `## Capabilities\n\nApply these skills as appropriate: ${toolsList.join(', ')}.\n\n` +
      `**Directory rule:** Before writing any file, ensure its parent directory exists:\n` +
      `- Shell/bash: \`mkdir -p <parent-dir>\`\n` +
      `- Node.js: \`fs.mkdirSync(path.dirname(filePath), { recursive: true })\`\n` +
      `- Python: \`os.makedirs(os.path.dirname(file_path), exist_ok=True)\`\n\n` +
      `Never assume \`src/\`, \`tests/\`, or any subdirectory already exists.`
    );
  } else {
    sections.push(
      `## Capabilities\n\n` +
      `**Directory rule:** Before writing any file, ensure its parent directory exists:\n` +
      `- Shell/bash: \`mkdir -p <parent-dir>\`\n` +
      `- Node.js: \`fs.mkdirSync(path.dirname(filePath), { recursive: true })\`\n` +
      `- Python: \`os.makedirs(os.path.dirname(file_path), exist_ok=True)\`\n\n` +
      `Never assume \`src/\`, \`tests/\`, or any subdirectory already exists.`
    );
  }

  // ── Signaling section — placed before Response Format so it is read, not skimmed ──
  sections.push(`## How to Signal

### 🚨 If You Are Blocked

Signal immediately if you **cannot complete your task** — missing information, conflicting requirements, an unmet dependency, or anything that would make your output wrong or incomplete.

The PM is watching and will act before the next wave starts. A blocker you signal now costs one wave to fix. A blocker you hide silently derails every downstream agent.

**Option A — Formal section (preferred when the blocker is significant):**

\`\`\`
## 🚨 BLOCKER
**Description:** [Exactly what is blocking you — be precise and specific]
**Needs from:** [lead-pm | agent-name | "more context"]
**Impact:** [What cannot proceed until this is resolved]
\`\`\`

**Option B — Inline shorthand (quick flag you can drop anywhere mid-response):**

\`\`\`
**BLOCKED:** [reason — one sentence is enough]
\`\`\`

The orchestrator monitors both formats and surfaces them to the PM automatically.

> ⚠️ Do not silently skip work or make up information to avoid a blocker. Signal it — the PM can only fix what they can see.

---

### 📨 Sending a Message to the PM or a Colleague

Use this when you have a question, a status update, or information another agent needs to know:

\`\`\`
## 📨 MESSAGE TO lead-pm
**Subject:** [brief subject line]
[message body — be concise]
\`\`\`

Replace \`lead-pm\` with any agent name (e.g. \`architect\`, \`executor\`, \`security-reviewer\`) to reach a colleague directly.

---

**If you are not blocked — omit these sections entirely.** Just deliver your work.`);

  // ── Response format ───────────────────────────────────────────────────────
  const producesDotGraph =
    toolsList.includes('dependency-mapper') || toolsList.includes('graph-visualizer');

  const baseFormat = producesDotGraph
    ? `Respond in well-structured markdown. Include your dependency or architecture graph in a \`\`\`dot code block.\n\nUse section headers such as:\n- ## Analysis\n- ## Dependencies (with \`\`\`dot block)\n- ## Recommendations`
    : `Respond in well-structured markdown prose. Use clear section headers appropriate to your role:\n\n- **Planner / Architect**: \`## Plan\`, \`## Approach\`, \`## Open Questions\`\n- **Executor / Builder**: \`## Implementation\`, \`## Changes Made\`, \`## Next Steps\`\n- **Reviewer / Critic**: \`## Review\`, \`## Issues Found\`, \`## Recommendations\`\n- **QA / Tester**: \`## Test Results\`, \`## Failures\`, \`## Coverage\`\n- **Doc Writer**: \`## Documentation\`, \`## Summary\`\n\nBe specific and actionable — the Lead PM and the next agent both read your output.`;

  sections.push(`## Response Format\n\n${baseFormat}`);

  return sections.join('\n\n');
}
