/**
 * Performance Monitor - Real-time performance tracking
 * 
 * Tracks latency, success rates, and efficiency metrics across:
 * - Agents
 * - Modes
 * - LLM Providers
 */

import { logger } from './logger.js';

export interface PerformanceMetric {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalLatency: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  totalTokens: number;
  totalCost: number;
  lastUpdated: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  agents: Map<string, PerformanceMetric>;
  modes: Map<string, PerformanceMetric>;
  providers: Map<string, PerformanceMetric>;
  global: PerformanceMetric;
}

export class PerformanceMonitor {
  private static agentMetrics = new Map<string, PerformanceMetric>();
  private static modeMetrics = new Map<string, PerformanceMetric>();
  private static providerMetrics = new Map<string, PerformanceMetric>();
  private static globalMetric: PerformanceMetric = this.createEmptyMetric();

  /**
   * Create an empty metric structure
   */
  private static createEmptyMetric(): PerformanceMetric {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalLatency: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      totalTokens: 0,
      totalCost: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get or create a metric for a specific key
   */
  private static getOrCreateMetric(
    map: Map<string, PerformanceMetric>,
    key: string
  ): PerformanceMetric {
    if (!map.has(key)) {
      map.set(key, this.createEmptyMetric());
    }
    return map.get(key)!;
  }

  /**
   * Update a metric with new data
   */
  private static updateMetric(
    metric: PerformanceMetric,
    latency: number,
    tokens: number,
    cost: number,
    success: boolean
  ): void {
    metric.totalCalls++;
    if (success) {
      metric.successfulCalls++;
    } else {
      metric.failedCalls++;
    }

    metric.totalLatency += latency;
    metric.averageLatency = metric.totalLatency / metric.totalCalls;
    metric.minLatency = Math.min(metric.minLatency, latency);
    metric.maxLatency = Math.max(metric.maxLatency, latency);
    metric.totalTokens += tokens;
    metric.totalCost += cost;
    metric.lastUpdated = Date.now();
  }

  /**
   * Record a performance event
   * 
   * @param agent - Agent name
   * @param mode - Mode name
   * @param provider - LLM provider
   * @param latency - Response latency in ms
   * @param tokens - Total tokens used
   * @param cost - Cost of the call
   * @param success - Whether the call succeeded
   */
  static record(
    agent: string,
    mode: string,
    provider: string,
    latency: number,
    tokens: number,
    cost: number,
    success: boolean
  ): void {
    // Update agent metrics
    const agentMetric = this.getOrCreateMetric(this.agentMetrics, agent);
    this.updateMetric(agentMetric, latency, tokens, cost, success);

    // Update mode metrics
    const modeMetric = this.getOrCreateMetric(this.modeMetrics, mode);
    this.updateMetric(modeMetric, latency, tokens, cost, success);

    // Update provider metrics
    const providerMetric = this.getOrCreateMetric(this.providerMetrics, provider);
    this.updateMetric(providerMetric, latency, tokens, cost, success);

    // Update global metrics
    this.updateMetric(this.globalMetric, latency, tokens, cost, success);

    logger.debug(
      `[Performance] ${agent}@${mode} via ${provider}: ${latency}ms, ${tokens} tokens, $${cost.toFixed(6)}, ${success ? 'SUCCESS' : 'FAILED'}`
    );
  }

  /**
   * Get current performance snapshot
   */
  static getSnapshot(): PerformanceSnapshot {
    return {
      timestamp: Date.now(),
      agents: new Map(this.agentMetrics),
      modes: new Map(this.modeMetrics),
      providers: new Map(this.providerMetrics),
      global: { ...this.globalMetric },
    };
  }

  /**
   * Get performance metrics for a specific agent
   */
  static getAgentMetrics(agent: string): PerformanceMetric | null {
    return this.agentMetrics.get(agent) || null;
  }

  /**
   * Get performance metrics for a specific mode
   */
  static getModeMetrics(mode: string): PerformanceMetric | null {
    return this.modeMetrics.get(mode) || null;
  }

  /**
   * Get performance metrics for a specific provider
   */
  static getProviderMetrics(provider: string): PerformanceMetric | null {
    return this.providerMetrics.get(provider) || null;
  }

  /**
   * Get global performance metrics
   */
  static getGlobalMetrics(): PerformanceMetric {
    return { ...this.globalMetric };
  }

  /**
   * Generate formatted performance report
   */
  static generateReport(): string {
    const lines: string[] = [];
    lines.push('\n═══════════════════════════════════════════════════════');
    lines.push('              PERFORMANCE DASHBOARD');
    lines.push('═══════════════════════════════════════════════════════\n');

    // Global metrics
    const global = this.globalMetric;
    const successRate = global.totalCalls > 0 
      ? ((global.successfulCalls / global.totalCalls) * 100).toFixed(1) 
      : '0.0';
    
    lines.push('📊 GLOBAL METRICS');
    lines.push(`   Total Calls:     ${global.totalCalls}`);
    lines.push(`   Success Rate:    ${successRate}% (${global.successfulCalls}/${global.totalCalls})`);
    lines.push(`   Avg Latency:     ${global.averageLatency.toFixed(0)}ms`);
    lines.push(`   Latency Range:   ${global.minLatency === Infinity ? 0 : global.minLatency}ms - ${global.maxLatency}ms`);
    lines.push(`   Total Tokens:    ${global.totalTokens.toLocaleString()}`);
    lines.push(`   Total Cost:      $${global.totalCost.toFixed(6)}\n`);

    // Top agents by calls
    if (this.agentMetrics.size > 0) {
      lines.push('🤖 TOP AGENTS (by calls)');
      const sortedAgents = Array.from(this.agentMetrics.entries())
        .sort((a, b) => b[1].totalCalls - a[1].totalCalls)
        .slice(0, 5);
      
      for (const [agent, metric] of sortedAgents) {
        const rate = ((metric.successfulCalls / metric.totalCalls) * 100).toFixed(0);
        lines.push(`   ${agent.padEnd(15)} ${metric.totalCalls} calls, ${metric.averageLatency.toFixed(0)}ms avg, ${rate}% success`);
      }
      lines.push('');
    }

    // Modes
    if (this.modeMetrics.size > 0) {
      lines.push('🚀 MODES');
      const sortedModes = Array.from(this.modeMetrics.entries())
        .sort((a, b) => b[1].totalCalls - a[1].totalCalls);
      
      for (const [mode, metric] of sortedModes) {
        const rate = ((metric.successfulCalls / metric.totalCalls) * 100).toFixed(0);
        lines.push(`   ${mode.padEnd(15)} ${metric.totalCalls} calls, ${metric.averageLatency.toFixed(0)}ms avg, $${metric.totalCost.toFixed(4)}`);
      }
      lines.push('');
    }

    // Providers
    if (this.providerMetrics.size > 0) {
      lines.push('🔌 PROVIDERS');
      const sortedProviders = Array.from(this.providerMetrics.entries())
        .sort((a, b) => b[1].totalCalls - a[1].totalCalls);
      
      for (const [provider, metric] of sortedProviders) {
        const rate = ((metric.successfulCalls / metric.totalCalls) * 100).toFixed(0);
        const avgCost = metric.totalCalls > 0 ? metric.totalCost / metric.totalCalls : 0;
        lines.push(`   ${provider.padEnd(15)} ${metric.totalCalls} calls, ${metric.averageLatency.toFixed(0)}ms avg, $${avgCost.toFixed(6)}/call`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════\n');
    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  static reset(): void {
    this.agentMetrics.clear();
    this.modeMetrics.clear();
    this.providerMetrics.clear();
    this.globalMetric = this.createEmptyMetric();
    logger.info('[Performance] Metrics reset');
  }

  /**
   * Get top performing agents
   */
  static getTopAgents(limit: number = 5): Array<[string, PerformanceMetric]> {
    return Array.from(this.agentMetrics.entries())
      .sort((a, b) => {
        // Sort by success rate, then by total calls
        const aRate = a[1].successfulCalls / a[1].totalCalls;
        const bRate = b[1].successfulCalls / b[1].totalCalls;
        if (Math.abs(aRate - bRate) > 0.01) {
          return bRate - aRate;
        }
        return b[1].totalCalls - a[1].totalCalls;
      })
      .slice(0, limit);
  }

  /**
   * Get slowest agents (by average latency)
   */
  static getSlowestAgents(limit: number = 5): Array<[string, PerformanceMetric]> {
    return Array.from(this.agentMetrics.entries())
      .filter(([_, metric]) => metric.totalCalls > 0)
      .sort((a, b) => b[1].averageLatency - a[1].averageLatency)
      .slice(0, limit);
  }

  /**
   * Get most expensive providers
   */
  static getMostExpensiveProviders(): Array<[string, PerformanceMetric]> {
    return Array.from(this.providerMetrics.entries())
      .sort((a, b) => b[1].totalCost - a[1].totalCost);
  }
}
