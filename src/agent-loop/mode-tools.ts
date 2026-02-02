import { AutopilotMode } from '../modes/autopilot-mode';
import { UltrapilotMode } from '../modes/ultrapilot-mode';
import { SwarmMode } from '../modes/swarm-mode';
import { PipelineMode } from '../modes/pipeline-mode';
import { Ecomode } from '../modes/ecomode';
import { ModelRouter } from '../orchestrator/model-router';
import { CostCalculator } from '../orchestrator/cost-calculator';
import { CacheManager } from '../orchestrator/cache-manager';
import { logger } from '../utils/logger';
import { SessionConfig } from './types';

export interface ModeToolsConfig {
  config: SessionConfig;
  onConfirmation?: (action: string) => Promise<boolean>;
}

/**
 * Wraps existing execution modes as agent tools
 * Note: Actual mode instantiation and execution delegated to main orchestrator
 */
export class ModeTools {
  private config: ModeToolsConfig;
  private modelRouter: ModelRouter;
  private costCalculator: CostCalculator;
  private cacheManager: CacheManager;

  constructor(config: ModeToolsConfig) {
    this.config = config;
    // Initialize dependencies for mode execution
    this.modelRouter = new ModelRouter();
    this.costCalculator = new CostCalculator();
    this.cacheManager = new CacheManager();
  }

  /**
   * List available modes
   */
  listModes(): Array<{
    name: string;
    description: string;
    bestFor: string;
  }> {
    return [
      {
        name: 'autopilot',
        description: 'Automatic task execution with intelligent agent orchestration',
        bestFor: 'Multi-step workflows with auto-decision making',
      },
      {
        name: 'ultrapilot',
        description: 'Maximum capability mode using most expensive model (gpt-4o)',
        bestFor: 'Complex, high-stakes problems requiring best reasoning',
      },
      {
        name: 'swarm',
        description: 'Orchestrates multiple specialized agents working together',
        bestFor: 'Large projects needing diverse expert perspectives',
      },
      {
        name: 'pipeline',
        description: 'Sequential execution with structured workflow stages',
        bestFor: 'Defined processes that benefit from step-by-step execution',
      },
      {
        name: 'ecomode',
        description: 'Budget-conscious mode using cheapest model (grok)',
        bestFor: 'Cost-sensitive tasks, prototyping, bulk processing',
      },
    ];
  }

  /**
   * Request mode execution - actually executes the mode
   */
  async requestModeExecution(modeName: string, task: string, context?: string): Promise<string> {
    try {
      if (this.config.config.autoConfirm?.terminal !== true) {
        if (this.config.onConfirmation) {
          const confirmed = await this.config.onConfirmation(
            `Run ${modeName} mode for: "${task}"?`
          );
          if (!confirmed) {
            throw new Error(`${modeName} execution cancelled by user`);
          }
        }
      }

      logger.info(`Executing ${modeName} mode`, { task, context });

      let result: string = '';

      switch (modeName.toLowerCase()) {
        case 'autopilot':
          const autopilot = new AutopilotMode(
            this.modelRouter,
            this.costCalculator,
            this.cacheManager
          );
          const autopilotResult = await autopilot.execute(task, 'medium');
          result = autopilotResult.synthesizedResult;
          break;

        case 'ultrapilot':
          const ultrapilot = new UltrapilotMode(
            this.modelRouter,
            this.costCalculator,
            this.cacheManager
          );
          const ultrapilotResult = await ultrapilot.execute(task, 'complex');
          result = ultrapilotResult.synthesizedResult;
          break;

        case 'swarm':
          const swarm = new SwarmMode(
            this.modelRouter,
            this.costCalculator,
            this.cacheManager
          );
          const swarmResult = await swarm.execute(task, 'complex');
          result = swarmResult.synthesizedResult;
          break;

        case 'pipeline':
          const pipeline = new PipelineMode(
            this.modelRouter,
            this.costCalculator,
            this.cacheManager
          );
          const pipelineResult = await pipeline.execute(task, 'medium');
          result = pipelineResult.synthesizedResult;
          break;

        case 'ecomode':
          const ecomode = new Ecomode(
            this.modelRouter,
            this.costCalculator,
            this.cacheManager
          );
          const ecoresult = await ecomode.execute(task, 'simple');
          result = ecoresult.synthesizedResult;
          break;

        default:
          throw new Error(`Unknown mode: ${modeName}`);
      }

      logger.info(`${modeName} mode completed successfully`, { resultLength: result.length });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Mode execution request failed: ${message}`);
      throw error;
    }
  }

  /**
   * Get mode recommendation for a task
   */
  recommendMode(
    task: string,
    context?: {
      budget?: number;
      complexity?: 'simple' | 'moderate' | 'complex';
      requiresMultipleAgents?: boolean;
      needsFastResponse?: boolean;
    }
  ): string {
    const defaultContext = {
      budget: 20,
      complexity: 'moderate' as const,
      requiresMultipleAgents: false,
      needsFastResponse: false,
      ...context,
    };

    // Budget-conscious
    if (defaultContext.budget < 5) {
      return 'ecomode';
    }

    // Very complex problems
    if (defaultContext.complexity === 'complex' && defaultContext.budget > 10) {
      return 'ultrapilot';
    }

    // Multiple agents needed
    if (defaultContext.requiresMultipleAgents) {
      return 'swarm';
    }

    // Structured workflows
    if (task.toLowerCase().includes('step') || task.toLowerCase().includes('workflow')) {
      return 'pipeline';
    }

    // Default
    return 'autopilot';
  }
}
