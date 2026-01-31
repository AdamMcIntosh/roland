/**
 * Swarm Mode - 8 Dynamic Agents with Shared Memory
 * 
 * Execution Flow:
 * 1. Initialize 8 agents with shared memory context
 * 2. All agents work in parallel with full context
 * 3. Results aggregated into comprehensive synthesis
 * 4. Shared memory enables cross-agent awareness
 * 
 * Agents (8):
 * - Architect: System design and architecture
 * - Researcher: Research, analysis, and investigation
 * - Designer: UX/UI and visual design
 * - Writer: Documentation, communication, writing
 * - Vision: Big picture thinking and strategy
 * - Critic: Quality assurance and analysis
 * - Analyst: Data analysis and metrics
 * - Executor: Implementation and execution
 */

import { BaseMode, ModeConfig, ModeExecutionResult, AgentTaskOutput } from './base-mode.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { agentLoader } from '../agents/index.js';
import { logger } from '../utils/logger.js';
import { ComplexityAnalyzer } from '../utils/complexity-analyzer.js';

const SWARM_CONFIG: ModeConfig = {
  name: 'Swarm',
  description: '8 dynamic agents with shared memory for complex problem solving',
  agents: [
    'architect',
    'researcher',
    'designer',
    'writer',
    'vision',
    'critic',
    'analyst',
    'executor'
  ],
  keyword: 'swarm:'
};

interface SwarmAgentContext {
  agentName: string;
  specialization: string;
}

interface SharedMemory {
  query: string;
  complexity: string;
  executionStart: number;
  insights: Map<string, string>;
}

export class SwarmMode extends BaseMode {
  constructor(
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    super(SWARM_CONFIG, modelRouter, costCalculator, cacheManager);
  }

