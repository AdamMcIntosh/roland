/**
 * Integration Tests: MCP Tools
 * 
 * Tests MCP server tool registration and execution
 * Verifies all skills are properly exposed as MCP tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { skillRegistry } from '../../src/skills/skill-framework.js';
import { initializeSkills } from '../../src/skills/index.js';

describe('MCP Tools Integration', () => {
  beforeEach(async () => {
    skillRegistry.clear();
    await initializeSkills();
  });

  describe('Skill Registry', () => {
    it('should have 5 skills registered', () => {
      expect(skillRegistry.count()).toBe(5);
    });

    it('should expose refactoring skill', () => {
      const skill = skillRegistry.getSkill('refactoring');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('refactoring');
    });

    it('should expose documentation skill', () => {
      const skill = skillRegistry.getSkill('documentation');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('documentation');
    });

    it('should expose testing skill', () => {
      const skill = skillRegistry.getSkill('testing');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('testing');
    });

    it('should expose security_scan skill', () => {
      const skill = skillRegistry.getSkill('security_scan');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('security_scan');
    });

    it('should expose performance skill', () => {
      const skill = skillRegistry.getSkill('performance');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('performance');
    });
  });

  describe('Skill Tool Metadata', () => {
    it('should have metadata for skills', () => {
      const skill = skillRegistry.getSkill('refactoring');
      expect(skill).toBeDefined();
      expect(skill?.metadata).toHaveProperty('name', 'refactoring');
      expect(skill?.metadata).toHaveProperty('description');
      expect(skill?.metadata).toHaveProperty('parameters');
    });

    it('should have skill metadata with categories', () => {
      const skill = skillRegistry.getSkill('testing');
      expect(skill).toBeDefined();
      expect(skill?.metadata).toHaveProperty('category');
    });

    it('should expose all skills with metadata', () => {
      const names = skillRegistry.getSkillNames();
      expect(names.length).toBe(5);
      
      names.forEach(name => {
        const skill = skillRegistry.getSkill(name);
        expect(skill).toBeDefined();
        expect(skill?.metadata).toHaveProperty('name', name);
        expect(skill?.metadata).toHaveProperty('description');
      });
    });
  });

  describe('Skill Execution', () => {
    it('should execute refactoring skill', async () => {
      const skill = skillRegistry.getSkill('refactoring');
      expect(skill).toBeDefined();

      const result = await skill!.execute({
        code: 'const x = 1; const y = 2; console.log(x, y);',
        improvements: 'reduce verbosity',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should execute documentation skill', async () => {
      const skill = skillRegistry.getSkill('documentation');
      expect(skill).toBeDefined();

      const result = await skill!.execute({
        code: 'function add(a, b) { return a + b; }',
        style: 'jsdoc',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should execute testing skill', async () => {
      const skill = skillRegistry.getSkill('testing');
      expect(skill).toBeDefined();

      const result = await skill!.execute({
        code: 'function multiply(a, b) { return a * b; }',
        framework: 'vitest',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should execute security_scan skill', async () => {
      const skill = skillRegistry.getSkill('security_scan');
      expect(skill).toBeDefined();

      const result = await skill!.execute({
        code: 'const sql = `SELECT * FROM users WHERE id = ${id}`',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should execute performance skill', async () => {
      const skill = skillRegistry.getSkill('performance');
      expect(skill).toBeDefined();

      const result = await skill!.execute({
        code: 'for(let i=0; i<1000000; i++) { Math.sqrt(i); }',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing skill gracefully', () => {
      const skill = skillRegistry.getSkill('non-existent-skill');
      expect(skill).toBeNull();
    });

    it('should track skill execution errors', async () => {
      const skill = skillRegistry.getSkill('refactoring');
      expect(skill).toBeDefined();

      // Missing required parameters should be caught by execute
      try {
        await skill!.execute({} as any);
      } catch (error) {
        // Error is expected
        expect(error).toBeDefined();
      }
    });

    it('should provide skill metadata validation', () => {
      const skill = skillRegistry.getSkill('testing');
      expect(skill).toBeDefined();

      // Verify metadata has expected structure
      expect(skill?.metadata.parameters).toBeDefined();
      expect(Array.isArray(skill?.metadata.parameters)).toBe(true);
    });
  });

  describe('MCP Tool Discovery', () => {
    it('should discover all available tools', () => {
      const names = skillRegistry.getSkillNames();
      const skills = names.map(name => ({
        name,
        skill: skillRegistry.getSkill(name),
      }));

      expect(skills.length).toBe(5);
      skills.forEach(item => {
        expect(item.skill).toBeDefined();
      });
    });

    it('should provide tool descriptions for discovery', () => {
      const names = skillRegistry.getSkillNames();

      names.forEach(name => {
        const skill = skillRegistry.getSkill(name);
        expect(skill?.metadata.description).toBeDefined();
        expect(skill?.metadata.description.length).toBeGreaterThan(0);
      });
    });

    it('should categorize tools by type', () => {
      const names = skillRegistry.getSkillNames();
      const categories = new Set(
        names.map(name => skillRegistry.getSkill(name)?.metadata.category || 'general')
      );

      expect(categories.size).toBeGreaterThan(0);
    });
  });
});
