/**
 * Query Complexity Classifier
 * 
 * Analyzes queries to determine complexity and required model tier
 * Uses multiple heuristics:
 * - Token count estimation
 * - Keyword analysis (architecture, design, analyze, etc.)
 * - Multi-step task detection
 * - Context size indicators
 * - Domain-specific complexity
 */

export interface ComplexityAnalysis {
  complexity: 'simple' | 'medium' | 'complex';
  score: number; // 0-100 complexity score
  factors: ComplexityFactor[];
  tokenEstimate: number;
  suggestedModel: string;
}

export interface ComplexityFactor {
  name: string;
  weight: number; // Contribution to overall score
  detected: boolean;
}

export class ComplexityClassifier {
  /**
   * Complexity keywords that suggest higher tier
   */
  private static readonly COMPLEX_KEYWORDS = {
    architecture: 15,
    design: 12,
    analyze: 10,
    implement: 8,
    refactor: 7,
    optimize: 8,
    debug: 6,
    'performance': 8,
    'security': 10,
    'scalability': 10,
    'deployment': 8,
    'testing': 7,
    'infrastructure': 12,
    'distributed': 15,
    'machine learning': 15,
    'algorithm': 12,
    'data pipeline': 12,
    'real-time': 10,
    'concurrent': 10,
    'asynchronous': 8,
  };

  /**
   * Multi-step task indicators
   */
  private static readonly MULTISTEP_KEYWORDS = [
    'first',
    'then',
    'after',
    'next',
    'finally',
    'and then',
    'once',
    'when done',
    'before',
    'step',
    '1.',
    '2.',
    '->',
    '→',
  ];

  /**
   * Analyze query complexity
   * Returns complexity level and detailed score
   */
  static analyzeQuery(query: string): ComplexityAnalysis {
    const factors: ComplexityFactor[] = [];
    let score = 0;

    // Factor 1: Query length
    const lengthFactor = this.analyzeLengthFactor(query.length);
    factors.push(lengthFactor);
    score += lengthFactor.weight * (lengthFactor.detected ? 1 : 0);

    // Factor 2: Keyword complexity
    const keywordFactor = this.analyzeKeywordComplexity(query);
    factors.push(keywordFactor);
    score += keywordFactor.weight * (keywordFactor.detected ? 1 : 0);

    // Factor 3: Multi-step detection
    const multistepFactor = this.detectMultiStepTasks(query);
    factors.push(multistepFactor);
    score += multistepFactor.weight * (multistepFactor.detected ? 1 : 0);

    // Factor 4: Code complexity indicators
    const codeFactor = this.analyzeCodeComplexity(query);
    factors.push(codeFactor);
    score += codeFactor.weight * (codeFactor.detected ? 1 : 0);

    // Factor 5: Explanation depth
    const explanationFactor = this.analyzeExplanationDepth(query);
    factors.push(explanationFactor);
    score += explanationFactor.weight * (explanationFactor.detected ? 1 : 0);

    // Factor 6: Technical depth
    const technicalFactor = this.analyzeTechnicalDepth(query);
    factors.push(technicalFactor);
    score += technicalFactor.weight * (technicalFactor.detected ? 1 : 0);

    // Normalize score to 0-100
    const normalizedScore = Math.min(100, Math.round((score / 100) * 100));

    // Determine complexity level from score
    const complexity = this.scoreToComplexity(normalizedScore);

    // Estimate token count
    const tokenEstimate = this.estimateTokens(query);

    // Suggest best model for this complexity
    const suggestedModel = this.suggestModel(complexity, normalizedScore);

    return {
      complexity,
      score: normalizedScore,
      factors,
      tokenEstimate,
      suggestedModel,
    };
  }

  /**
   * Analyze query length as complexity indicator
   */
  private static analyzeLengthFactor(length: number): ComplexityFactor {
    let weight = 0;
    let detected = false;

    if (length > 500) {
      weight = 20;
      detected = true;
    } else if (length > 200) {
      weight = 10;
      detected = true;
    } else if (length > 100) {
      weight = 5;
      detected = true;
    }

    return {
      name: 'Query Length',
      weight,
      detected,
    };
  }

  /**
   * Analyze keyword complexity
   */
  private static analyzeKeywordComplexity(query: string): ComplexityFactor {
    const lower = query.toLowerCase();
    let maxWeight = 0;

    for (const [keyword, weight] of Object.entries(this.COMPLEX_KEYWORDS)) {
      if (lower.includes(keyword)) {
        maxWeight = Math.max(maxWeight, weight);
      }
    }

    return {
      name: 'Keyword Complexity',
      weight: maxWeight,
      detected: maxWeight > 0,
    };
  }

