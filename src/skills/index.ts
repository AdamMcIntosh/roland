/**
 * Skill Initialization - Bootstrap all skills
 * 
 * Registers core skills on application startup
 */

import { RefactoringSkill, DocumentationSkill, TestingSkill } from './implementations/core-skills.js';
import { skillRegistry } from './skill-framework.js';
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

    logger.info(`Loaded ${skillRegistry.count()} skills`);
    logger.debug(`Skill registry: ${skillRegistry.getSkillNames().join(', ')}`);
  } catch (error) {
    logger.error(`Failed to initialize skills: ${error}`);
    throw error;
  }
}

export { skillRegistry };
