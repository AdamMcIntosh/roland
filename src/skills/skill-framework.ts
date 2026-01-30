/**
 * Skill Framework - Base Classes and Registry
 * 
 * Defines the skill interface and manages skill registration
 * Skills are reusable, composable units of functionality
 */

import { SkillMetadata, SkillParameter, SkillResult } from '../utils/types.js';
import { logger } from '../utils/logger.js';
import { SkillError, SkillNotFoundError } from '../utils/errors.js';

// ============================================================================
// Skill Base Class
// ============================================================================

export abstract class Skill {
  abstract metadata: SkillMetadata;

  /**
   * Execute the skill with given input
   * 
   * @param input - Input parameters
   * @param context - Optional execution context
   * @returns Skill result
   */
  abstract execute(input: Record<string, unknown>, context?: Record<string, unknown>): Promise<SkillResult>;

  /**
   * Validate skill parameters
   * 
   * @param input - Input to validate
   * @returns Validation result
   */
  protected validateInput(input: Record<string, unknown>): boolean {
    if (!this.metadata.parameters) return true;

    for (const param of this.metadata.parameters) {
      if (param.required && !(param.name in input)) {
        logger.warn(`Missing required parameter: ${param.name}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Get parameter by name
   * 
   * @param name - Parameter name
   * @returns Parameter metadata or null
   */
  protected getParameter(name: string): SkillParameter | null {
    if (!this.metadata.parameters) return null;
    return this.metadata.parameters.find((p) => p.name === name) || null;
  }
}

// ============================================================================
// Skill Registry
// ============================================================================

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  /**
   * Register a skill
   * 
   * @param skill - Skill instance
   */
  register(skill: Skill): void {
    const name = skill.metadata.name;
    if (this.skills.has(name)) {
      logger.warn(`Overwriting existing skill: ${name}`);
    }
    this.skills.set(name, skill);
    logger.debug(`Registered skill: ${name}`);
  }

  /**
   * Register multiple skills
   * 
   * @param skills - Array of skill instances
   */
  registerAll(skills: Skill[]): void {
    skills.forEach((skill) => this.register(skill));
  }

  /**
   * Get a skill by name
   * 
   * @param name - Skill name
   * @returns Skill instance or null
   */
  getSkill(name: string): Skill | null {
    return this.skills.get(name) || null;
  }

  /**
   * Check if skill exists
   * 
   * @param name - Skill name
   * @returns True if skill is registered
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get all registered skills
   * 
   * @returns Map of all skills
   */
  getAllSkills(): Map<string, Skill> {
    return new Map(this.skills);
  }

  /**
   * Get skill names
   * 
   * @returns Array of skill names
   */
  getSkillNames(): string[] {
    return Array.from(this.skills.keys()).sort();
  }

  /**
   * Get skills by category
   * 
   * @param category - Category name
   * @returns Array of matching skills
   */
  getSkillsByCategory(category: string): Skill[] {
    return Array.from(this.skills.values()).filter(
      (skill) => skill.metadata.category === category
    );
  }

  /**
   * Get skill count
   * 
   * @returns Number of registered skills
   */
  count(): number {
    return this.skills.size;
  }

  /**
   * Execute a skill
   * 
   * @param name - Skill name
   * @param input - Input parameters
   * @param context - Optional execution context
   * @returns Skill result
   */
  async executeSkill(
    name: string,
    input: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Promise<SkillResult> {
    const skill = this.getSkill(name);
    if (!skill) {
      throw new SkillNotFoundError(`Skill not found: ${name}`);
    }

    try {
      return await skill.execute(input, context);
    } catch (error) {
      throw new SkillError(`Skill execution failed: ${name} - ${error}`);
    }
  }

  /**
   * Generate skills report
   * 
   * @returns Formatted report
   */
  generateReport(): string {
    let report = '\n🛠️  Registered Skills:\n';
    report += `  Total: ${this.skills.size}\n\n`;

    const categories = new Map<string, Skill[]>();
    this.skills.forEach((skill) => {
      const cat = skill.metadata.category || 'uncategorized';
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat)!.push(skill);
    });

    categories.forEach((skills, category) => {
      report += `  ${category}:\n`;
      skills.forEach((skill) => {
        report += `    • ${skill.metadata.name}\n`;
        report += `      ${skill.metadata.description}\n`;
      });
      report += '\n';
    });

    return report;
  }

  /**
   * Clear all registered skills (useful for testing)
   */
  clear(): void {
    this.skills.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const skillRegistry = new SkillRegistry();
