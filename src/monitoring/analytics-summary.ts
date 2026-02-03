/**
 * Analytics Summary
 * 
 * Fast session summary loading with mtime caching
 */

import fs from 'fs';
import path from 'path';
import { SessionAnalytics } from './types.js';
import { logger } from '../utils/logger.js';

export interface AnalyticsSummary {
  sessionId: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheHits: number;
  cacheMisses: number;
  cacheEfficiency: number;
  agentsUsed: number;
  toolCalls: number;
  duration: number;
  startTime: number;
  endTime?: number;
  mode?: string;
  agentBreakdown: Array<{
    agentType: string;
    tokens: number;
    cost: number;
    executions: number;
  }>;
}

/**
 * Summary cache for fast loading (<10ms)
 */
class SummaryCache {
  private cache = new Map<string, { summary: AnalyticsSummary; mtime: number }>();
  private stateDir: string;

  constructor(stateDir: string = './.samwise/state') {
    this.stateDir = stateDir;
  }

  /**
   * Get summary with mtime caching
   */
  getSummary(sessionId: string): AnalyticsSummary | null {
    const summaryPath = path.join(this.stateDir, `analytics-summary-${sessionId}.json`);

    try {
      // Check if file exists
      if (!fs.existsSync(summaryPath)) {
        return null;
      }

      // Get file mtime
      const stats = fs.statSync(summaryPath);
      const mtime = stats.mtimeMs;

      // Check cache
      const cached = this.cache.get(sessionId);
      if (cached && cached.mtime === mtime) {
        return cached.summary;
      }

      // Load from disk
      const content = fs.readFileSync(summaryPath, 'utf-8');
      const summary = JSON.parse(content) as AnalyticsSummary;

      // Update cache
      this.cache.set(sessionId, { summary, mtime });

      return summary;
    } catch (error) {
      logger.error(`[SummaryCache] Failed to load summary for ${sessionId}`, error);
      return null;
    }
  }

  /**
   * Save summary to disk
   */
  saveSummary(summary: AnalyticsSummary): void {
    const summaryPath = path.join(this.stateDir, `analytics-summary-${summary.sessionId}.json`);

    try {
      // Ensure directory exists
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }

      // Write to disk
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

      // Update cache
      const stats = fs.statSync(summaryPath);
      this.cache.set(summary.sessionId, {
        summary,
        mtime: stats.mtimeMs,
      });
    } catch (error) {
      logger.error(`[SummaryCache] Failed to save summary for ${summary.sessionId}`, error);
    }
  }

  /**
   * Create summary from session analytics
   */
  createSummary(session: SessionAnalytics): AnalyticsSummary {
    const agentBreakdown = session.agent_usage
      ? Object.entries(session.agent_usage).map(([agentType, usage]) => ({
          agentType,
          tokens: usage.tokens,
          cost: usage.cost,
          executions: 1, // Track in future
        }))
      : [];

    return {
      sessionId: session.session_id,
      totalCost: session.total_cost,
      totalTokens: session.total_tokens,
      inputTokens: 0, // Calculate from detailed logs
      outputTokens: 0, // Calculate from detailed logs
      cacheHits: session.cache_hits,
      cacheMisses: session.cache_misses,
      cacheEfficiency: session.cache_efficiency,
      agentsUsed: session.agents_used,
      toolCalls: session.tool_calls,
      duration: session.duration_seconds,
      startTime: session.start_time,
      endTime: session.ended_at ? session.ended_at.getTime() : undefined,
      mode: session.mode,
      agentBreakdown,
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Delete old summaries
   */
  cleanup(keepLast: number = 100): number {
    try {
      if (!fs.existsSync(this.stateDir)) {
        return 0;
      }

      const files = fs.readdirSync(this.stateDir)
        .filter(f => f.startsWith('analytics-summary-') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(this.stateDir, f),
          mtime: fs.statSync(path.join(this.stateDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Delete old files
      let deleted = 0;
      for (const file of files.slice(keepLast)) {
        fs.unlinkSync(file.path);
        const sessionId = file.name.replace('analytics-summary-', '').replace('.json', '');
        this.cache.delete(sessionId);
        deleted++;
      }

      return deleted;
    } catch (error) {
      logger.error('[SummaryCache] Cleanup failed', error);
      return 0;
    }
  }
}

// Singleton instance
let summaryCache: SummaryCache | null = null;

export function getSummaryCache(stateDir?: string): SummaryCache {
  if (!summaryCache) {
    summaryCache = new SummaryCache(stateDir);
  }
  return summaryCache;
}

export function resetSummaryCache(): void {
  if (summaryCache) {
    summaryCache.clear();
  }
  summaryCache = null;
}
