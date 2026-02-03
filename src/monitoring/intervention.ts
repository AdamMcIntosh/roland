/**
 * Intervention System
 * 
 * Automatic detection of problematic agents and suggested actions
 */

import { AgentIntervention, InterventionType, AgentInfo, FileOwnership } from './types.js';
import { AgentObservatory } from './agent-observatory.js';
import { logger } from '../utils/logger.js';

export class InterventionSystem {
  private timeoutThresholdMs = 5 * 60 * 1000; // 5 minutes
  private costThreshold = 1.0; // $1.00 per agent
  private staleCheckIntervalMs = 30 * 1000; // Check every 30 seconds

  /**
   * Analyze observatory and suggest interventions
   */
  suggestInterventions(observatory: AgentObservatory): AgentIntervention[] {
    const interventions: AgentIntervention[] = [];
    const activeAgents = observatory.getActiveAgents();
    const conflicts = observatory.detectFileConflicts();

    // Check for stale/timeout agents
    const now = Date.now();
    activeAgents.forEach(agent => {
      const runtime = now - agent.started_at.getTime();

      if (runtime > this.timeoutThresholdMs) {
        interventions.push({
          agent_id: agent.id,
          agent_type: agent.type,
          type: 'timeout',
          reason: `Agent running for ${Math.floor(runtime / 1000 / 60)} minutes`,
          suggested_action: 'Consider killing agent and restarting with smaller task',
          severity: 'critical',
          timestamp: new Date(),
        });
      }

      // Check for excessive cost
      if (agent.estimated_cost > this.costThreshold) {
        interventions.push({
          agent_id: agent.id,
          agent_type: agent.type,
          type: 'excessive_cost',
          reason: `Cost $${agent.estimated_cost.toFixed(2)} exceeds threshold`,
          suggested_action: 'Monitor closely, consider using cheaper model tier',
          severity: agent.estimated_cost > this.costThreshold * 2 ? 'critical' : 'warning',
          timestamp: new Date(),
        });
      }
    });

    // Check for file conflicts
    conflicts.forEach(conflict => {
      conflict.agents.forEach(agentId => {
        const agent = activeAgents.find(a => a.id === agentId);
        if (agent) {
          interventions.push({
            agent_id: agentId,
            agent_type: agent.type,
            type: 'file_conflict',
            reason: `Multiple agents modifying ${conflict.file}`,
            suggested_action: 'Review file ownership, potential merge conflicts',
            severity: 'warning',
            timestamp: new Date(),
          });
        }
      });
    });

    // Detect stale agents (active but no recent tool calls)
    activeAgents.forEach(agent => {
      if (agent.status === 'critical') {
        interventions.push({
          agent_id: agent.id,
          agent_type: agent.type,
          type: 'stale_agent',
          reason: 'Agent appears stale (no recent activity)',
          suggested_action: 'Check agent logs, consider restarting',
          severity: 'warning',
          timestamp: new Date(),
        });
      }
    });

    if (interventions.length > 0) {
      logger.warn(`[Intervention] ${interventions.length} intervention(s) suggested`);
    }

    return interventions;
  }

  /**
   * Cleanup stale agents
   */
  cleanupStaleAgents(observatory: AgentObservatory): number {
    const activeAgents = observatory.getActiveAgents();
    const now = Date.now();
    let cleaned = 0;

    activeAgents.forEach(agent => {
      const runtime = now - agent.started_at.getTime();
      if (runtime > this.timeoutThresholdMs) {
        observatory.completeAgent(agent.id, false);
        cleaned++;
        logger.info(`[Intervention] Cleaned up stale agent ${agent.id} (${agent.type})`);
      }
    });

    return cleaned;
  }

  /**
   * Format interventions for display
   */
  formatInterventions(interventions: AgentIntervention[]): string[] {
    return interventions.map(i => {
      const icon = i.severity === 'critical' ? '🔴' : '⚠️';
      const agentId = i.agent_id.slice(0, 7);
      return `${icon} [${agentId}] ${i.type}: ${i.reason} → ${i.suggested_action}`;
    });
  }

  /**
   * Check if intervention is needed
   */
  needsIntervention(observatory: AgentObservatory): boolean {
    const interventions = this.suggestInterventions(observatory);
    return interventions.some(i => i.severity === 'critical');
  }

  /**
   * Get critical interventions only
   */
  getCriticalInterventions(observatory: AgentObservatory): AgentIntervention[] {
    return this.suggestInterventions(observatory).filter(i => i.severity === 'critical');
  }
}

// Singleton instance
let interventionInstance: InterventionSystem | null = null;

export function getInterventionSystem(): InterventionSystem {
  if (!interventionInstance) {
    interventionInstance = new InterventionSystem();
  }
  return interventionInstance;
}