  async execute(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ModeExecutionResult> {
    const startTime = Date.now();

    try {
      // Analyze query complexity to determine optimal agent count
      const analysis = ComplexityAnalyzer.analyze(query);
      const normalizedComplexity = complexity === 'explain' ? 'complex' : complexity;
      const selectedAgentNames = ComplexityAnalyzer.recommendAgentsForMode(
        analysis.level,
        'swarm'
      );

      logger.info(
        `[Swarm] Starting mode execution with ${selectedAgentNames.length} agents (${analysis.level} complexity, score: ${analysis.score})`
      );
      logger.debug(`[Swarm] Reasoning: ${analysis.reasoning.join(', ')}`);

      // Load selected agents
      const agentMap = new Map<string, any>();
      selectedAgentNames.forEach((agentName) => {
        const agent = agentLoader.getAgent(agentName);
        if (agent) {
          agentMap.set(agentName, agent);
        }
      });

      if (agentMap.size === 0) {
        throw new Error('[Swarm] No agents available');
      }

      // Initialize shared memory
      const sharedMemory: SharedMemory = {
        query,
        complexity,
        executionStart: startTime,
        insights: new Map(),
      };

      // Define agent specializations (filter to selected agents only)
      const allAgentContexts: SwarmAgentContext[] = [
        { agentName: 'architect', specialization: 'System design and architecture' },
        { agentName: 'researcher', specialization: 'Research and investigation' },
        { agentName: 'designer', specialization: 'UX/UI and visual design' },
        { agentName: 'writer', specialization: 'Documentation and communication' },
        { agentName: 'vision', specialization: 'Strategic vision and planning' },
        { agentName: 'critic', specialization: 'Quality assurance and critique' },
        { agentName: 'analyst', specialization: 'Data analysis and metrics' },
        { agentName: 'executor', specialization: 'Implementation and execution' },
      ];

      const agentContexts = allAgentContexts.filter(ctx =>
        selectedAgentNames.includes(ctx.agentName)
      );

      // Execute selected agents in parallel with shared memory
      logger.debug(`[Swarm] Launching ${agentContexts.length} parallel tasks with shared memory`);
      const parallelPromises = agentContexts.map((ctx) =>
        this.executeSwarmAgent(
          agentMap.get(ctx.agentName),
          query,
          complexity,
          ctx.specialization,
          sharedMemory
        )
      );

      const results = await Promise.all(parallelPromises);

      // Synthesize results with shared memory insights
      const synthesized = this.synthesizeSwarmResults(results, query, sharedMemory);

      const endTime = Date.now();
      const duration = endTime - startTime;

      const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
      logger.info(
        `[Swarm] Execution complete. Total cost: $${totalCost.toFixed(6)}, Duration: ${duration}ms`
      );

      return {
        mode: 'swarm',
        query,
        agentResults: results,
        synthesizedResult: synthesized,
        totalCost,
        totalDuration: duration,
        startTime,
        endTime,
      };
    } catch (error) {
      logger.error(`[Swarm] Execution failed:`, error);
      throw new Error(`Swarm mode execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute individual agent with access to shared memory
   */
  private async executeSwarmAgent(
    agent: any,
    taskQuery: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain',
    specialization: string,
    sharedMemory: SharedMemory
  ): Promise<AgentTaskOutput> {
    const taskStartTime = Date.now();

    try {
      // Use static method and pass routing context
      const modelSelection = ModelRouter.selectCheapestModel({
        queryLength: taskQuery.length,
        complexity: complexity as 'simple' | 'medium' | 'complex'
      });
      logger.debug(
        `[Swarm] ${agent.name} using model ${modelSelection.model} (${specialization})`
      );

      // Check cache first - key by agent + query to avoid cache collisions
      const cacheKey = `swarm_${agent.name}:${this.generateCacheKey(taskQuery)}`;
      const cached = this.cacheManager.get(cacheKey);

      let result: string;
      let cachedHit = false;

      if (cached) {
        result = cached as string;
        cachedHit = true;
        logger.debug(`[Swarm] Cache hit for ${agent.name}`);
      } else {
        // Simulate execution with shared memory awareness
        result = `[${agent.name} - ${specialization}]\n${taskQuery.substring(0, 100)}...\n\n[Result from ${modelSelection.model}]`;

        // Store insight in shared memory
        sharedMemory.insights.set(agent.name, result.substring(0, 50));

        // Cache the result
        const costEstimate = (taskQuery.length / 4 / 1000) * modelSelection.costPer1kTokens;
        this.cacheManager.set(cacheKey, result, modelSelection.model, costEstimate);
      }

      // Calculate cost
      const estimatedTokens = Math.ceil(taskQuery.length / 4);
      const cost = (estimatedTokens / 1000) * modelSelection.costPer1kTokens;
      this.costCalculator.recordCost(
        modelSelection.model,
        estimatedTokens,
        Math.ceil(result.length / 4),
        `swarm-${agent.name}`
      );

      const taskDuration = Date.now() - taskStartTime;

      return {
        agentName: agent.name,
        result,
        cost,
        duration: taskDuration,
        model: modelSelection.model,
        cachedHit
      };
    } catch (error) {
      logger.error(`[Swarm] Task execution failed for ${agent.name}:`, error);
      throw error;
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
   * Synthesize results from swarm with shared memory (dynamic agent count)
   */
  private synthesizeSwarmResults(
    results: AgentTaskOutput[],
    originalQuery: string,
    sharedMemory: SharedMemory
  ): string {
    if (results.length === 0) {
      return 'No results from swarm agents';
    }

    const agentResults = results;
    const agentSections = agentResults
      .map((result) => `### ${result.agentName}\n${result.result}`)
      .join('\n\n');

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const cachedCount = results.filter((r) => r.cachedHit).length;

    let resultText = `
## Swarm Execution Summary (${results.length} Agents with Shared Memory)

### Original Task
${originalQuery}

### Agent Insights from Shared Memory
${Array.from(sharedMemory.insights.entries())
  .map(([agent, insight]) => `- **${agent}**: ${insight}`)
  .join('\n')}

${agentSections}

---

### Swarm Execution Metrics
- **Agents**: ${results.length} (${results.map((r) => r.agentName).join(', ')})
- **Execution Type**: Parallel with Shared Memory
- **Total Cost**: $${totalCost.toFixed(6)}
- **Max Duration**: ${Math.max(...results.map((r) => r.duration))}ms (parallel execution time)
- **Cached Results**: ${cachedCount}/${results.length}
- **Memory Insights**: ${sharedMemory.insights.size} insights collected
- **Models Used**: ${[...new Set(results.map((r) => r.model))].join(', ')}
`;

    return resultText;
  }
}
