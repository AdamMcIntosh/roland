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
 * Parse agent response text for JSON block { "output": "..." }.
 * Falls back to full text as output if no valid JSON.
 */
export function parseClaudeResponseText(raw: string): ClaudeResponseOutput {
  const trimmed = raw.trim();
  // Try to extract JSON object (allow markdown code block)
  const jsonMatch = trimmed.match(/\{[\s\S]*"output"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      const result = ClaudeResponseOutputSchema.safeParse(parsed);
      if (result.success) return result.data;
    } catch {
      // fall through to full text
    }
  }
  return { output: trimmed, success: true };
}
