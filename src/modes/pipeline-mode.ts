/**
 * Pipeline Mode - 4-Step Sequential Processing
 * 
 * Execution Flow:
 * Step 1 (Planner/Architect) - Break down task into steps and plan approach
 * Step 2 (Executor) - Implement the solution based on plan
 * Step 3 (Critic/Reviewer) - Review and validate the work
 * Step 4 (Writer/Explainer) - Document and explain what was done
 * 
 * Key Feature: Each step's output feeds as context into the next step
 * Sequential execution ensures dependencies are handled properly
 */

import { BaseMode, ModeConfig, ModeExecutionResult, AgentTaskOutput } from './base-mode.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { agentLoader } from '../agents/index.js';
import { logger } from '../utils/logger.js';

const PIPELINE_CONFIG: ModeConfig = {
  name: 'Pipeline',
  description: '4-step sequential processing pipeline',
  agents: ['architect', 'executor', 'critic', 'writer'],
  keyword: 'pipeline:'
};

interface PipelineStep {
  name: string;
  agent: string;
  description: string;
  role: string;
}

export class PipelineMode extends BaseMode {
  constructor(
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    super(PIPELINE_CONFIG, modelRouter, costCalculator, cacheManager);
  }

  async execute(
    query: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain'
  ): Promise<ModeExecutionResult> {
    const startTime = Date.now();
    logger.info(`[Pipeline] Starting 4-step sequential processing`);

    try {
      // Load agents for pipeline
      const agentMap = new Map<string, any>();
      PIPELINE_CONFIG.agents.forEach((agentName) => {
        const agent = agentLoader.getAgent(agentName);
        if (agent) {
          agentMap.set(agentName, agent);
        }
      });

      if (agentMap.size === 0) {
        throw new Error('[Pipeline] No agents available');
      }

      // Define pipeline steps
      const steps: PipelineStep[] = [
        {
          name: 'Planning',
          agent: 'architect',
          description: 'Break down task into steps',
          role: 'planning and architecture',
        },
        {
          name: 'Execution',
          agent: 'executor',
          description: 'Implement based on plan',
          role: 'implementation',
        },
        {
          name: 'Review',
          agent: 'critic',
          description: 'Review and validate work',
          role: 'quality assurance',
        },
        {
          name: 'Documentation',
          agent: 'writer',
          description: 'Document and explain results',
          role: 'documentation',
        },
      ];

      // Execute pipeline steps sequentially
      const results: AgentTaskOutput[] = [];
      let pipelineContext = query; // Context flows through pipeline

      logger.debug('[Pipeline] Starting 4-step sequential execution');

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepAgent = agentMap.get(step.agent);

        if (!stepAgent) {
          logger.warn(`[Pipeline] Agent not found for step: ${step.name}`);
          continue;
        }

        logger.debug(`[Pipeline] Step ${i + 1}/${steps.length}: ${step.name}`);

        // Execute step with accumulated context
        const stepResult = await this.executePipelineStep(
          stepAgent,
          pipelineContext,
          complexity,
          step.role,
          i + 1
        );

        results.push(stepResult);

        // Flow output to next step as context
        pipelineContext = `[${step.name} Output]\n${stepResult.result}`;
      }

      // Synthesize all pipeline steps
      const synthesized = this.synthesizePipelineResults(results, query);

      const endTime = Date.now();
      const duration = endTime - startTime;

      const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
      logger.info(
        `[Pipeline] Execution complete. Total cost: $${totalCost.toFixed(6)}, Duration: ${duration}ms`
      );

      return {
        mode: 'pipeline',
        query,
        agentResults: results,
        synthesizedResult: synthesized,
        totalCost,
        totalDuration: duration,
        startTime,
        endTime,
      };
    } catch (error) {
      logger.error(`[Pipeline] Execution failed:`, error);
      throw new Error(`Pipeline mode execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a single pipeline step with context flowing from previous step
   */
  private async executePipelineStep(
    agent: any,
    stepContext: string,
    complexity: 'simple' | 'medium' | 'complex' | 'explain',
    role: string,
    stepNumber: number
  ): Promise<AgentTaskOutput> {
    const taskStartTime = Date.now();

    try {
      // Use static method and pass routing context
      const modelSelection = ModelRouter.selectCheapestModel({
        queryLength: stepContext.length,
        complexity: complexity as 'simple' | 'medium' | 'complex'
      });
      logger.debug(
        `[Pipeline] Step ${stepNumber}: ${agent.name} using model ${modelSelection.model} (${role})`
      );

      // Check cache first - key by step + agent + query
      const cacheKey = `pipeline_step${stepNumber}_${agent.name}:${this.generateCacheKey(stepContext)}`;
      const cached = this.cacheManager.get(cacheKey);

      let result: string;
      let cachedHit = false;

      if (cached) {
        result = cached as string;
        cachedHit = true;
        logger.debug(`[Pipeline] Cache hit for step ${stepNumber}`);
      } else {
        // Simulate execution - in production would call actual model
        result = `[Step ${stepNumber} - ${agent.name} (${role})]\n${stepContext.substring(0, 100)}...\n\n[Result from ${modelSelection.model}]`;

        // Cache the result
        const costEstimate = (stepContext.length / 4 / 1000) * modelSelection.costPer1kTokens;
        this.cacheManager.set(cacheKey, result, modelSelection.model, costEstimate);
      }

      // Calculate cost
      const estimatedTokens = Math.ceil(stepContext.length / 4);
      const cost = (estimatedTokens / 1000) * modelSelection.costPer1kTokens;
      this.costCalculator.recordCost(
        modelSelection.model,
        estimatedTokens,
        Math.ceil(result.length / 4),
        `pipeline-step${stepNumber}-${agent.name}`
      );

      const taskDuration = Date.now() - taskStartTime;

      return {
        agentName: `${agent.name} (Step ${stepNumber})`,
        result,
        cost,
        duration: taskDuration,
        model: modelSelection.model,
        cachedHit
      };
    } catch (error) {
      logger.error(`[Pipeline] Step ${stepNumber} failed for ${agent.name}:`, error);
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
   * Synthesize results from 4-step sequential pipeline
   */
  private synthesizePipelineResults(
    results: AgentTaskOutput[],
    originalQuery: string
  ): string {
    if (results.length === 0) {
      return 'No results from pipeline execution';
    }

    const stepNames = ['Planning (Architect)', 'Execution', 'Review (Critic)', 'Documentation (Writer)'];
    const stepResults = results.slice(0, 4);

    return `
## Pipeline Execution Summary (4-Step Sequential)

### Original Query
${originalQuery}

### Step-by-Step Results

${stepResults
  .map(
    (result, idx) => `#### Step ${idx + 1}: ${stepNames[idx] || `Step ${idx + 1}`}
${result.result}
`
  )
  .join('\n')}

---

### Pipeline Execution Flow
\`\`\`
Step 1 (Planning) 
    ↓ (output → context)
Step 2 (Execution)
    ↓ (output → context)
Step 3 (Review)
    ↓ (output → context)
Step 4 (Documentation)
    ↓
FINAL OUTPUT
\`\`\`

### Pipeline Metrics
- **Pipeline Stages**: 4 (Sequential)
- **Execution Model**: Step-by-step context flow
- **Total Cost**: $${stepResults.reduce((sum, r) => sum + r.cost, 0).toFixed(6)}
- **Total Duration**: ${stepResults.reduce((sum, r) => sum + r.duration, 0)}ms (cumulative)
- **Cached Results**: ${stepResults.filter((r) => r.cachedHit).length}/${stepResults.length}
- **Data Flow**: Each step output feeds as input to next step
`;
  }
}
