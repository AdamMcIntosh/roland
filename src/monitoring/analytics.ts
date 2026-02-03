/**
 * Analytics System
 * 
 * Token usage and cost tracking with session-level analytics
 */

import fs from 'fs';
import path from 'path';
import {
  SessionAnalytics,
  AgentCostBreakdown,
  DailyCostSummary,
} from './types.js';
import { logger } from '../utils/logger.js';
import { getSummaryCache, AnalyticsSummary } from './analytics-summary.js';
import { estimateOutputTokens, EstimatedTokenUsage } from './token-extractor.js';

export class AnalyticsSystem {
  private stateDir: string;
  private trackingFile: string;
  private currentSession: SessionAnalytics | null = null;
  private summaryCache = getSummaryCache();
  private currentAgent: string | null = null;
  private previousTokens: { input: number; output: number } = { input: 0, output: 0 };

  constructor(stateDir: string = './.samwise/state') {
    this.stateDir = stateDir;
    this.trackingFile = path.join(stateDir, 'token-tracking.jsonl');

    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
  }

  /**
   * Set current active agent for token correlation
   */
  setCurrentAgent(agentType: string | null): void {
    this.currentAgent = agentType;
  }

  /**
   * Start a new session
   */
  startSession(sessionId: string, mode?: string): void {
    this.currentSession = {
      session_id: sessionId,
      start_time: Date.now(),
      duration_seconds: 0,
      total_tokens: 0,
      total_cost: 0,
      cache_hits: 0,
      cache_misses: 0,
      cache_efficiency: 0,
      agents_used: 0,
      tool_calls: 0,
      mode,
      agent_usage: {},
    };
    
    this.previousTokens = { input: 0, output: 0 };

    logger.debug(`[Analytics] Started session ${sessionId}`);
  }

  /**
   * Record tokens with automatic estimation if needed
   */
  recordTokensWithEstimation(
    inputTokens: number,
    outputTokens: number | undefined,
    model: string,
    cost: number,
    cacheHit: boolean = false
  ): void {
    if (!this.currentSession) {
      logger.warn('[Analytics] No active session');
      return;
    }

    // Use estimation if output tokens not provided
    let actualOutput = outputTokens;
    if (actualOutput === undefined) {
      const estimated = estimateOutputTokens(inputTokens, model);
      actualOutput = estimated.outputTokens;
    }

    const totalTokens = inputTokens + actualOutput;
    const agentType = this.currentAgent || 'unknown';

    // Calculate delta from previous
    const deltaInput = inputTokens - this.previousTokens.input;
    const deltaOutput = actualOutput - this.previousTokens.output;
    const deltaTotal = deltaInput + deltaOutput;

    // Update session
    this.currentSession.total_tokens += deltaTotal;
    this.currentSession.total_cost += cost;

    if (cacheHit) {
      this.currentSession.cache_hits++;
    } else {
      this.currentSession.cache_misses++;
    }

    // Track agent-specific usage with delta
    if (deltaTotal > 0) {
      if (!this.currentSession.agent_usage) {
        this.currentSession.agent_usage = {};
      }
      
      if (!this.currentSession.agent_usage[agentType]) {
        this.currentSession.agent_usage[agentType] = { tokens: 0, cost: 0 };
      }
      
      this.currentSession.agent_usage[agentType].tokens += deltaTotal;
      this.currentSession.agent_usage[agentType].cost += cost;
    }

    // Update previous counters
    this.previousTokens.input = inputTokens;
    this.previousTokens.output = actualOutput;

    this.updateCacheEfficiency();
    
    // Log JSONL entry
    this.logTokenUsage({
      sessionId: this.currentSession.session_id,
      timestamp: Date.now(),
      agentType,
      inputTokens: deltaInput,
      outputTokens: deltaOutput,
      totalTokens: deltaTotal,
      cost,
      model,
      cacheHit,
    });
  }