  /**
   * Detect if query contains multiple steps
   */
  private static detectMultiStepTasks(query: string): ComplexityFactor {
    const lower = query.toLowerCase();
    let stepCount = 0;

    for (const keyword of this.MULTISTEP_KEYWORDS) {
      if (lower.includes(keyword)) {
        stepCount++;
      }
    }

    const detected = stepCount >= 2;
    const weight = Math.min(20, stepCount * 5);

    return {
      name: 'Multi-Step Tasks',
      weight,
      detected,
    };
  }

  /**
   * Analyze code complexity indicators
   */
  private static analyzeCodeComplexity(query: string): ComplexityFactor {
    const codeIndicators = [
      { pattern: /```/g, weight: 5 }, // Code blocks
      { pattern: /\{.*\}/g, weight: 3 }, // Braces
      { pattern: /\[.*\]/g, weight: 2 }, // Brackets
      { pattern: /function|class|interface|type/gi, weight: 8 }, // Code structures
      { pattern: /async|await|promise/gi, weight: 5 }, // Async patterns
      { pattern: /error|exception|try|catch/gi, weight: 6 }, // Error handling
    ];

    let weight = 0;
    let detected = false;

    for (const indicator of codeIndicators) {
      const matches = query.match(indicator.pattern);
      if (matches) {
        weight += indicator.weight;
        detected = true;
      }
    }

    return {
      name: 'Code Complexity',
      weight: Math.min(25, weight),
      detected,
    };
  }

  /**
   * Analyze explanation depth requirements
   */
  private static analyzeExplanationDepth(query: string): ComplexityFactor {
    const lower = query.toLowerCase();
    const explanationKeywords = [
      'explain',
      'why',
      'how',
      'describe',
      'detail',
      'walkthrough',
      'step by step',
      'elaborate',
    ];

    const found = explanationKeywords.filter((kw) => lower.includes(kw));
    const weight = found.length * 5;
    const detected = weight > 0;

    return {
      name: 'Explanation Depth',
      weight: Math.min(15, weight),
      detected,
    };
  }

  /**
   * Analyze technical depth of the query
   */
  private static analyzeTechnicalDepth(query: string): ComplexityFactor {
    const technicalTerms = [
      'algorithm',
      'pattern',
      'protocol',
      'framework',
      'architecture',
      'microservices',
      'kubernetes',
      'docker',
      'database',
      'api',
      'rest',
      'graphql',
      'cache',
      'queue',
      'stream',
      'index',
      'transaction',
      'concurrency',
    ];

    let count = 0;
    for (const term of technicalTerms) {
      if (query.toLowerCase().includes(term)) {
        count++;
      }
    }

    const weight = count * 3;
    const detected = count >= 2;

    return {
      name: 'Technical Depth',
      weight: Math.min(20, weight),
      detected,
    };
  }

  /**
   * Convert complexity score to level
   */
  private static scoreToComplexity(
    score: number
  ): 'simple' | 'medium' | 'complex' {
    if (score < 30) return 'simple';
    if (score < 70) return 'medium';
    return 'complex';
  }

  /**
   * Estimate token count from query
   * Rough heuristic: ~4 characters per token
   */
  private static estimateTokens(query: string): number {
    return Math.ceil(query.length / 4);
  }

  /**
   * Suggest best model for query complexity
   */
  private static suggestModel(
    complexity: 'simple' | 'medium' | 'complex',
    score: number
  ): string {
    // Map to model recommendations
    const suggestions: Record<string, string[]> = {
      simple: [
        'grok-3-mini', // Cheapest
        'gemini-2.5-flash',
        'gpt-4o-mini',
      ],
      medium: [
        'gemini-2.5-flash',
        'gpt-4o-mini',
        'grok-3',
        'gemini-2.5-pro',
      ],
      complex: [
        'gpt-4o',
        'claude-4-sonnet',
        'gpt-4o-mini', // Fallback if budget constrained
        'grok-3',
      ],
    };

    return suggestions[complexity]?.[0] || 'gpt-4o-mini';
  }

  /**
   * Get complexity tier for routing
   * Useful for selecting from config routing tables
   */
  static getRoutingTier(
    query: string
  ): 'simple' | 'medium' | 'complex' | 'explain' {
    const analysis = this.analyzeQuery(query);
    return analysis.complexity;
  }

  /**
   * Get full analysis with all details
   */
  static getDetailedAnalysis(query: string): ComplexityAnalysis {
    return this.analyzeQuery(query);
  }
}

/**
 * Convenience function for quick complexity check
 */
export function classifyQueryComplexity(
  query: string
): 'simple' | 'medium' | 'complex' {
  const tier = ComplexityClassifier.getRoutingTier(query);
  // Map 'explain' to 'complex' for consistency with routing
  return tier === 'explain' ? 'complex' : (tier as 'simple' | 'medium' | 'complex');
}
