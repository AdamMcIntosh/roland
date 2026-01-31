/**
 * Advanced Skills for Phase 3 MVP
 * 
 * Security scanning and performance analysis skills
 */

import { Skill } from '../skill-framework.js';
import { SkillMetadata, SkillResult } from '../../utils/types.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Security Scan Skill
// ============================================================================

export class SecurityScanSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'security_scan',
    category: 'security',
    description: 'Perform basic security checks on code for common issues',
    parameters: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'Code to scan for security issues',
      },
      {
        name: 'language',
        type: 'string',
        required: false,
        description: 'Language hint (e.g., js, ts, python)',
      },
      {
        name: 'strict',
        type: 'boolean',
        required: false,
        description: 'Enable stricter checks',
      },
    ],
    returns: {
      type: 'object',
      description: 'Security findings and recommendations',
    },
  };

  async execute(input: Record<string, unknown>): Promise<SkillResult> {
    if (!this.validateInput(input)) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    try {
      const code = input.code as string;
      const language = (input.language as string) || 'unknown';
      const strict = (input.strict as boolean) ?? false;

      logger.info(`Running security scan (language: ${language}, strict: ${strict})`);

      const findings = this.scanForIssues(code, strict);

      return {
        success: true,
        data: {
          language,
          strict,
          findings,
          summary: {
            total: findings.length,
            high: findings.filter((f) => f.severity === 'high').length,
            medium: findings.filter((f) => f.severity === 'medium').length,
            low: findings.filter((f) => f.severity === 'low').length,
          },
          recommendations: findings.map((f) => f.recommendation),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Security scan failed: ${error}`,
      };
    }
  }

  private scanForIssues(code: string, strict: boolean): Array<{
    rule: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    recommendation: string;
  }> {
    const findings: Array<{
      rule: string;
      severity: 'low' | 'medium' | 'high';
      description: string;
      recommendation: string;
    }> = [];

    if (code.includes('eval(')) {
      findings.push({
        rule: 'no-eval',
        severity: 'high',
        description: 'Use of eval() can lead to code injection vulnerabilities.',
        recommendation: 'Avoid eval(); use safer parsing or direct logic instead.',
      });
    }

    if (code.includes('innerHTML')) {
      findings.push({
        rule: 'no-innerhtml',
        severity: 'medium',
        description: 'Direct innerHTML assignment can allow XSS if content is untrusted.',
        recommendation: 'Use textContent or sanitize HTML before assignment.',
      });
    }

    if (code.match(/(password|secret|api_key|token)\s*=\s*['"]/i)) {
      findings.push({
        rule: 'no-hardcoded-secrets',
        severity: 'high',
        description: 'Potential hardcoded secret detected in code.',
        recommendation: 'Move secrets to environment variables or a secrets manager.',
      });
    }

    if (strict && code.match(/http:\/\//i)) {
      findings.push({
        rule: 'prefer-https',
        severity: 'medium',
        description: 'Non-HTTPS URL detected.',
        recommendation: 'Use HTTPS for all external requests.',
      });
    }

    if (strict && code.match(/(exec|spawn)\s*\(/i)) {
      findings.push({
        rule: 'unsafe-process-exec',
        severity: 'medium',
        description: 'Process execution can be dangerous with untrusted input.',
        recommendation: 'Validate and sanitize inputs before executing commands.',
      });
    }

    if (findings.length === 0) {
      findings.push({
        rule: 'no-issues-found',
        severity: 'low',
        description: 'No obvious security issues detected.',
        recommendation: 'Consider a deeper review or automated SAST for full coverage.',
      });
    }

    return findings;
  }
}

// ============================================================================
// Performance Analysis Skill
// ============================================================================

export class PerformanceSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'performance',
    category: 'performance',
    description: 'Analyze code for performance bottlenecks and optimizations',
    parameters: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'Code to analyze for performance issues',
      },
      {
        name: 'target',
        type: 'string',
        required: false,
        description: 'Target optimization goal: speed|memory|throughput',
      },
      {
        name: 'language',
        type: 'string',
        required: false,
        description: 'Language hint (e.g., js, ts, python)',
      },
    ],
    returns: {
      type: 'object',
      description: 'Performance findings and suggested improvements',
    },
  };

  async execute(input: Record<string, unknown>): Promise<SkillResult> {
    if (!this.validateInput(input)) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    try {
      const code = input.code as string;
      const target = (input.target as string) || 'speed';
      const language = (input.language as string) || 'unknown';

      logger.info(`Analyzing performance (target: ${target}, language: ${language})`);

      const analysis = this.analyzePerformance(code, target);

      return {
        success: true,
        data: {
          target,
          language,
          bottlenecks: analysis.bottlenecks,
          suggestions: analysis.suggestions,
          summary: analysis.summary,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Performance analysis failed: ${error}`,
      };
    }
  }

  private analyzePerformance(
    code: string,
    target: string
  ): { bottlenecks: string[]; suggestions: string[]; summary: string } {
    const bottlenecks: string[] = [];
    const suggestions: string[] = [];

    if (code.match(/for\s*\(.*\)\s*{[\s\S]*for\s*\(/)) {
      bottlenecks.push('Nested loops detected; potential O(n^2) complexity.');
      suggestions.push('Consider optimizing with hashing or precomputed maps.');
    }

    if (code.match(/\.sort\(/) && code.match(/\.filter\(/)) {
      bottlenecks.push('Multiple passes over data may be costly for large datasets.');
      suggestions.push('Combine operations to reduce passes or use lazy evaluation.');
    }

    if (target === 'memory' && code.match(/new\s+Array\(|\[\]/)) {
      bottlenecks.push('Potential large array allocation detected.');
      suggestions.push('Consider streaming or chunking to reduce memory usage.');
    }

    if (target === 'throughput' && code.match(/await\s+/)) {
      bottlenecks.push('Sequential awaits can reduce throughput.');
      suggestions.push('Use Promise.all for independent async operations.');
    }

    if (bottlenecks.length === 0) {
      bottlenecks.push('No obvious performance bottlenecks detected.');
      suggestions.push('Consider profiling to identify hot paths.');
    }

    const summary = `Analysis complete: ${bottlenecks.length} potential issue(s) identified for target=${target}.`;

    return { bottlenecks, suggestions, summary };
  }
}