  /**
   * Log token usage to JSONL
   */
  private logTokenUsage(entry: any): void {
    try {
      fs.appendFileSync(this.trackingFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      logger.error('[Analytics] Failed to log token usage', error);
    }
  }

  /**
   * Record usage (original method for backwards compatibility)
   */
  recordUsage(
    tokens: number,
    cost: number,
    agentType?: string,
    cacheHit: boolean = false
  ): void {
    if (!this.currentSession) {
      logger.warn('[Analytics] No active session');
      return;
    }

    this.currentSession.total_tokens += tokens;
    this.currentSession.total_cost += cost;

    if (cacheHit) {
      this.currentSession.cache_hits++;
    } else {
      this.currentSession.cache_misses++;
    }

    // Track agent-specific usage
    if (agentType) {
      if (!this.currentSession.agent_usage) {
        this.currentSession.agent_usage = {};
      }
      
      if (!this.currentSession.agent_usage[agentType]) {
        this.currentSession.agent_usage[agentType] = { tokens: 0, cost: 0 };
      }
      
      this.currentSession.agent_usage[agentType].tokens += tokens;
      this.currentSession.agent_usage[agentType].cost += cost;
    }

    this.updateCacheEfficiency();
  }

  /**
   * Record agent usage
   */
  recordAgentUsage(agentType: string): void {
    if (!this.currentSession) return;
    this.currentSession.agents_used++;
  }

  /**
   * Record tool call
   */
  recordToolCall(): void {
    if (!this.currentSession) return;
    this.currentSession.tool_calls++;
  }

  /**
   * End current session
   */
  endSession(): void {
    if (!this.currentSession) return;

    this.currentSession.ended_at = new Date();
    this.currentSession.duration_seconds = 
      (Date.now() - this.currentSession.start_time) / 1000;

    this.saveSession(this.currentSession);
    this.currentSession = null;
  }

  /**
   * Get current session stats
   */
  getCurrentSession(): SessionAnalytics | null {
    if (!this.currentSession) return null;

    // Update duration
    this.currentSession.duration_seconds = 
      (Date.now() - this.currentSession.start_time) / 1000;

    return { ...this.currentSession };
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SessionAnalytics[] {
    if (!fs.existsSync(this.trackingFile)) {
      return [];
    }

    const content = fs.readFileSync(this.trackingFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    return lines.map(line => {
      try {
        const data = JSON.parse(line);
        return {
          ...data,
          started_at: new Date(data.started_at),
          ended_at: data.ended_at ? new Date(data.ended_at) : undefined,
        };
      } catch (error) {
        logger.warn(`Failed to parse session: ${line}`);
        return null;
      }
    }).filter(s => s !== null) as SessionAnalytics[];
  }

  /**
   * Get daily cost summary
   */
  getDailyCosts(days: number = 7): DailyCostSummary[] {
    const sessions = this.getAllSessions();
    const now = Date.now();
    const cutoff = now - (days * 24 * 60 * 60 * 1000);

    // Filter to recent sessions
    const recent = sessions.filter(s => s.start_time >= cutoff);

    // Group by date
    const byDate = new Map<string, SessionAnalytics[]>();
    recent.forEach(session => {
      const date = new Date(session.start_time).toISOString().split('T')[0];
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(session);
    });

    // Calculate summaries
    const summaries: DailyCostSummary[] = [];
    byDate.forEach((daySessions, date) => {
      const total_cost = daySessions.reduce((sum, s) => sum + s.total_cost, 0);
      const total_tokens = daySessions.reduce((sum, s) => sum + s.total_tokens, 0);

      summaries.push({
        date,
        total_cost,
        total_tokens,
        sessions: daySessions.length,
        agents: [], // Would aggregate agent-level data
      });
    });

    return summaries.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Get weekly summary
   */
  getWeeklyCosts(): DailyCostSummary[] {
    return this.getDailyCosts(7);
  }

  /**
   * Get monthly summary
   */
  getMonthlyCosts(): DailyCostSummary[] {
    return this.getDailyCosts(30);
  }

  /**
   * Export to CSV
   */
  exportToCSV(outputPath: string): void {
    const sessions = this.getAllSessions();

    const header = 'session_id,date,mode,duration_s,tokens,cost,cache_efficiency,agents,tools\n';
    const rows = sessions.map(s => {
      const date = new Date(s.start_time).toISOString();
      return `${s.session_id},${date},${s.mode || ''},${s.duration_seconds},${s.total_tokens},${s.total_cost},${s.cache_efficiency},${s.agents_used},${s.tool_calls}`;
    }).join('\n');

    fs.writeFileSync(outputPath, header + rows);
    logger.info(`[Analytics] Exported to ${outputPath}`);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionAnalytics | null {
    const sessions = this.getAllSessions();
    return sessions.find(s => s.session_id === sessionId) || null;
  }

  // Private helpers

  private updateCacheEfficiency(): void {
    if (!this.currentSession) return;

    const total = this.currentSession.cache_hits + this.currentSession.cache_misses;
    if (total === 0) {
      this.currentSession.cache_efficiency = 0;
    } else {
      this.currentSession.cache_efficiency = this.currentSession.cache_hits / total;
    }
  }

  private saveSession(session: SessionAnalytics): void {
    try {
      const line = JSON.stringify(session) + '\n';
      fs.appendFileSync(this.trackingFile, line);
      logger.debug(`[Analytics] Saved session ${session.session_id}`);
    } catch (error) {
      logger.error(`[Analytics] Failed to save session: ${error}`);
    }
  }
}

// Singleton instance
let analyticsInstance: AnalyticsSystem | null = null;

export function getAnalytics(): AnalyticsSystem {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsSystem();
  }
  return analyticsInstance;
}
