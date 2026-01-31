/**
 * Agent System
 * Manages agent loading, validation, and execution
 */

// Phase 2 New Modules
export * from './types';
export { AgentManager, getAgentManager } from './agent-manager';
export { AgentExecutor, getAgentExecutor } from './agent-executor';

// Legacy modules
import { agentLoader } from './agent-loader.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize agent system
 * Call this on application startup
 */
export async function initializeAgents(agentDir?: string): Promise<void> {
  logger.info('Initializing agents...');

  try {
    const agents = await agentLoader.loadAgents(agentDir);
    logger.info(`Loaded ${agents.size} agents`);
    
    // Log agent names
    const names = agentLoader.listAgentNames();
    if (names.length > 0) {
      logger.debug(`Loaded agents: ${names.join(', ')}`);
    }
  } catch (error) {
    logger.warn(`Failed to load agents: ${error}`);
    // Don't throw - agents are optional for MVP
  }
}

export { agentLoader };
