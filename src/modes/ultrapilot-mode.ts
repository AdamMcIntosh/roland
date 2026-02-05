/**
 * Ultrapilot Mode - 5 Parallel Subagents
 * 
 * Execution Flow:
 * 1. All 5 agents work in parallel on specialized aspects
 * 2. Results are aggregated and synthesized
 * 3. Output combines all perspectives
 * 
 * Agents:
 * - Architect: System design and structure
 * - Researcher: Research and analysis
 * - Designer: UX/interface design
 * - Writer: Documentation and explanation
 * - Executor: Implementation and execution
 */

import { BaseMode, ModeConfig, ModeExecutionResult, AgentTaskOutput } from './base-mode.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { agentLoader } from '../agents/index.js';
import { logger } from '../utils/logger.js';
import { ProgressTracker } from '../cli/progress-tracker.js';

const ULTRAPILOT_CONFIG: ModeConfig = {
  name: 'Ultrapilot',
  description: '5 parallel agents for maximum throughput',
  agents: ['architect', 'researcher', 'designer', 'writer', 'executor'],
  keyword: 'ultrapilot:'
};

interface ParallelTaskContext {
  agentName: string;
  context: string;
}

export class UltrapilotMode extends BaseMode {
  constructor(
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    super(ULTRAPILOT_CONFIG, modelRouter, costCalculator, cacheManager);
  }

  async execute(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ModeExecutionResult> {
    const startTime = Date.now();

    // Initialize progress tracker
    const agentNames = ['architect', 'researcher', 'designer', 'writer', 'executor'];
    const progress = new ProgressTracker(true);
    progress.start('ultrapilot:', agentNames, query);

    try {
      const normalizedComplexity = complexity === 'explain' ? 'complex' : complexity;

      logger.info(
        `[Ultrapilot] Starting 5-agent parallel execution for: "${query.substring(0, 50)}..."`
      );

      // Fixed 5 agents for Ultrapilot (no dynamic selection)
      const agentMap = new Map<string, any>();
      
      for (const agentName of agentNames) {
        const agent = agentLoader.getAgent(agentName);
        if (agent) {
          agentMap.set(agentName, agent);
        }
      }

      if (agentMap.size === 0) {
        throw new Error('[Ultrapilot] No agents available');
      }

      // Define task contexts
      const taskContexts = [
        { agentName: 'architect', context: 'System architecture and design' },
        { agentName: 'researcher', context: 'Research and analysis' },
        { agentName: 'designer', context: 'User experience and interface design' },
        { agentName: 'writer', context: 'Documentation and explanation' },
        { agentName: 'executor', context: 'Implementation and execution' },
      ].filter(ctx => agentMap.has(ctx.agentName));

      // Update all agents to running
      taskContexts.forEach((ctx) => progress.updateAgent(ctx.agentName, 'running'));

      // Execute all agents in parallel
      logger.debug(`[Ultrapilot] Launching ${taskContexts.length} parallel tasks`);
      const parallelPromises = taskContexts.map((ctx) => {
        const agent = agentMap.get(ctx.agentName)!;
        const taskInput = this.specializeQueryForAgent(query, agent, { context: ctx.context });
        return this.executeTaskWithAPI(agent, taskInput, normalizedComplexity);
      });

      const results = await Promise.all(parallelPromises);

      // Update progress for completed agents
      results.forEach((result) => {
        progress.completeAgent(result.agentName, result.cost, result.duration);
      });

      // Synthesize results
      const synthesized = this.synthesizeUltrapilotResults(results, query);

      const endTime = Date.now();
      const duration = endTime - startTime;

      const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
      
      // Print completion message
      console.log(progress.stop());

      logger.info(
        `[Ultrapilot] Execution complete. Total cost: $${totalCost.toFixed(6)}, Duration: ${duration}ms`
      );

      return {
        mode: 'ultrapilot',
        query,
        agentResults: results,
        synthesizedResult: synthesized,
        totalCost,
        totalDuration: duration,
        startTime,
        endTime,
      };
    } catch (error) {
      logger.error(`[Ultrapilot] Execution failed:`, error);
      console.log(progress.stop());
      throw new Error(`Ultrapilot mode execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate cache key from query
   */
  private generateCacheKey(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `query_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Synthesize results from parallel agents (dynamic count)
   */
  private synthesizeUltrapilotResults(
    results: AgentTaskOutput[],
    originalQuery: string
  ): string {
    if (results.length === 0) {
      return 'No results from agents';
    }

    const agentSections = results
      .map((result) => `### ${result.agentName}\n${result.result}`)
      .join('\n\n');

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const cachedCount = results.filter((r) => r.cachedHit).length;

    return `
## Ultrapilot Execution Summary (${results.length} Parallel Agents)

### Original Task
${originalQuery}

${agentSections}

---

### Execution Metrics
- **Agents**: ${results.length} (${results.map((r) => r.agentName).join(', ')})
- **Total Cost**: $${totalCost.toFixed(6)}
- **Total Duration**: ${totalDuration}ms
- **Cached Results**: ${cachedCount}/${results.length}
- **Models Used**: ${[...new Set(results.map((r) => r.model))].join(', ')}
`;
  }
}
