/**
 * Agent System
 * Manages agent loading, validation, and execution
 */

// Phase 2 New Modules
export * from './types.js';
export { AgentManager, getAgentManager } from './agent-manager.js';
export { AgentExecutor, getAgentExecutor } from './agent-executor.js';

// Legacy modules
import { agentLoader } from './agent-loader.js';
import { getAgentManager } from './agent-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize agent system
 * Call this on application startup
 */
export async function initializeAgents(agentDir?: string): Promise<void> {
  logger.info('Initializing agents...');

  try {
    const agentManager = getAgentManager(agentDir);
    const agents = await agentManager.loadAgents();
    logger.info(`Successfully loaded ${agents.length} agents`);
    
    // Log agent names
    if (agents.length > 0) {
      logger.debug(`Loaded agents: ${agents.map(a => a.name).join(', ')}`);
    }
  } catch (error) {
    logger.warn(`Failed to load agents: ${error}`);
    // Don't throw - agents are optional for MVP
  }
}

export { agentLoader };
