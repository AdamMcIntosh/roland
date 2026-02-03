/**
 * Performance Monitoring System
 * 
 * Main entry point for monitoring, analytics, and intervention
 */

export * from './types.js';
export * from './agent-observatory.js';
export * from './session-replay.js';
export * from './analytics.js';
export * from './intervention.js';

import { getObservatory, resetObservatory } from './agent-observatory.js';
import { getSessionReplay, resetSessionReplay } from './session-replay.js';
import { getAnalytics } from './analytics.js';
import { getInterventionSystem } from './intervention.js';

/**
 * Integrated monitoring facade
 */
export class PerformanceMonitoring {
  private sessionId: string;
  
  constructor(sessionId?: string) {
    this.sessionId = sessionId || `session_${Date.now()}`;
  }

  /**
   * Get all monitoring components
   */
  getComponents() {
    return {
      observatory: getObservatory(this.sessionId),
      replay: getSessionReplay(this.sessionId),
      analytics: getAnalytics(),
      intervention: getInterventionSystem(),
    };
  }

  /**
   * Start monitoring session
   */
  startSession(mode?: string): void {
    const { analytics } = this.getComponents();
    analytics.startSession(this.sessionId, mode);
  }

  /**
   * End monitoring session
   */
  endSession(): void {
    const { analytics } = this.getComponents();
    analytics.endSession();
  }

  /**
   * Record agent activity
   */
  recordAgentStart(agentId: string, agentType: string, task?: string, parentMode?: string): void {
    const { observatory, replay } = this.getComponents();
    observatory.registerAgent(agentId, agentType, task, parentMode);
    replay.recordAgentStart(agentId, agentType, task, parentMode);
  }

  recordAgentStop(agentId: string, agentType: string, success: boolean): void {
    const { observatory, replay } = this.getComponents();
    observatory.completeAgent(agentId, success);
    replay.recordAgentStop(agentId, agentType, success);
  }

  recordToolCall(agentId: string, toolName: string, durationMs: number, success: boolean = true): void {
    const { observatory, replay, analytics } = this.getComponents();
    observatory.recordToolCall(agentId, toolName, durationMs, success);
    replay.recordToolEnd(agentId, toolName, durationMs, success);
    analytics.recordToolCall();
  }

  recordFileTouch(agentId: string, filePath: string): void {
    const { observatory, replay } = this.getComponents();
    observatory.recordFileTouch(agentId, filePath);
    replay.recordFileTouch(agentId, filePath);
  }

  recordUsage(tokens: number, cost: number, agentType?: string, cacheHit: boolean = false): void {
    const { analytics } = this.getComponents();
    analytics.recordUsage(tokens, cost, agentType, cacheHit);
  }

  /**
   * Get monitoring display
   */
  getObservatoryDisplay(): string {
    const { observatory } = this.getComponents();
    const display = observatory.getDisplay();
    
    return [
      display.header,
      ...display.lines,
      '',
      display.summary,
    ].join('\n');
  }

  /**
   * Check for interventions
   */
  checkInterventions(): string[] {
    const { observatory, intervention } = this.getComponents();
    const interventions = intervention.suggestInterventions(observatory);
    return intervention.formatInterventions(interventions);
  }

  /**
   * Get session summary
   */
  getSessionSummary(): any {
    const { replay, analytics } = this.getComponents();
    const replaySummary = replay.getSummary();
    const sessionStats = analytics.getCurrentSession();

    return {
      replay: replaySummary,
      analytics: sessionStats,
    };
  }

  /**
   * Reset monitoring
   */
  static reset(): void {
    resetObservatory();
    resetSessionReplay();
  }
}

// Export convenience functions
export function createMonitoring(sessionId?: string): PerformanceMonitoring {
  return new PerformanceMonitoring(sessionId);
}
