/**
 * Complexity Analyzer - Dynamic query complexity detection
 * 
 * Phase 8: Analyzes queries to determine optimal agent pool size
 * and execution strategy based on query characteristics
 */

import { logger } from './logger.js';

export interface ComplexityAnalysis {
  level: 'simple' | 'medium' | 'complex';
  score: number; // 0-100
  recommendedAgents: number;
  reasoning: string[];
}

export class ComplexityAnalyzer {
  // Keywords that indicate complexity level
  private static readonly SIMPLE_KEYWORDS = [
    'hello', 'test', 'simple', 'basic', 'quick', 'small', 'single', 'one',
  ];

  private static readonly MEDIUM_KEYWORDS = [
    'create', 'build', 'implement', 'develop', 'design', 'write', 'make',
  ];

  private static readonly COMPLEX_KEYWORDS = [
    'complex', 'comprehensive', 'detailed', 'full', 'complete', 'advanced',
    'enterprise', 'production', 'scalable', 'optimize', 'refactor', 'architect',
  ];

  /**
   * Analyze query complexity
   * 
   * @param query - Query to analyze
   * @returns Complexity analysis with recommendations
   */
  static analyze(query: string): ComplexityAnalysis {
    const reasoning: string[] = [];
    let score = 50; // Start at medium

    // Factor 1: Query length (20 points)
    const wordCount = query.trim().split(/\s+/).length;
    if (wordCount <= 5) {
      score -= 15;
      reasoning.push(`Short query (${wordCount} words) → simpler`);
    } else if (wordCount <= 15) {
      score -= 5;
      reasoning.push(`Medium query (${wordCount} words)`);
    } else if (wordCount <= 30) {
      score += 10;
      reasoning.push(`Long query (${wordCount} words) → more complex`);
    } else {
      score += 20;
      reasoning.push(`Very long query (${wordCount} words) → complex`);
    }

    // Factor 2: Keyword analysis (30 points)
    const lowerQuery = query.toLowerCase();
    const simpleMatches = this.SIMPLE_KEYWORDS.filter(k => lowerQuery.includes(k)).length;
    const mediumMatches = this.MEDIUM_KEYWORDS.filter(k => lowerQuery.includes(k)).length;
    const complexMatches = this.COMPLEX_KEYWORDS.filter(k => lowerQuery.includes(k)).length;

    if (complexMatches > 0) {
      score += 15 * complexMatches;
      reasoning.push(`Contains ${complexMatches} complex keyword(s)`);
    }
    if (mediumMatches > 0) {
      score += 5 * mediumMatches;
      reasoning.push(`Contains ${mediumMatches} medium keyword(s)`);
    }
    if (simpleMatches > 0 && complexMatches === 0) {
      score -= 10 * simpleMatches;
      reasoning.push(`Contains ${simpleMatches} simple keyword(s)`);
    }

    // Factor 3: Multiple sentences or clauses (20 points)
    const sentences = query.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 2) {
      score += 15;
      reasoning.push(`Multiple sentences (${sentences.length}) → more requirements`);
    } else if (sentences.length > 1) {
      score += 5;
      reasoning.push(`Multiple requirements detected`);
    }

    // Factor 4: Technical indicators (15 points)
    const technicalPatterns = [
      /\b(function|class|method|api|database|server|client)\b/i,
      /\b(algorithm|optimize|performance|scale)\b/i,
      /\b(test|debug|validate|verify)\b/i,
    ];
    const technicalMatches = technicalPatterns.filter(p => p.test(query)).length;
    if (technicalMatches > 0) {
      score += 10 * technicalMatches;
      reasoning.push(`Technical terms detected (${technicalMatches})`);
    }

    // Factor 5: Lists or enumerations (15 points)
    if (/\b(and|or|with|plus|also)\b/gi.test(query)) {
      const conjunctions = (query.match(/\b(and|or|with|plus|also)\b/gi) || []).length;
      if (conjunctions >= 3) {
        score += 15;
        reasoning.push(`Multiple requirements (${conjunctions} conjunctions)`);
      } else if (conjunctions >= 1) {
        score += 5;
        reasoning.push(`Compound requirements detected`);
      }
    }

    // Normalize score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine level
    let level: 'simple' | 'medium' | 'complex';
    let recommendedAgents: number;

    if (score < 40) {
      level = 'simple';
      recommendedAgents = 2; // Ultrapilot: 2 agents, Swarm: 3 agents
      reasoning.push(`Score ${score} → Simple task`);
    } else if (score < 70) {
      level = 'medium';
      recommendedAgents = 3; // Ultrapilot: 3 agents, Swarm: 5 agents
      reasoning.push(`Score ${score} → Medium complexity`);
    } else {
      level = 'complex';
      recommendedAgents = 5; // Ultrapilot: 5 agents, Swarm: 8 agents
      reasoning.push(`Score ${score} → Complex task`);
    }

    logger.debug(`[Complexity] Query: "${query.substring(0, 50)}..." → ${level} (score: ${score})`);

    return {
      level,
      score,
      recommendedAgents,
      reasoning,
    };
  }

  /**
   * Recommend agents for a given complexity level
   * 
   * @param complexity - Complexity level
   * @param mode - Execution mode
   * @returns Array of recommended agent names
   */
  static recommendAgentsForMode(
    complexity: 'simple' | 'medium' | 'complex',
    mode: 'ultrapilot' | 'swarm'
  ): string[] {
    if (mode === 'ultrapilot') {
      // Ultrapilot: Parallel execution for speed
      if (complexity === 'simple') {
        return ['executor', 'architect']; // 2 agents
      } else if (complexity === 'medium') {
        return ['executor', 'architect', 'researcher']; // 3 agents
      } else {
        return ['executor', 'architect', 'researcher', 'designer', 'writer']; // 5 agents
      }
    } else if (mode === 'swarm') {
      // Swarm: Collaborative with shared memory
      if (complexity === 'simple') {
        return ['executor', 'planner', 'qa-tester']; // 3 agents
      } else if (complexity === 'medium') {
        return ['executor', 'planner', 'architect', 'researcher', 'qa-tester']; // 5 agents
      } else {
        return [
          'executor', 'planner', 'architect', 'researcher',
          'designer', 'writer', 'critic', 'qa-tester'
        ]; // 8 agents
      }
    }

    return [];
  }

  /**
   * Estimate token count from query
   * 
   * @param query - Query string
   * @returns Estimated token count
   */
  static estimateTokens(query: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(query.length / 4);
  }
}
