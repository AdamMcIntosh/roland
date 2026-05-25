/**
 * Worker signal parsing — extract structured signals from agent prose output.
 *
 * Agents signal blockers and send inter-agent messages by including special
 * sections in their response. The orchestrator parses these after each task
 * completes and acts on them before the next wave.
 *
 * ── Blocker formats (both are detected) ────────────────────────────────────
 *
 *   Formal section (preferred):
 *
 *     ## 🚨 BLOCKER
 *     **Description:** Cannot proceed — need X from Y.
 *     **Needs from:** lead-pm (or agent-name)
 *     **Impact:** task-5 and task-6 cannot start without this.
 *
 *   Inline shorthand (quick flag mid-response):
 *
 *     **BLOCKED:** [reason]
 *
 *   Also detected:
 *     ⚠️ BLOCKED: [reason]
 *     🚨 BLOCKED: [reason]      (inline — not a ## section header)
 *     BLOCKING ISSUE: [reason]
 *
 * ── Message format ──────────────────────────────────────────────────────────
 *
 *   ## 📨 MESSAGE TO lead-pm
 *   **Subject:** Question about DB schema
 *   The executor output didn't include the schema DDL. Can you clarify?
 *
 * ── Orchestrator actions ────────────────────────────────────────────────────
 *   - Post each BLOCKER as a critical entry on the Blackboard
 *   - Send each MESSAGE via the MessageBus
 *   - Surface detected blockers prominently in the next PM review
 *
 * Parsing is non-destructive — the full output (including signals) is still
 * usable as context for downstream agents.
 */

export interface WorkerBlocker {
  /** Full description from the BLOCKER section. */
  description: string;
}

export interface WorkerMessage {
  /** Normalised agent name (lower-kebab-case). */
  to: string;
  subject: string;
  body: string;
}

export interface ParsedSignals {
  blockers: WorkerBlocker[];
  messages: WorkerMessage[];
}

/**
 * Parse signal sections from an agent's prose output.
 * Non-destructive — the full output (including signals) is still usable as
 * context for downstream agents; we only *additionally* act on the signals.
 */
export function parseWorkerSignals(output: string): ParsedSignals {
  const blockers: WorkerBlocker[] = [];
  const messages: WorkerMessage[] = [];

  const lines = output.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── BLOCKER section ────────────────────────────────────────────────────
    if (/^##\s*(?:🚨\s*)?BLOCKER\b/i.test(line)) {
      const content: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('## ')) {
        content.push(lines[i]);
        i++;
      }
      const description = content.join('\n').trim();
      if (description) blockers.push({ description });
      continue;
    }

    // ── MESSAGE TO section ─────────────────────────────────────────────────
    const msgMatch = line.match(/^##\s*(?:📨\s*)?MESSAGE TO\s+(.+)/i);
    if (msgMatch) {
      // Normalise recipient: lower-kebab-case, strip emoji/punctuation
      const to = msgMatch[1].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      let subject = 'Message from agent';
      const content: string[] = [];
      i++;
      if (i < lines.length && /^\*\*Subject:\*\*/i.test(lines[i])) {
        subject = lines[i].replace(/^\*\*Subject:\*\*\s*/i, '').trim();
        i++;
      }
      while (i < lines.length && !lines[i].startsWith('## ')) {
        content.push(lines[i]);
        i++;
      }
      const body = content.join('\n').trim();
      if (to && body) messages.push({ to, subject, body });
      continue;
    }

    i++;
  }

  // ── Inline BLOCKED shorthand ───────────────────────────────────────────────
  // Catches patterns the section parser above doesn't see:
  //   **BLOCKED:** reason
  //   ⚠️ BLOCKED: reason  /  🚨 BLOCKED: reason  (inline, not a ## header)
  //   BLOCKING ISSUE: reason
  // Each match is deduplicated against what the section parser already captured.
  const inlineRe =
    /(?:\*\*BLOCKED?:\*\*|(?:⚠️|🚨)\s+BLOCKED?:|^BLOCKING ISSUE:)\s*(.+)/gim;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(output)) !== null) {
    const description = m[1].trim();
    if (!description) continue;
    // Deduplicate: skip if a section-level blocker already contains this text.
    // Section blockers include "**Description:** …" prefix so a prefix-equality
    // check fails; use substring containment on a normalised key instead.
    const key = description.slice(0, 50).toLowerCase();
    const dup = blockers.some((b) => b.description.toLowerCase().includes(key));
    if (!dup) blockers.push({ description });
  }

  return { blockers, messages };
}

/**
 * True if the output contains at least one BLOCKER signal in any supported format.
 *
 * Checks:
 *   ## 🚨 BLOCKER  (formal section)
 *   **BLOCKED:** …  (inline bold shorthand)
 *   ⚠️/🚨 BLOCKED: …  (emoji inline)
 *   BLOCKING ISSUE: …
 */
export function hasBlockerSignal(output: string): boolean {
  return (
    /^##\s*(?:🚨\s*)?BLOCKER\b/im.test(output) ||
    /\*\*BLOCKED?:\*\*/i.test(output) ||
    /(?:⚠️|🚨)\s+BLOCKED?:/i.test(output) ||
    /^BLOCKING ISSUE:/im.test(output)
  );
}
