/**
 * Skill Learner - Extract reusable patterns from agent sessions
 * 
 * Analyzes successful agent executions to identify:
 * - Common tool usage patterns
 * - Effective problem-solving sequences
 * - Reusable workflows
 * - Best practices
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export interface LearnedSkill {
  id: string;
  name: string;
  description: string;
  pattern: SkillPattern;
  metadata: SkillMetadata;
  examples: string[];
  confidence: number; // 0-1 score
  usageCount: number;
  successRate: number;
  createdAt: Date;
  lastUsed?: Date;
}

export interface SkillPattern {
  type: 'tool-sequence' | 'workflow' | 'prompt-template' | 'decision-tree';
  steps: PatternStep[];
  triggers?: string[]; // Keywords that suggest this pattern
  context?: string; // When to use this pattern
}

export interface PatternStep {
  action: string;
  tool?: string;
  input?: Record<string, unknown>;
  expectedOutput?: string;
  rationale?: string;
}

export interface SkillMetadata {
  category: string;
  tags: string[];
  difficulty: 'simple' | 'medium' | 'complex';
  estimatedDuration?: number; // seconds
  estimatedCost?: number; // USD
  source: 'manual' | 'extracted' | 'community';
  version: string;
}

export interface SessionAnalysis {
  sessionId: string;
  query: string;
  toolCalls: ToolCall[];
  duration: number;
  cost: number;
  success: boolean;
  model: string;
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  timestamp: number;
  duration: number;
}

export class SkillLearner {
  private learnedSkills: Map<string, LearnedSkill>;
  private skillsDirectory: string;
  private sessionHistory: SessionAnalysis[];
  private minConfidenceThreshold: number = 0.7;

  constructor(skillsDirectory: string = './learned-skills') {
    this.learnedSkills = new Map();
    this.skillsDirectory = skillsDirectory;
    this.sessionHistory = [];
  }

  /**
   * Initialize skill learner and load existing skills
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.skillsDirectory, { recursive: true });
      await this.loadLearnedSkills();
      logger.info(`[SkillLearner] Initialized with ${this.learnedSkills.size} learned skills`);
    } catch (error) {
      logger.error('[SkillLearner] Initialization failed', error);
      throw error;
    }
  }

  /**
   * Analyze a session and extract patterns
   */
  async analyzeSession(session: SessionAnalysis): Promise<LearnedSkill[]> {
    this.sessionHistory.push(session);

    // Only learn from successful sessions
    if (!session.success) {
      return [];
    }

    const extractedSkills: LearnedSkill[] = [];

    // Extract tool sequence patterns
    const sequenceSkill = this.extractToolSequencePattern(session);
    if (sequenceSkill) {
      extractedSkills.push(sequenceSkill);
    }

    // Extract workflow patterns (multi-step processes)
    const workflowSkill = this.extractWorkflowPattern(session);
    if (workflowSkill) {
      extractedSkills.push(workflowSkill);
    }

    // Save extracted skills
    for (const skill of extractedSkills) {
      await this.saveSkill(skill);
    }

    return extractedSkills;
  }

  /**
   * Extract tool sequence patterns (e.g., "always search → read → analyze")
   */
  private extractToolSequencePattern(session: SessionAnalysis): LearnedSkill | null {
    if (session.toolCalls.length < 2) {
      return null; // Need at least 2 tools for a sequence
    }

    const toolSequence = session.toolCalls.map(tc => tc.tool);
    const uniqueTools = new Set(toolSequence);

    // Look for common sequences
    const sequenceName = this.generateSequenceName(toolSequence);
    const sequenceId = this.generateSkillId(sequenceName);

    // Check if we've seen this pattern before
    const existing = this.learnedSkills.get(sequenceId);
    if (existing) {
      // Update existing skill
      existing.usageCount++;
      existing.successRate = (existing.successRate * (existing.usageCount - 1) + 1) / existing.usageCount;
      existing.lastUsed = new Date();
      existing.confidence = Math.min(0.95, existing.confidence + 0.05); // Increase confidence
      existing.examples.push(session.query);
      return null; // Already tracked
    }

    // Create new learned skill
    const skill: LearnedSkill = {
      id: sequenceId,
      name: sequenceName,
      description: `Pattern: ${toolSequence.join(' → ')}`,
      pattern: {
        type: 'tool-sequence',
        steps: session.toolCalls.map((tc, idx) => ({
          action: `Step ${idx + 1}: Use ${tc.tool}`,
          tool: tc.tool,
          rationale: `Based on successful execution pattern`,
        })),
        triggers: this.extractTriggerKeywords(session.query),
        context: `Useful when working on: ${this.categorizeQuery(session.query)}`,
      },
      metadata: {
        category: this.categorizeQuery(session.query),
        tags: Array.from(uniqueTools),
        difficulty: this.estimateDifficulty(session.toolCalls.length),
        estimatedDuration: session.duration,
        estimatedCost: session.cost,
        source: 'extracted',
        version: '1.0.0',
      },
      examples: [session.query],
      confidence: 0.6, // Initial confidence
      usageCount: 1,
      successRate: 1.0,
      createdAt: new Date(),
    };

    return skill;
  }

  /**
   * Extract workflow patterns (higher-level processes)
   */
  private extractWorkflowPattern(session: SessionAnalysis): LearnedSkill | null {
    // Look for repeated tool usage or branching logic
    const toolFrequency = new Map<string, number>();
    session.toolCalls.forEach(tc => {
      toolFrequency.set(tc.tool, (toolFrequency.get(tc.tool) || 0) + 1);
    });

    // If multiple uses of same tool, might be a workflow
    const repeatedTools = Array.from(toolFrequency.entries()).filter(([_, count]) => count > 1);
    if (repeatedTools.length === 0) {
      return null;
    }

    const workflowName = `Workflow: ${this.categorizeQuery(session.query)}`;
    const workflowId = this.generateSkillId(workflowName);

    // Check if workflow already exists
    if (this.learnedSkills.has(workflowId)) {
      return null;
    }

    const skill: LearnedSkill = {
      id: workflowId,
      name: workflowName,
      description: `Multi-step workflow for ${this.categorizeQuery(session.query)}`,
      pattern: {
        type: 'workflow',
        steps: this.groupToolCalls(session.toolCalls),
        triggers: this.extractTriggerKeywords(session.query),
        context: `Use when: ${session.query}`,
      },
      metadata: {
        category: this.categorizeQuery(session.query),
        tags: ['workflow', ...Array.from(toolFrequency.keys())],
        difficulty: this.estimateDifficulty(session.toolCalls.length),
        estimatedDuration: session.duration,
        estimatedCost: session.cost,
        source: 'extracted',
        version: '1.0.0',
      },
      examples: [session.query],
      confidence: 0.5,
      usageCount: 1,
      successRate: 1.0,
      createdAt: new Date(),
    };

    return skill;
  }

  /**
   * Generate skill name from tool sequence
   */
  private generateSequenceName(tools: string[]): string {
    const uniqueTools = Array.from(new Set(tools));
    if (uniqueTools.length <= 3) {
      return `${uniqueTools.join('-')} Pattern`;
    }
    return `${uniqueTools.length}-Step ${uniqueTools[0]} Pattern`;
  }

  /**
   * Generate unique skill ID
   */
  private generateSkillId(name: string): string {
    return crypto.createHash('sha256').update(name).digest('hex').slice(0, 16);
  }

  /**
   * Extract trigger keywords from query
   */
  private extractTriggerKeywords(query: string): string[] {
    const keywords: string[] = [];
    const commonWords = ['refactor', 'analyze', 'test', 'document', 'debug', 'optimize', 'search', 'build'];
    
    const lowerQuery = query.toLowerCase();
    for (const word of commonWords) {
      if (lowerQuery.includes(word)) {
        keywords.push(word);
      }
    }

    return keywords;
  }

  /**
   * Categorize query into skill category
   */
  private categorizeQuery(query: string): string {
    const lower = query.toLowerCase();
    
    if (lower.includes('refactor') || lower.includes('improve')) return 'refactoring';
    if (lower.includes('test') || lower.includes('testing')) return 'testing';
    if (lower.includes('document') || lower.includes('doc')) return 'documentation';
    if (lower.includes('debug') || lower.includes('fix')) return 'debugging';
    if (lower.includes('analyze') || lower.includes('review')) return 'analysis';
    if (lower.includes('build') || lower.includes('create')) return 'development';
    if (lower.includes('search') || lower.includes('find')) return 'research';
    
    return 'general';
  }

  /**
   * Estimate difficulty based on tool count
   */
  private estimateDifficulty(toolCount: number): 'simple' | 'medium' | 'complex' {
    if (toolCount <= 3) return 'simple';
    if (toolCount <= 7) return 'medium';
    return 'complex';
  }

  /**
   * Group tool calls into logical steps
   */
  private groupToolCalls(toolCalls: ToolCall[]): PatternStep[] {
    return toolCalls.map((tc, idx) => ({
      action: `${tc.tool} operation`,
      tool: tc.tool,
      rationale: `Step ${idx + 1} in workflow`,
    }));
  }

  /**
   * Save a learned skill to disk
   */
  private async saveSkill(skill: LearnedSkill): Promise<void> {
    try {
      this.learnedSkills.set(skill.id, skill);
      
      const skillPath = path.join(this.skillsDirectory, `${skill.id}.json`);
      await fs.writeFile(skillPath, JSON.stringify(skill, null, 2));
      
      logger.info(`[SkillLearner] Saved learned skill: ${skill.name}`);
    } catch (error) {
      logger.error(`[SkillLearner] Failed to save skill ${skill.name}`, error);
    }
  }

  /**
   * Load all learned skills from disk
   */
  private async loadLearnedSkills(): Promise<void> {
    try {
      const files = await fs.readdir(this.skillsDirectory);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const skillPath = path.join(this.skillsDirectory, file);
        const content = await fs.readFile(skillPath, 'utf-8');
        const skill = JSON.parse(content) as LearnedSkill;
        
        // Convert date strings back to Date objects
        skill.createdAt = new Date(skill.createdAt);
        if (skill.lastUsed) {
          skill.lastUsed = new Date(skill.lastUsed);
        }
        
        this.learnedSkills.set(skill.id, skill);
      }

      logger.info(`[SkillLearner] Loaded ${this.learnedSkills.size} learned skills`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('[SkillLearner] Failed to load learned skills', error);
      }
    }
  }

  /**
   * Get all learned skills
   */
  getLearnedSkills(): LearnedSkill[] {
    return Array.from(this.learnedSkills.values())
      .filter(skill => skill.confidence >= this.minConfidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find skills matching a query
   */
  findMatchingSkills(query: string): LearnedSkill[] {
    const lowerQuery = query.toLowerCase();
    const keywords = this.extractTriggerKeywords(query);

    return this.getLearnedSkills().filter(skill => {
      // Check if any trigger keywords match
      const triggerMatch = skill.pattern.triggers?.some(trigger => 
        lowerQuery.includes(trigger)
      );

      // Check if category matches
      const categoryMatch = lowerQuery.includes(skill.metadata.category);

      // Check tags
      const tagMatch = skill.metadata.tags.some(tag => 
        lowerQuery.includes(tag)
      );

      return triggerMatch || categoryMatch || tagMatch;
    });
  }

  /**
   * Get skill statistics
   */
  getStatistics(): {
    totalSkills: number;
    byCategory: Record<string, number>;
    byDifficulty: Record<string, number>;
    averageConfidence: number;
    totalUsage: number;
  } {
    const skills = this.getLearnedSkills();
    const byCategory: Record<string, number> = {};
    const byDifficulty: Record<string, number> = {};
    let totalConfidence = 0;
    let totalUsage = 0;

    for (const skill of skills) {
      byCategory[skill.metadata.category] = (byCategory[skill.metadata.category] || 0) + 1;
      byDifficulty[skill.metadata.difficulty] = (byDifficulty[skill.metadata.difficulty] || 0) + 1;
      totalConfidence += skill.confidence;
      totalUsage += skill.usageCount;
    }

    return {
      totalSkills: skills.length,
      byCategory,
      byDifficulty,
      averageConfidence: skills.length > 0 ? totalConfidence / skills.length : 0,
      totalUsage,
    };
  }

  /**
   * Export learned skill as a reusable skill definition
   */
  async exportSkillToFramework(skillId: string, outputPath: string): Promise<void> {
    const skill = this.learnedSkills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Convert learned skill to skill framework format
    const skillDef = {
      name: skill.name.toLowerCase().replace(/\s+/g, '-'),
      description: skill.description,
      category: skill.metadata.category,
      execute: async (context: unknown) => {
        // This would be implemented based on the pattern
        return skill.pattern.steps;
      },
    };

    await fs.writeFile(outputPath, JSON.stringify(skillDef, null, 2));
    logger.info(`[SkillLearner] Exported skill to ${outputPath}`);
  }
}
