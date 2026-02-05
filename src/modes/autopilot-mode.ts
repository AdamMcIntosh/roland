/**
 * Autopilot Mode - Lead Agent + 2 Subagents
 * 
 * Execution Flow:
 * 1. Lead Agent (Executor) - Takes original task
 * 2. Subagent 1 (Architect) - Reviews and refines approach
 * 3. Subagent 2 (QA-Tester) - Validates and tests
 * 4. Lead Agent synthesizes final result
 */

import { BaseMode, ModeConfig, ModeExecutionResult, AgentTaskOutput } from './base-mode.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { agentLoader } from '../agents/agent-loader.js';
import { logger } from '../utils/logger.js';
import { ProgressTracker } from '../cli/progress-tracker.js';

/**
 * Autopilot Mode Configuration
 */
const AUTOPILOT_CONFIG: ModeConfig = {
  name: 'Autopilot',
  description: 'Lead agent with 2 subagents for balanced execution',
  agents: ['executor', 'architect', 'qa-tester'],
  leadAgent: 'executor',
  keyword: 'autopilot:',
  degradeTo: 'ecomode',
};

export class AutopilotMode extends BaseMode {
  constructor(
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    super(AUTOPILOT_CONFIG, modelRouter, costCalculator, cacheManager);
  }

  /**
   * Execute autopilot workflow
   * 1. Lead (executor) processes original query
   * 2. Subagent 1 (architect) reviews architecture
   * 3. Subagent 2 (qa-tester) validates quality
   * 4. Lead synthesizes final result
   */
  async execute(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ModeExecutionResult> {
    const startTime = Date.now();
    logger.info(`[Autopilot] Starting mode execution for: "${query.substring(0, 50)}..."`);

    // Initialize progress tracker
    const progress = new ProgressTracker(true);
    progress.start('autopilot:', ['executor', 'architect', 'qa-tester'], query);

    try {
      const agents = [
        agentLoader.getAgent('executor'),
        agentLoader.getAgent('architect'),
        agentLoader.getAgent('qa-tester')
      ].filter((a) => a !== null) as any[];

      if (agents.length === 0) {
        progress.errorAgent('executor', 'Agents not found');
        throw new Error('Required agents for Autopilot mode not found');
      }

      const results: AgentTaskOutput[] = [];
      let totalCost = 0;

      // Step 1: Lead Agent (Executor) - Process original query
      logger.debug('[Autopilot] Step 1/3: Lead agent (Executor) processing query');
      progress.updateAgent('executor', 'running');
      const leadResult = await this.executeAgentTask(
        agents[0],
        query,
        complexity,
        'execution'
      );
      progress.completeAgent('executor', leadResult.cost, leadResult.duration);
      results.push(leadResult);
      totalCost += leadResult.cost;

      // Step 2: Subagent 1 (Architect) - Review and refine approach
      logger.debug('[Autopilot] Step 2/3: Architect reviewing approach');
      progress.updateAgent('architect', 'running');
      const architectQuery = `Review and refine the approach for: ${query}\n\nPrevious result:\n${leadResult.result}`;
      const architectResult = await this.executeAgentTask(
        agents[1],
        architectQuery,
        'medium',
        'architectural_review'
      );
      progress.completeAgent('architect', architectResult.cost, architectResult.duration);
      results.push(architectResult);
      totalCost += architectResult.cost;

      // Step 3: Subagent 2 (QA-Tester) - Validate and test
      logger.debug('[Autopilot] Step 3/3: QA-Tester validating quality');
      progress.updateAgent('qa-tester', 'running');
      const qaQuery = `Test and validate the solution for: ${query}\n\nImplementation:\n${leadResult.result}\n\nReview:\n${architectResult.result}`;
      const qaResult = await this.executeAgentTask(agents[2], qaQuery, 'medium', 'quality_assurance');
      progress.completeAgent('qa-tester', qaResult.cost, qaResult.duration);
      results.push(qaResult);
      totalCost += qaResult.cost;

      // Step 4: Synthesize final result
      logger.debug('[Autopilot] Step 4/4: Lead agent synthesizing final result');
      const synthesizedResult = this.synthesizeAutopilotResults(results, query);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Print completion message
      console.log(progress.stop());

      logger.info(
        `[Autopilot] Execution complete. Total cost: $${totalCost.toFixed(6)}, Duration: ${duration}ms`
      );

      return {
        mode: 'autopilot',
        query,
        agentResults: results,
        synthesizedResult,
        totalCost,
        totalDuration: duration,
        startTime,
        endTime
      };
    } catch (error) {
      const endTime = Date.now();
      logger.error('[Autopilot] Execution failed:', error);
      console.log(progress.stop());

      throw new Error(`Autopilot mode execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  /**
   * Execute task for a single agent
   */
  private async executeAgentTask(
    agent: any,
    taskQuery: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain',
    context: string
  ): Promise<AgentTaskOutput> {
    const taskInput = this.specializeQueryForAgent(
      taskQuery,
      agent,
      { context }
    );

    return this.executeTaskWithAPI(agent, taskInput, complexity);
  }

  /**
   * Synthesize Autopilot results with lead agent summary
   */
  private synthesizeAutopilotResults(
    results: AgentTaskOutput[],
    originalQuery: string
  ): string {
    if (results.length === 0) {
      return 'No results from agents';
    }

    const executorResult = results[0];
    const architectResult = results[1];
    const qaResult = results[2];

    return `
## Autopilot Execution Summary

### Original Task
${originalQuery}

### Implementation (Executor)
${executorResult.result}

### Architectural Review (Architect)
${architectResult.result}

### Quality Assurance (QA-Tester)
${qaResult.result}

---

### Execution Metrics
- **Agents**: 3 (Executor, Architect, QA-Tester)
- **Total Cost**: $${(executorResult.cost + architectResult.cost + qaResult.cost).toFixed(6)}
- **Total Duration**: ${(executorResult.duration + architectResult.duration + qaResult.duration)}ms
- **Cached Results**: ${[executorResult, architectResult, qaResult].filter((r) => r.cachedHit).length}/${results.length}
`;
  }
}
