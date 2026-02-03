/**
 * Performance Monitoring Types
 * 
 * Type definitions for agent tracking, analytics, and monitoring
 */

/**
 * Agent status indicator
 */
export type AgentStatus = 'active' | 'warning' | 'critical' | 'completed' | 'failed';

/**
 * Real-time agent information
 */
export interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  started_at: Date;
  runtime_seconds: number;
  tool_calls: number;
  tokens_used: number;
  estimated_cost: number;
  files_touched: string[];
  bottleneck?: {
    tool: string;
    avg_duration_ms: number;
    call_count: number;
  };
  parent_mode?: string;
  task?: string;
}

/**
 * Observatory display data
 */
export interface ObservatoryDisplay {
  header: string;
  lines: string[];
  summary: string;
  efficiency_score: number;
}

/**
 * Session replay event types
 */
export type ReplayEventType = 
  | 'agent_start' 
  | 'agent_stop' 
  | 'tool_start' 
  | 'tool_end'
  | 'file_touch'
  | 'intervention';

/**
 * Session replay event
 */
export interface ReplayEvent {
  t: number; // Timestamp offset from session start (seconds)
  agent: string;
  agent_type?: string;
  event: ReplayEventType;
  tool?: string;
  duration_ms?: number;
  success?: boolean;
  file?: string;
  task?: string;
  parent_mode?: string;
  model?: string;
  intervention_type?: string;
  reason?: string;
}

/**
 * Replay summary
 */
export interface ReplaySummary {
  session_id: string;
  duration_seconds: number;
  agents_spawned: number;
  agents_completed: number;
  agents_failed: number;
  total_tool_calls: number;
  total_tokens: number;
  total_cost: number;
  files_touched: string[];
  bottlenecks: Array<{
    tool: string;
    avg_duration_ms: number;
    call_count: number;
  }>;
}

/**
 * Intervention types
 */
export type InterventionType = 'timeout' | 'excessive_cost' | 'file_conflict' | 'stale_agent';

/**
 * Agent intervention
 */
export interface AgentIntervention {
  agent_id: string;
  agent_type: string;
  type: InterventionType;
  reason: string;
  suggested_action: string;
  severity: 'warning' | 'critical';
  timestamp: Date;
}

/**
 * Tool timing data
 */
export interface ToolTiming {
  tool: string;
  call_count: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
}

/**
 * Agent performance metrics
 */
export interface AgentPerformance {
  agent_id: string;
  agent_type: string;
  runtime_seconds: number;
  tool_timings: ToolTiming[];
  bottleneck?: ToolTiming;
  tokens_used: number;
  estimated_cost: number;
  efficiency_score: number;
}

/**
 * File ownership tracking
 */
export interface FileOwnership {
  file: string;
  agents: string[];
  conflict: boolean;
}

/**
 * Session analytics
 */
export interface SessionAnalytics {
  session_id: string;
  start_time: number;
  ended_at?: Date;
  duration_seconds: number;
  total_tokens: number;
  total_cost: number;
  cache_hits: number;
  cache_misses: number;
  cache_efficiency: number;
  agents_used: number;
  tool_calls: number;
  mode?: string;
  agent_usage?: Record<string, { tokens: number; cost: number }>;
}

/**
 * Cost breakdown by agent
 */
export interface AgentCostBreakdown {
  agent_type: string;
  executions: number;
  total_tokens: number;
  total_cost: number;
  avg_cost_per_execution: number;
}

/**
 * Daily cost summary
 */
export interface DailyCostSummary {
  date: string;
  total_cost: number;
  total_tokens: number;
  sessions: number;
  agents: AgentCostBreakdown[];
}

/**
 * Parallel efficiency metrics
 */
export interface ParallelEfficiency {
  score: number; // 0-100
  active_agents: number;
  stale_agents: number;
  total_agents: number;
  bottlenecks: string[];
}

/**
 * Monitoring state
 */
export interface MonitoringState {
  active_agents: Map<string, AgentInfo>;
  completed_agents: AgentInfo[];
  file_ownership: Map<string, string[]>;
  session_start: Date;
  session_id: string;
}
