/**
 * Agent Observatory
 * 
 * Real-time tracking and monitoring of active agents
 */

import { AgentInfo, AgentStatus, ObservatoryDisplay, MonitoringState, ToolTiming } from './types.js';
import { logger } from '../utils/logger.js';

export class AgentObservatory {
  private state: MonitoringState;
  private staleThresholdMs = 5 * 60 * 1000; // 5 minutes
  private costThresholdPerAgent = 1.0; // $1.00

  constructor(sessionId: string) {
    this.state = {
      active_agents: new Map(),
      completed_agents: [],
      file_ownership: new Map(),
      session_start: new Date(),
      session_id: sessionId,
    };
  }

  /**
   * Register a new agent
   */
  registerAgent(
    agentId: string,
    agentType: string,
    task?: string,
    parentMode?: string
  ): void {
    const agent: AgentInfo = {
      id: agentId,
      name: agentType,
      type: agentType,
      status: 'active',
      started_at: new Date(),
      runtime_seconds: 0,
      tool_calls: 0,
      tokens_used: 0,
      estimated_cost: 0,
      files_touched: [],
      parent_mode: parentMode,
      task,
    };

    this.state.active_agents.set(agentId, agent);
    logger.debug(`[Observatory] Registered agent ${agentId} (${agentType})`);
  }

  /**
   * Record tool call
   */
  recordToolCall(
    agentId: string,
    toolName: string,
    durationMs: number,
    success: boolean = true
  ): void {
    const agent = this.state.active_agents.get(agentId);
    if (!agent) return;

    agent.tool_calls++;
    
    // Track tool timing for bottleneck detection
    const toolTimings = this.getToolTimings(agentId);
    const timing = toolTimings.get(toolName) || { count: 0, total: 0 };
    timing.count++;
    timing.total += durationMs;
    toolTimings.set(toolName, timing);

    // Update bottleneck if this tool is slow and called multiple times
    if (timing.count >= 2 && timing.total / timing.count > 1000) {
      agent.bottleneck = {
        tool: toolName,
        avg_duration_ms: timing.total / timing.count,
        call_count: timing.count,
      };
    }
  }

  /**
   * Record file touch
   */
  recordFileTouch(agentId: string, filePath: string): void {
    const agent = this.state.active_agents.get(agentId);
    if (!agent) return;

    if (!agent.files_touched.includes(filePath)) {
      agent.files_touched.push(filePath);
    }

    // Track file ownership
    const owners = this.state.file_ownership.get(filePath) || [];
    if (!owners.includes(agentId)) {
      owners.push(agentId);
      this.state.file_ownership.set(filePath, owners);
    }
  }

  /**
   * Update agent metrics
   */
  updateMetrics(
    agentId: string,
    tokens?: number,
    cost?: number
  ): void {
    const agent = this.state.active_agents.get(agentId);
    if (!agent) return;

    if (tokens) agent.tokens_used += tokens;
    if (cost) agent.estimated_cost += cost;

    // Update runtime
    agent.runtime_seconds = (Date.now() - agent.started_at.getTime()) / 1000;

    // Update status based on metrics
    this.updateAgentStatus(agent);
  }

  /**
   * Mark agent as completed
   */
  completeAgent(agentId: string, success: boolean = true): void {
    const agent = this.state.active_agents.get(agentId);
    if (!agent) return;

    agent.status = success ? 'completed' : 'failed';
    agent.runtime_seconds = (Date.now() - agent.started_at.getTime()) / 1000;

    this.state.active_agents.delete(agentId);
    this.state.completed_agents.push(agent);

    logger.debug(`[Observatory] Agent ${agentId} ${agent.status}`);
  }

