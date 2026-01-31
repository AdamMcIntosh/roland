/**
 * Agent Type Definitions
 * Defines the structure and types for agents used in oh-my-goose
 */

import { z } from 'zod';

/**
 * Agent configuration loaded from YAML files
 */
export interface AgentConfig {
  name: string;
  role_prompt: string;
  recommended_model?: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'google' | 'xai';
  temperature: number;
  tools?: string[];
  skills?: string[];
  max_tokens?: number;
  description?: string;
  system_prompt?: string;
  capabilities?: string[];
}

/**
 * Validated and normalized agent configuration
 */
export interface Agent extends AgentConfig {
  id: string;
  loaded_at: Date;
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  agent: Agent;
  task: string;
  user_input: string;
  session_id: string;
  mode: 'ecomode' | 'autopilot' | 'ultrapilot' | 'swarm' | 'pipeline';
  parent_result?: string;
  tools?: string[];
  skills?: string[];
  promptTemplate?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Goose session parameters derived from agent configuration
 */
export interface GooseSessionParams {
  session_id: string;
  agent_name: string;
  provider: Agent['provider'];
  model: string;
  temperature: number;
  max_tokens?: number;
  system_prompt: string;
  tools: string[];
  skills: string[];
}

/**
 * Prompt bundle passed to Goose
 */
export interface AgentPromptBundle {
  system: string;
  user: string;
}

/**
 * Goose execution result for a single agent
 */
export interface GooseSessionResult {
  output: string;
  status?: 'success' | 'error' | 'partial';
  error?: string;
  tokens_used?: {
    input: number;
    output: number;
  };
  cost?: number;
}

/**
 * Adapter interface for Goose session execution
 */
export type GooseSessionExecutor = (
  params: GooseSessionParams,
  prompt: AgentPromptBundle
) => Promise<GooseSessionResult>;

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  agent_id: string;
  agent_name: string;
  output: string;
  status: 'success' | 'error' | 'partial';
  error?: string;
  tokens_used?: {
    input: number;
    output: number;
  };
  cost?: number;
  execution_time_ms: number;
  timestamp: Date;
}

/**
 * Zod schema for validating agent YAML
 */
export const AgentConfigSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  role_prompt: z.string().min(1, 'Role prompt is required'),
  recommended_model: z.string().optional(),
  model: z.string().min(1, 'Model is required'),
  provider: z.enum(['anthropic', 'openai', 'google', 'xai']),
  temperature: z.number().min(0).max(2),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  max_tokens: z.number().optional(),
  description: z.string().optional(),
  system_prompt: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

/**
 * Agent registry entry
 */
export interface AgentRegistryEntry {
  id: string;
  name: string;
  agent: Agent;
  provider: string;
  model: string;
  capabilities: string[];
  loaded_at: Date;
}

/**
 * Agent statistics
 */
export interface AgentStats {
  name: string;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  average_execution_time_ms: number;
  total_tokens_used: number;
  total_cost: number;
  last_execution_time?: Date;
  error_rate: number;
}
