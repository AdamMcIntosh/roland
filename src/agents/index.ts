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
import path from 'path';
import fs from 'fs';

/**
 * Resolve the agents directory path
 * Handles both local development and global npm installation
 * 
 * In global npm install:
 *   - File location: node_modules/samwise/dist/agents/index.js
 *   - Agents location: node_modules/samwise/dist/agents/ (SAME DIR)
 *   - Current dir IS the agents directory
 * 
 * In development:
 *   - File location: src/agents/index.ts → dist/agents/index.js
 *   - Agents location: agents/
 *   - Need to go up 2 directories from src/agents
 */
function resolveAgentsDir(agentDir?: string): string {
  if (agentDir) {
    return agentDir;
  }

  try {
    // Get the directory of this file
    const currentFile = new URL(import.meta.url).pathname;
    // Handle Windows paths that start with /C:/...
    const normalizedPath = currentFile.startsWith('/') && currentFile[2] === ':' 
      ? currentFile.slice(1) 
      : currentFile;
    
    const currentDir = path.dirname(normalizedPath);
    
    logger.debug(`[Agent Loader] Current file: ${normalizedPath}`);
    logger.debug(`[Agent Loader] Current dir: ${currentDir}`);
    
    // Try 0: Check if agents are in the current directory itself
    // This happens when the file is dist/agents/index.js (agents in same dir)
    const agentFilesInCurrent = fs.readdirSync(currentDir).filter(f => f.endsWith('.yaml'));
    if (agentFilesInCurrent.length > 0) {
      logger.debug(`[Agent Loader] Found ${agentFilesInCurrent.length} agent files in current directory: ${currentDir}`);
      return currentDir;
    }
    
    // Try 1: Check if agents directory is in the current directory (edge case)
    const agentsPath1 = path.join(currentDir, 'agents');
    if (fs.existsSync(agentsPath1)) {
      const filesInAgents = fs.readdirSync(agentsPath1).filter(f => f.endsWith('.yaml'));
      if (filesInAgents.length > 0) {
        logger.debug(`[Agent Loader] Found agents at: ${agentsPath1}`);
        return agentsPath1;
      }
    }
    
    // Try 2: Check one level up
    const agentsPath2 = path.join(currentDir, '..', 'agents');
    if (fs.existsSync(agentsPath2)) {
      const filesInAgents = fs.readdirSync(agentsPath2).filter(f => f.endsWith('.yaml'));
      if (filesInAgents.length > 0) {
        logger.debug(`[Agent Loader] Found agents at: ${agentsPath2}`);
        return agentsPath2;
      }
    }
    
    // Try 3: Check two levels up (development: from dist/agents, go to root/agents)
    const agentsPath3 = path.join(currentDir, '..', '..', 'agents');
    if (fs.existsSync(agentsPath3)) {
      const filesInAgents = fs.readdirSync(agentsPath3).filter(f => f.endsWith('.yaml'));
      if (filesInAgents.length > 0) {
        logger.debug(`[Agent Loader] Found agents at: ${agentsPath3}`);
        return agentsPath3;
      }
    }
    
    // Try 4: Check three levels up (nested node_modules scenario)
    const agentsPath4 = path.join(currentDir, '..', '..', '..', 'agents');
    if (fs.existsSync(agentsPath4)) {
      const filesInAgents = fs.readdirSync(agentsPath4).filter(f => f.endsWith('.yaml'));
      if (filesInAgents.length > 0) {
        logger.debug(`[Agent Loader] Found agents at: ${agentsPath4}`);
        return agentsPath4;
      }
    }
    
    logger.debug(
      `[Agent Loader] No agents found at expected locations. ` +
      `Checked: ${currentDir}, ${agentsPath1}, ${agentsPath2}, ${agentsPath3}, ${agentsPath4}`
    );
    
    // Fallback to relative path
    logger.debug(`[Agent Loader] Using fallback relative path: ./agents`);
    return './agents';
  } catch (e) {
    logger.debug(`[Agent Loader] Error resolving path: ${e}, using fallback`);
    return './agents';
  }
}

/**
 * Initialize agent system
 * Call this on application startup
 */
export async function initializeAgents(agentDir?: string): Promise<void> {
  logger.info('Initializing agents...');

  try {
    const dir = resolveAgentsDir(agentDir);
    
    // Initialize both the new AgentManager and the legacy agentLoader
    // so that modes (autopilot, swarm, etc.) can use agentLoader.getAgent()
    const agentManager = getAgentManager(dir);
    const agents = await agentManager.loadAgents();
    logger.info(`Successfully loaded ${agents.length} agents`);
    
    // Also load agents into the legacy agentLoader for backward compatibility
    // with modes that use agentLoader.getAgent()
    await agentLoader.loadAgents(dir);
    
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
