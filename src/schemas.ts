/**
 * RCO Phase 2 — Zod schemas for prompts, states, and outputs.
 * Used for validation in orchestrator and workers. Security audit surface.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Claude tool-calling prompt payload (sent to Claude / mock)
// ---------------------------------------------------------------------------

export const ClaudePromptPayloadSchema = z.object({
  agentName: z.string().min(1),
  stepInput: z.string().optional(),
  taskContext: z.string(),
  tools: z.array(z.string()).optional(),
  model: z.string().optional(),
  stateSummary: z.record(z.unknown()).optional(),
});

export type ClaudePromptPayload = z.infer<typeof ClaudePromptPayloadSchema>;

// ---------------------------------------------------------------------------
// Parsed Claude response (JSON from agent response)
// ---------------------------------------------------------------------------

export const ClaudeResponseOutputSchema = z.object({
  output: z.string(),
  success: z.boolean().optional(),
  dotGraph: z.string().optional(),
  error: z.string().optional(),
});

export type ClaudeResponseOutput = z.infer<typeof ClaudeResponseOutputSchema>;

// ---------------------------------------------------------------------------
// Session state (persisted / notepad) — strict shape for security
// ---------------------------------------------------------------------------

export const PersistedStateSchema = z.object({
  sessionId: z.string(),
  recipe: z.string(),
  task: z.string(),
  currentStep: z.number().int().min(0),
  loopCount: z.number().int().min(0),
  outputs: z.record(z.unknown()),
  agentLogs: z.array(
    z.object({
      agent: z.string(),
      phase: z.string(),
      message: z.string(),
      ts: z.number(),
    })
  ),
  startedAt: z.number(),
  updatedAt: z.number(),
});

export type PersistedState = z.infer<typeof PersistedStateSchema>;

// ---------------------------------------------------------------------------
// Notepad store/retrieve payloads
// ---------------------------------------------------------------------------

export const NotepadStorePayloadSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.record(z.unknown()).or(z.string()),
});

export const NotepadRetrievePayloadSchema = z.object({
  key: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Plugin slash command args
// ---------------------------------------------------------------------------

export const PluginRunRecipeArgsSchema = z.object({
  recipe: z.string().min(1),
  task: z.string().min(1),
  options: z
    .object({
      ecoMode: z.boolean().optional(),
      maxLoops: z.number().int().min(1).max(10).optional(),
      noExport: z.boolean().optional(),
    })
    .optional(),
});

export type PluginRunRecipeArgs = z.infer<typeof PluginRunRecipeArgsSchema>;

/**
 * Parse an agent response into a ClaudeResponseOutput.
 *
 * Priority:
 *  1. Prose response (primary path for real Cursor agents) — the full text
 *     becomes `output`. A ```dot ... ``` code block is extracted as `dotGraph`.
 *  2. JSON envelope { "output": "..." } — backward-compat with the mock paths
 *     and any agent that explicitly wraps its reply. Accepted inside a
 *     ```json ... ``` fence or bare in the text.
 *
 * This means real Cursor agents can write natural markdown and the orchestrator
 * will capture it correctly without any special formatting required.
 */
export function parseClaudeResponseText(raw: string): ClaudeResponseOutput {
  const trimmed = raw.trim();

  // ── Extract DOT graph from prose (```dot ... ``` block) ──────────────────
  let dotGraph: string | undefined;
  const dotMatch = trimmed.match(/```dot\s*([\s\S]*?)```/i);
  if (dotMatch) {
    dotGraph = dotMatch[1].trim();
  }

  // ── JSON envelope (backward compat: mock path + explicit JSON replies) ───
  // Accept both ```json { ... } ``` and a bare { "output": ... } object.
  const jsonFenced = trimmed.match(/```json\s*(\{[\s\S]*?"output"[\s\S]*?\})\s*```/i);
  const jsonBare   = trimmed.match(/\{[\s\S]*?"output"[\s\S]*?\}/);
  const jsonSource = jsonFenced?.[1] ?? jsonBare?.[0];
  if (jsonSource) {
    try {
      const parsed = JSON.parse(jsonSource) as unknown;
      const result = ClaudeResponseOutputSchema.safeParse(parsed);
      if (result.success) {
        return { ...result.data, dotGraph: result.data.dotGraph ?? dotGraph };
      }
    } catch {
      // fall through to prose
    }
  }

  // ── Prose response (real Cursor agents) ──────────────────────────────────
  return { output: trimmed, success: true, dotGraph };
}
