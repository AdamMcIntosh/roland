/**
 * RCO (Roland Code Orchestrator) types and schemas
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Agent (from YAML)
// ---------------------------------------------------------------------------

export const AgentYamlSchema = z.object({
  name: z.string(),
  role_prompt: z.string().optional(),
  recommended_model: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  claude_model: z.string().optional(),
  temperature: z.number().optional(),
  tools: z.array(z.string()).optional(),
});

export type AgentYaml = z.infer<typeof AgentYamlSchema>;

// ---------------------------------------------------------------------------
// RCO Recipe (workflow + subagents)
// ---------------------------------------------------------------------------

export const RcoSubagentSchema = z.object({
  name: z.string(),
  agentRef: z.string(), // references agents/*.yaml name
  prompt: z.string().optional(),
  claude_model: z.string().optional(),
});

export const RcoWorkflowStepSchema = z.object({
  agent: z.string(),
  input: z.string().optional(),
  output_to: z.string().optional(),
  loop_if: z.string().optional(),
  final_output: z.boolean().optional(),
});

export const RcoRecipeSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  execution_mode: z
    .enum(['autonomous-loop', 'parallel-swarm', 'linear', 'adaptive-swarm', 'collab-mode'])
    .default('autonomous-loop'),
  max_loops: z.number().min(1).max(10).default(5),
  subagents: z.array(RcoSubagentSchema).optional(),
  workflow: z.object({
    steps: z.array(RcoWorkflowStepSchema),
  }),
  options: z.object({
    cache_messages: z.boolean().optional(),
    eco_mode: z.boolean().optional(),
  }).optional(),
});

export type RcoSubagent = z.infer<typeof RcoSubagentSchema>;
export type RcoWorkflowStep = z.infer<typeof RcoWorkflowStepSchema>;
export type RcoRecipe = z.infer<typeof RcoRecipeSchema>;

// ---------------------------------------------------------------------------
// RCO Config (from config.yaml rco section)
// ---------------------------------------------------------------------------

export const RcoConfigSchema = z.object({
  claude_models: z.object({
    complex: z.string(),
    medium: z.string(),
    simple: z.string(),
    explain: z.string(),
  }).optional(),
  eco_mode: z.boolean().optional(),
  task_routing: z.array(z.object({
    pattern: z.string(),
    agents: z.array(z.string()),
  })).optional(),
  dashboard_port: z.number().optional(),
  state_file: z.string().optional(),
});

export type RcoConfig = z.infer<typeof RcoConfigSchema>;

// ---------------------------------------------------------------------------
// Orchestrator state (persisted JSON)
// ---------------------------------------------------------------------------

export interface RcoState {
  sessionId: string;
  recipe: string;
  task: string;
  currentStep: number;
  loopCount: number;
  outputs: Record<string, unknown>;
  agentLogs: Array<{ agent: string; phase: string; message: string; ts: number }>;
  startedAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Worker messages (parent ↔ child)
// ---------------------------------------------------------------------------

export const WorkerInputSchema = z.object({
  type: z.literal('run'),
  agentYaml: AgentYamlSchema,
  state: z.record(z.unknown()),
  taskContext: z.string(),
  stepInput: z.string().optional(),
  tools: z.array(z.string()).optional(),
  workflowSteps: z.array(z.object({ agent: z.string(), output_to: z.string().optional() })).optional(),
});

export const WorkerOutputSchema = z.object({
  type: z.literal('result'),
  success: z.boolean(),
  output: z.string(),
  dotGraph: z.string().optional(),
  error: z.string().optional(),
});

export type WorkerInput = z.infer<typeof WorkerInputSchema>;
export type WorkerOutput = z.infer<typeof WorkerOutputSchema>;
