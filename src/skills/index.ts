/**
 * Skill Initialization - Bootstrap all skills
 * 
 * Registers core skills on application startup
 */

import { RefactoringSkill, DocumentationSkill, TestingSkill } from './implementations/core-skills.js';
import { SecurityScanSkill, PerformanceSkill } from './implementations/advanced-skills.js';
import {
  CodeReviewSkill,
  APIDesignSkill,
  DatabaseSchemaSkill,
  DebuggingSkill,
  MigrationSkill,
} from './implementations/extended-skills.js';
import { DocReviewSkill } from './implementations/doc-review-skill.js';
import { skillRegistry } from './skill-framework.js';
import { SkillExecutor, getSkillExecutor } from './skill-executor.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize all skills
 * Call this on application startup
 */
export async function initializeSkills(): Promise<void> {
  logger.info('Initializing skills...');

  try {
    // Register core skills
    skillRegistry.register(new RefactoringSkill());
    skillRegistry.register(new DocumentationSkill());
    skillRegistry.register(new TestingSkill());
    
    // Register advanced skills
    skillRegistry.register(new SecurityScanSkill());
    skillRegistry.register(new PerformanceSkill());
    
    // Register extended skills
    skillRegistry.register(new CodeReviewSkill());
    skillRegistry.register(new APIDesignSkill());
    skillRegistry.register(new DatabaseSchemaSkill());
    skillRegistry.register(new DebuggingSkill());
    skillRegistry.register(new MigrationSkill());

    // Register doc-review skill
    skillRegistry.register(new DocReviewSkill());

    logger.info(`Loaded ${skillRegistry.count()} skills`);
    logger.debug(`Skill registry: ${skillRegistry.getSkillNames().join(', ')}`);
  } catch (error) {
    logger.error(`Failed to initialize skills: ${error}`);
    throw error;
  }
}

/**
 * Register skills as MCP tools via a provided registerTool function
 */
export function registerSkillsAsTools(
  registerTool: (
    name: string,
    description: string,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
    inputSchema?: Record<string, unknown>
  ) => void
): void {
  const executor = getSkillExecutor();
  const tools = executor.getToolDefinitions();

  tools.forEach((tool) => {
    registerTool(
      tool.name,
      tool.description ?? '',
      executor.getToolHandler(tool.name),
      tool.inputSchema
    );
  });
}

export { skillRegistry, SkillExecutor };
