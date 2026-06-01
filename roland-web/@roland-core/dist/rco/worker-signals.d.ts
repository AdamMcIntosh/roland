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
export declare function parseWorkerSignals(output: string): ParsedSignals;
/**
 * True if the output contains at least one BLOCKER signal in any supported format.
 *
 * Checks:
 *   ## 🚨 BLOCKER  (formal section)
 *   **BLOCKED:** …  (inline bold shorthand)
 *   ⚠️/🚨 BLOCKED: …  (emoji inline)
 *   BLOCKING ISSUE: …
 */
export declare function hasBlockerSignal(output: string): boolean;
//# sourceMappingURL=worker-signals.d.ts.map