  /**
   * Get observatory display
   */
  getDisplay(): ObservatoryDisplay {
    const activeAgents = Array.from(this.state.active_agents.values());
    const efficiency = this.calculateEfficiency();

    // Update all agent runtimes
    activeAgents.forEach(agent => {
      agent.runtime_seconds = (Date.now() - agent.started_at.getTime()) / 1000;
      this.updateAgentStatus(agent);
    });

    const header = `Agent Observatory (${activeAgents.length} active, ${efficiency.toFixed(0)}% efficiency)`;
    
    const lines: string[] = [];
    activeAgents
      .sort((a, b) => a.started_at.getTime() - b.started_at.getTime())
      .forEach(agent => {
        const icon = this.getStatusIcon(agent.status);
        const id = agent.id.slice(0, 7);
        const runtime = `${Math.floor(agent.runtime_seconds)}s`;
        const tools = `tools:${agent.tool_calls}`;
        const tokens = `tokens:${(agent.tokens_used / 1000).toFixed(1)}k`;
        const cost = `$${agent.estimated_cost.toFixed(2)}`;
        const files = agent.files_touched.length > 0 ? `files:${agent.files_touched.length}` : '';

        let line = `${icon} [${id}] ${agent.type} ${runtime} ${tools} ${tokens} ${cost}`;
        if (files) line += ` ${files}`;
        lines.push(line);

        // Show bottleneck if present
        if (agent.bottleneck) {
          lines.push(`   └─ bottleneck: ${agent.bottleneck.tool} (${agent.bottleneck.avg_duration_ms.toFixed(1)}ms avg)`);
        }

        // Show warnings
        if (agent.estimated_cost > this.costThresholdPerAgent) {
          lines.push(`⚠ ${agent.type}: Cost $${agent.estimated_cost.toFixed(2)} exceeds threshold`);
        }
      });

    const summary = `Total: ${activeAgents.length} active, ${this.state.completed_agents.length} completed`;

    return {
      header,
      lines,
      summary,
      efficiency_score: efficiency,
    };
  }

  /**
   * Get active agent count
   */
  getActiveCount(): number {
    return this.state.active_agents.size;
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): AgentInfo[] {
    return Array.from(this.state.active_agents.values());
  }

  /**
   * Calculate parallel efficiency
   */
  calculateEfficiency(): number {
    const activeAgents = Array.from(this.state.active_agents.values());
    if (activeAgents.length === 0) return 100;

    const now = Date.now();
    const staleCount = activeAgents.filter(
      agent => now - agent.started_at.getTime() > this.staleThresholdMs
    ).length;

    const activeCount = activeAgents.length - staleCount;
    return (activeCount / activeAgents.length) * 100;
  }

  /**
   * Detect file conflicts
   */
  detectFileConflicts(): Array<{ file: string; agents: string[] }> {
    const conflicts: Array<{ file: string; agents: string[] }> = [];

    this.state.file_ownership.forEach((agents, file) => {
      if (agents.length > 1) {
        conflicts.push({ file, agents });
      }
    });

    return conflicts;
  }

  /**
   * Get monitoring state
   */
  getState(): MonitoringState {
    return this.state;
  }

  // Private helpers

  private toolTimingsCache = new Map<string, Map<string, { count: number; total: number }>>();

  private getToolTimings(agentId: string): Map<string, { count: number; total: number }> {
    if (!this.toolTimingsCache.has(agentId)) {
      this.toolTimingsCache.set(agentId, new Map());
    }
    return this.toolTimingsCache.get(agentId)!;
  }

  private updateAgentStatus(agent: AgentInfo): void {
    const now = Date.now();
    const runtime = now - agent.started_at.getTime();

    if (runtime > this.staleThresholdMs) {
      agent.status = 'critical';
    } else if (agent.estimated_cost > this.costThresholdPerAgent) {
      agent.status = 'warning';
    } else {
      agent.status = 'active';
    }
  }

  private getStatusIcon(status: AgentStatus): string {
    switch (status) {
      case 'active': return '🟢';
      case 'warning': return '🟡';
      case 'critical': return '🔴';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '⚪';
    }
  }
}

// Singleton for current session
let currentObservatory: AgentObservatory | null = null;

export function getObservatory(sessionId?: string): AgentObservatory {
  if (!currentObservatory || (sessionId && currentObservatory.getState().session_id !== sessionId)) {
    currentObservatory = new AgentObservatory(sessionId || `session_${Date.now()}`);
  }
  return currentObservatory;
}

export function resetObservatory(): void {
  currentObservatory = null;
}
