/**
 * Execution Modes - Index and Factory
 * 
 * Provides mode instances and routing
 */

import { AutopilotMode } from './autopilot-mode.js';
import { UltrapilotMode } from './ultrapilot-mode.js';
import { SwarmMode } from './swarm-mode.js';
import { PipelineMode } from './pipeline-mode.js';
import { Ecomode } from './ecomode.js';
import { AskMode } from './ask-mode.js';
import { BaseMode } from './base-mode.js';
import { ModelRouter } from '../orchestrator/model-router.js';
import { CostCalculator } from '../orchestrator/cost-calculator.js';
import { CacheManager } from '../orchestrator/cache-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Mode factory and registry
 */
export class ModeRegistry {
  private modes: Map<string, BaseMode>;
  private modelRouter: ModelRouter;
  private costCalculator: CostCalculator;
  private cacheManager: CacheManager;

  constructor(
    modelRouter: ModelRouter,
    costCalculator: CostCalculator,
    cacheManager: CacheManager
  ) {
    this.modelRouter = modelRouter;
    this.costCalculator = costCalculator;
    this.cacheManager = cacheManager;
    this.modes = new Map();

    // Initialize modes
    this.registerMode('ecomode', new Ecomode(modelRouter, costCalculator, cacheManager));
    this.registerMode('ask', new AskMode(modelRouter, costCalculator, cacheManager));
    this.registerMode('autopilot', new AutopilotMode(modelRouter, costCalculator, cacheManager));
    this.registerMode('ultrapilot', new UltrapilotMode(modelRouter, costCalculator, cacheManager));
    this.registerMode('swarm', new SwarmMode(modelRouter, costCalculator, cacheManager));
    this.registerMode('pipeline', new PipelineMode(modelRouter, costCalculator, cacheManager));

    logger.info('Mode registry initialized with 6 modes (Ecomode, Ask, Autopilot, Ultrapilot, Swarm, Pipeline)');
  }

  /**
   * Register a new execution mode
   */
  registerMode(name: string, mode: BaseMode): void {
    this.modes.set(name.toLowerCase(), mode);
    logger.debug(`Registered execution mode: ${name}`);
  }

  /**
   * Get a mode by name
   */
  getMode(name: string): BaseMode | null {
    return this.modes.get(name.toLowerCase()) || null;
  }

  /**
   * Get mode by keyword
   */
  getModeByKeyword(keyword: string): BaseMode | null {
    for (const mode of this.modes.values()) {
      if (mode.getConfig().keyword === keyword) {
        return mode;
      }
    }
    return null;
  }

  /**
   * List all available modes
   */
  listModes(): Array<{ name: string; description: string; keyword: string }> {
    const modes: Array<{ name: string; description: string; keyword: string }> = [];
    for (const mode of this.modes.values()) {
      const config = mode.getConfig();
      modes.push({
        name: config.name,
        description: config.description,
        keyword: config.keyword
      });
    }
    return modes;
  }
}

// Export mode classes
export { BaseMode } from './base-mode.js';
export { Ecomode } from './ecomode.js';
export { AskMode } from './ask-mode.js';
export { AutopilotMode } from './autopilot-mode.js';
export { UltrapilotMode } from './ultrapilot-mode.js';
export { SwarmMode } from './swarm-mode.js';
export { PipelineMode } from './pipeline-mode.js';
export type { ModeConfig, ModeExecutionResult, AgentTaskOutput } from './base-mode.js';
