/**
 * Core type definitions for oh-my-goose
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface RoutingConfig {
  simple: string[];
  medium: string[];
  complex: string[];
  explain: string[];
}

export interface GooseApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  xai?: string;
}

export interface GooseDefaults {
  temperature: number;
  max_tokens: number;
}

export interface GooseConfig {
  api_keys: GooseApiKeys;
  mcp_defaults: GooseDefaults;
}

export interface AppConfig {
  routing: RoutingConfig;
  goose: GooseConfig;
  configPath?: string;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentConfig {
  name: string;
  description: string;
  role: string;
  system_prompt: string;
  temperature?: number;
  max_tokens?: number;
  model?: string;
  tools?: string[];
}

export interface AgentRegistry {
  [name: string]: AgentConfig;
}

// ============================================================================
// Skill Types
// ============================================================================

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[] | number[];
  default?: unknown;
}

export interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  parameters: SkillParameter[];
  returns: {
    type: string;
    description: string;
  };
}

export interface SkillExecutionContext {
  agentName?: string;
  mode?: string;
  cacheKey?: string;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  cached?: boolean;
  duration?: number;
}

// ============================================================================
// MCP Types
// ============================================================================

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpRequest {
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  result?: unknown;
  error?: string;
}

// ============================================================================
// Model Router Types
// ============================================================================

export interface ModelSelection {
  model: string;
  provider: 'anthropic' | 'openai' | 'google' | 'xai';
  costPer1kTokens: number;
}

export interface RoutingContext {
  queryLength: number;
  complexity: 'simple' | 'medium' | 'complex';
  keywords?: string[];
  forceModel?: string;
}

// ============================================================================
// Cost Tracking Types
// ============================================================================

export interface CostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  timestamp: number;
  cached?: boolean;
}

export interface SessionCost {
  totalCost: number;
  totalTokens: number;
  entries: CostEntry[];
  startTime: number;
  endTime?: number;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry {
  key: string;
  value: unknown;
  timestamp: number;
  ttl?: number;
  cost?: number;
  metadata?: {
    agent?: string;
    mode?: string;
    complexity?: string;
    model?: string;
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  totalEntries: number;
  savedCost: number;
  agentStats?: Map<string, { hits: number; misses: number; savedCost: number }>;
  modeStats?: Map<string, { hits: number; misses: number; savedCost: number }>;
}

// ============================================================================
// Mode Types
// ============================================================================

export type ExecutionMode = 'ecomode' | 'autopilot' | 'ultrapilot' | 'swarm' | 'pipeline';

export interface ModeContext {
  mode: ExecutionMode;
  query: string;
  agent?: string;
  options?: Record<string, unknown>;
}

// ============================================================================
// Workflow Types
// ============================================================================

export interface WorkflowStep {
  id: string;
  agent: string;
  task: string;
  input?: Record<string, unknown>;
  output_to?: string;
  loop_if?: string;
  max_loops?: number;
}

export interface WorkflowConfig {
  name: string;
  description: string;
  steps: WorkflowStep[];
  variables?: Record<string, string>;
}

// ============================================================================
// Error Context
// ============================================================================

export interface ErrorContext {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
  stack?: string;
}
