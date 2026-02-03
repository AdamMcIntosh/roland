/**
 * Extended Skills Library
 * 
 * Additional specialized skills for common development tasks
 */

import { Skill } from '../skill-framework.js';
import { SkillMetadata, SkillResult } from '../../utils/types.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Code Review Skill
// ============================================================================

export class CodeReviewSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'code_review',
    category: 'code',
    description: 'Perform comprehensive code review with best practices analysis',
    parameters: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'Code to review',
      },
      {
        name: 'language',
        type: 'string',
        required: false,
        description: 'Programming language (js, ts, python, etc.)',
      },
      {
        name: 'focus',
        type: 'string',
        required: false,
        description: 'Review focus: all|style|logic|performance|security',
      },
    ],
    returns: {
      type: 'object',
      description: 'Review findings and suggestions',
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
      const language = (input.language as string) || 'javascript';
      const focus = (input.focus as string) || 'all';

      logger.info(`Code review starting (language: ${language}, focus: ${focus})`);

      const findings = this.reviewCode(code, language, focus);
      const rating = this.calculateRating(findings);

      return {
        success: true,
        data: {
          language,
          focus,
          rating,
          findings,
          summary: {
            total_issues: findings.length,
            critical: findings.filter((f) => f.priority === 'critical').length,
            high: findings.filter((f) => f.priority === 'high').length,
            medium: findings.filter((f) => f.priority === 'medium').length,
            low: findings.filter((f) => f.priority === 'low').length,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Code review failed: ${error}`,
      };
    }
  }

  private reviewCode(code: string, language: string, focus: string): Array<{
    category: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    issue: string;
    suggestion: string;
    line?: number;
  }> {
    const findings: Array<{
      category: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      issue: string;
      suggestion: string;
      line?: number;
    }> = [];

    // Style checks
    if (focus === 'all' || focus === 'style') {
      if (code.includes('var ')) {
        findings.push({
          category: 'style',
          priority: 'medium',
          issue: 'Use of var instead of let/const',
          suggestion: 'Replace var with let or const for better scoping',
        });
      }
      if (code.split('\n').some((line) => line.length > 120)) {
        findings.push({
          category: 'style',
          priority: 'low',
          issue: 'Lines exceed 120 characters',
          suggestion: 'Break long lines for better readability',
        });
      }
    }

    // Logic checks
    if (focus === 'all' || focus === 'logic') {
      if (code.includes('==') && !code.includes('===')) {
        findings.push({
          category: 'logic',
          priority: 'high',
          issue: 'Loose equality comparison',
          suggestion: 'Use === instead of == for type-safe comparison',
        });
      }
      if (code.includes('try') && !code.includes('catch')) {
        findings.push({
          category: 'logic',
          priority: 'high',
          issue: 'try without catch block',
          suggestion: 'Add catch block for proper error handling',
        });
      }
    }

    // Performance checks
    if (focus === 'all' || focus === 'performance') {
      if (code.match(/for\s*\([^)]*\)\s*{[^}]*\.push\(/)) {
        findings.push({
          category: 'performance',
          priority: 'medium',
          issue: 'Array push in loop',
          suggestion: 'Consider using Array.map() or pre-allocating array size',
        });
      }
    }

    // Security checks
    if (focus === 'all' || focus === 'security') {
      if (code.includes('eval(')) {
        findings.push({
          category: 'security',
          priority: 'critical',
          issue: 'Use of eval() detected',
          suggestion: 'Remove eval() - it executes arbitrary code and is a security risk',
        });
      }
      if (code.match(/password|secret|apikey/i) && !code.includes('process.env')) {
        findings.push({
          category: 'security',
          priority: 'critical',
          issue: 'Hardcoded credentials detected',
          suggestion: 'Move credentials to environment variables',
        });
      }
    }

    return findings;
  }

  private calculateRating(findings: Array<{ priority: string }>): {
    score: number;
    grade: string;
  } {
    let score = 100;
    findings.forEach((f) => {
      if (f.priority === 'critical') score -= 20;
      else if (f.priority === 'high') score -= 10;
      else if (f.priority === 'medium') score -= 5;
      else score -= 2;
    });

    score = Math.max(0, score);
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    return { score, grade };
  }
}

// ============================================================================
// API Design Skill
// ============================================================================

export class APIDesignSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'api_design',
    category: 'architecture',
    description: 'Generate RESTful API design with endpoints, schemas, and documentation',
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Domain/resource name (e.g., "user", "product", "order")',
      },
      {
        name: 'operations',
        type: 'array',
        required: false,
        description: 'Operations to include: create, read, update, delete, list, search',
      },
      {
        name: 'auth',
        type: 'boolean',
        required: false,
        description: 'Include authentication/authorization',
      },
    ],
    returns: {
      type: 'object',
      description: 'API design with endpoints and schemas',
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
      const domain = input.domain as string;
      const operations = (input.operations as string[]) || ['create', 'read', 'update', 'delete', 'list'];
      const auth = (input.auth as boolean) ?? true;

      logger.info(`Designing API for ${domain} domain`);

      const endpoints = this.generateEndpoints(domain, operations, auth);
      const schemas = this.generateSchemas(domain);

      return {
        success: true,
        data: {
          domain,
          base_url: `/api/v1/${domain}s`,
          endpoints,
          schemas,
          authentication: auth ? {
            type: 'Bearer JWT',
            header: 'Authorization: Bearer <token>',
            required_for: operations.filter((op) => op !== 'read'),
          } : null,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `API design failed: ${error}`,
      };
    }
  }

  private generateEndpoints(domain: string, operations: string[], auth: boolean): Array<{
    method: string;
    path: string;
    description: string;
    auth_required: boolean;
    request?: Record<string, unknown>;
    response: Record<string, unknown>;
  }> {
    const endpoints: Array<{
      method: string;
      path: string;
      description: string;
      auth_required: boolean;
      request?: Record<string, unknown>;
      response: Record<string, unknown>;
    }> = [];

    const resourcePlural = `${domain}s`;

    if (operations.includes('list')) {
      endpoints.push({
        method: 'GET',
        path: `/${resourcePlural}`,
        description: `List all ${resourcePlural}`,
        auth_required: auth,
        response: { data: `Array<${domain}>`, pagination: { page: 1, limit: 20, total: 100 } },
      });
    }

    if (operations.includes('read')) {
      endpoints.push({
        method: 'GET',
        path: `/${resourcePlural}/:id`,
        description: `Get ${domain} by ID`,
        auth_required: false,
        response: { data: `${domain}` },
      });
    }

    if (operations.includes('create')) {
      endpoints.push({
        method: 'POST',
        path: `/${resourcePlural}`,
        description: `Create new ${domain}`,
        auth_required: auth,
        request: { body: `Create${domain}DTO` },
        response: { data: `${domain}`, message: 'Created successfully' },
      });
    }

    if (operations.includes('update')) {
      endpoints.push({
        method: 'PUT',
        path: `/${resourcePlural}/:id`,
        description: `Update ${domain}`,
        auth_required: auth,
        request: { body: `Update${domain}DTO` },
        response: { data: `${domain}`, message: 'Updated successfully' },
      });
    }

    if (operations.includes('delete')) {
      endpoints.push({
        method: 'DELETE',
        path: `/${resourcePlural}/:id`,
        description: `Delete ${domain}`,
        auth_required: auth,
        response: { message: 'Deleted successfully' },
      });
    }

    if (operations.includes('search')) {
      endpoints.push({
        method: 'GET',
        path: `/${resourcePlural}/search`,
        description: `Search ${resourcePlural}`,
        auth_required: false,
        request: { query: { q: 'string', filters: 'object' } },
        response: { data: `Array<${domain}>`, count: 'number' },
      });
    }

    return endpoints;
  }

  private generateSchemas(domain: string): Record<string, unknown> {
    return {
      [domain]: {
        id: 'string (UUID)',
        created_at: 'ISO8601 timestamp',
        updated_at: 'ISO8601 timestamp',
        // Domain-specific fields would be added here
      },
      [`Create${domain}DTO`]: {
        // Required fields for creation
      },
      [`Update${domain}DTO`]: {
        // Optional fields for update
      },
    };
  }
}

// ============================================================================
// Database Schema Skill
// ============================================================================

export class DatabaseSchemaSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'database_schema',
    category: 'architecture',
    description: 'Design database schema with tables, relationships, and indexes',
    parameters: [
      {
        name: 'entities',
        type: 'array',
        required: true,
        description: 'Entity names (e.g., ["user", "product", "order"])',
      },
      {
        name: 'database',
        type: 'string',
        required: false,
        description: 'Database type: postgres|mysql|mongodb',
      },
    ],
    returns: {
      type: 'object',
      description: 'Database schema with migrations',
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
      const entities = input.entities as string[];
      const database = (input.database as string) || 'postgres';

      logger.info(`Generating ${database} schema for ${entities.join(', ')}`);

      const tables = entities.map((entity) => this.generateTable(entity, database));
      const relationships = this.generateRelationships(entities);

      return {
        success: true,
        data: {
          database,
          tables,
          relationships,
          migrations: tables.map((table) => this.generateMigration(table, database)),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Schema generation failed: ${error}`,
      };
    }
  }

  private generateTable(entity: string, database: string): {
    name: string;
    columns: Array<{ name: string; type: string; constraints: string[] }>;
    indexes: string[];
  } {
    const tableName = `${entity}s`;
    const idType = database === 'mongodb' ? 'ObjectId' : 'UUID';
    const timestampType = database === 'postgres' ? 'TIMESTAMP WITH TIME ZONE' : 'DATETIME';

    return {
      name: tableName,
      columns: [
        { name: 'id', type: idType, constraints: ['PRIMARY KEY'] },
        { name: 'created_at', type: timestampType, constraints: ['NOT NULL', 'DEFAULT CURRENT_TIMESTAMP'] },
        { name: 'updated_at', type: timestampType, constraints: ['NOT NULL', 'DEFAULT CURRENT_TIMESTAMP'] },
        { name: 'deleted_at', type: timestampType, constraints: ['NULL'] },
      ],
      indexes: ['created_at', 'updated_at'],
    };
  }

  private generateRelationships(entities: string[]): Array<{
    from: string;
    to: string;
    type: string;
    foreign_key: string;
  }> {
    const relationships: Array<{
      from: string;
      to: string;
      type: string;
      foreign_key: string;
    }> = [];

    // Generate common relationships
    if (entities.includes('user') && entities.includes('order')) {
      relationships.push({
        from: 'orders',
        to: 'users',
        type: 'many-to-one',
        foreign_key: 'user_id',
      });
    }

    if (entities.includes('order') && entities.includes('product')) {
      relationships.push({
        from: 'orders',
        to: 'products',
        type: 'many-to-many',
        foreign_key: 'order_products (join table)',
      });
    }

    return relationships;
  }

  private generateMigration(table: { name: string; columns: Array<{ name: string; type: string; constraints: string[] }> }, database: string): string {
    if (database === 'mongodb') {
      return `// MongoDB uses dynamic schemas, no migration needed for ${table.name}`;
    }

    const columns = table.columns
      .map((col) => `  ${col.name} ${col.type} ${col.constraints.join(' ')}`)
      .join(',\n');

    return `CREATE TABLE ${table.name} (\n${columns}\n);`;
  }
}

// ============================================================================
// Debugging Skill
// ============================================================================

export class DebuggingSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'debugging',
    category: 'code',
    description: 'Analyze errors and suggest debugging strategies',
    parameters: [
      {
        name: 'error',
        type: 'string',
        required: true,
        description: 'Error message or stack trace',
      },
      {
        name: 'code',
        type: 'string',
        required: false,
        description: 'Relevant code snippet',
      },
      {
        name: 'context',
        type: 'string',
        required: false,
        description: 'Additional context about the error',
      },
    ],
    returns: {
      type: 'object',
      description: 'Debugging analysis and suggestions',
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
      const error = input.error as string;
      const code = (input.code as string) || '';
      const context = (input.context as string) || '';

      logger.info('Analyzing error for debugging');

      const analysis = this.analyzeError(error, code, context);

      return {
        success: true,
        data: {
          error_type: analysis.type,
          root_cause: analysis.rootCause,
          suggestions: analysis.suggestions,
          debugging_steps: analysis.steps,
          prevention: analysis.prevention,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Debugging analysis failed: ${error}`,
      };
    }
  }

  private analyzeError(error: string, code: string, context: string): {
    type: string;
    rootCause: string;
    suggestions: string[];
    steps: string[];
    prevention: string[];
  } {
    const suggestions: string[] = [];
    const steps: string[] = [];
    const prevention: string[] = [];
    let type = 'Unknown';
    let rootCause = 'Unable to determine';

    // Null/undefined errors
    if (error.includes('undefined') || error.includes('null')) {
      type = 'NullReference';
      rootCause = 'Accessing property of undefined/null object';
      suggestions.push('Add null checks before accessing properties');
      suggestions.push('Use optional chaining (?.) operator');
      suggestions.push('Verify object initialization');
      steps.push('Add console.log before the error line to check object state');
      steps.push('Use debugger breakpoint to inspect variable values');
      prevention.push('Use TypeScript for compile-time null checks');
      prevention.push('Add runtime validation for function parameters');
    }

    // Type errors
    if (error.includes('TypeError') || error.includes('is not a function')) {
      type = 'TypeError';
      rootCause = 'Incorrect type usage or undefined function';
      suggestions.push('Verify the object type matches expected interface');
      suggestions.push('Check if function is properly imported');
      suggestions.push('Ensure the object has the method you are calling');
      steps.push('Log the object to see its actual type and available methods');
      steps.push('Check import statements for typos');
      prevention.push('Use TypeScript for type safety');
      prevention.push('Add JSDoc comments for function signatures');
    }

    // Async errors
    if (error.includes('Promise') || error.includes('async')) {
      type = 'AsyncError';
      rootCause = 'Improper async/await or promise handling';
      suggestions.push('Add await keyword before async function calls');
      suggestions.push('Add try/catch around async operations');
      suggestions.push('Check promise rejection handling');
      steps.push('Verify all async functions are awaited');
      steps.push('Add .catch() to promise chains');
      prevention.push('Always use try/catch with async/await');
      prevention.push('Set up global unhandled rejection handler');
    }

    // Network errors
    if (error.includes('fetch') || error.includes('network') || error.includes('ECONNREFUSED')) {
      type = 'NetworkError';
      rootCause = 'Network request failure or server unavailable';
      suggestions.push('Check if server is running');
      suggestions.push('Verify URL and endpoint correctness');
      suggestions.push('Check CORS configuration');
      suggestions.push('Add request timeout handling');
      steps.push('Test endpoint with curl or Postman');
      steps.push('Check network tab in browser DevTools');
      prevention.push('Implement retry logic with exponential backoff');
      prevention.push('Add comprehensive error handling for network requests');
    }

    // Generic suggestions if no specific error matched
    if (suggestions.length === 0) {
      suggestions.push('Read the full error stack trace');
      suggestions.push('Check recent code changes');
      suggestions.push('Search for similar errors online');
      steps.push('Add console.log statements to trace execution flow');
      steps.push('Use debugger to step through the code');
      prevention.push('Add comprehensive error handling');
      prevention.push('Write unit tests to catch errors early');
    }

    return { type, rootCause, suggestions, steps, prevention };
  }
}

// ============================================================================
// Migration Skill
// ============================================================================

export class MigrationSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'migration',
    category: 'architecture',
    description: 'Generate migration plans for code, framework, or database upgrades',
    parameters: [
      {
        name: 'from',
        type: 'string',
        required: true,
        description: 'Source (e.g., "Vue 2", "Node 14", "MySQL 5.7")',
      },
      {
        name: 'to',
        type: 'string',
        required: true,
        description: 'Target (e.g., "Vue 3", "Node 20", "PostgreSQL 15")',
      },
      {
        name: 'scope',
        type: 'string',
        required: false,
        description: 'Migration scope: full|incremental|test',
      },
    ],
    returns: {
      type: 'object',
      description: 'Migration plan with steps and risks',
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
      const from = input.from as string;
      const to = input.to as string;
      const scope = (input.scope as string) || 'full';

      logger.info(`Generating migration plan: ${from} → ${to}`);

      const plan = this.generateMigrationPlan(from, to, scope);

      return {
        success: true,
        data: plan,
      };
    } catch (error) {
      return {
        success: false,
        error: `Migration planning failed: ${error}`,
      };
    }
  }

  private generateMigrationPlan(from: string, to: string, scope: string): {
    from: string;
    to: string;
    scope: string;
    phases: Array<{ name: string; steps: string[]; duration: string }>;
    breaking_changes: string[];
    risks: Array<{ risk: string; mitigation: string }>;
    rollback_plan: string[];
  } {
    const phases: Array<{ name: string; steps: string[]; duration: string }> = [];
    const breakingChanges: string[] = [];
    const risks: Array<{ risk: string; mitigation: string }> = [];

    // Phase 1: Preparation
    phases.push({
      name: 'Preparation',
      steps: [
        'Audit current codebase and dependencies',
        'Review migration guides and breaking changes',
        'Set up testing environment',
        'Create backup/rollback plan',
        'Document current state',
      ],
      duration: '1-2 days',
    });

    // Phase 2: Dependencies
    phases.push({
      name: 'Update Dependencies',
      steps: [
        `Update package.json to ${to} version`,
        'Update related dependencies',
        'Resolve peer dependency conflicts',
        'Run npm/yarn install',
        'Fix compilation errors',
      ],
      duration: '0.5-1 day',
    });

    // Phase 3: Code Migration
    phases.push({
      name: 'Code Migration',
      steps: [
        'Run automated migration tools (if available)',
        'Update deprecated APIs and syntax',
        'Refactor breaking changes',
        'Update type definitions (if TypeScript)',
        'Fix linting errors',
      ],
      duration: '2-5 days',
    });

    // Phase 4: Testing
    phases.push({
      name: 'Testing & Validation',
      steps: [
        'Run unit tests and fix failures',
        'Run integration tests',
        'Perform manual QA testing',
        'Test in staging environment',
        'Load/performance testing',
      ],
      duration: '2-3 days',
    });

    // Phase 5: Deployment
    if (scope === 'full') {
      phases.push({
        name: 'Deployment',
        steps: [
          'Deploy to staging environment',
          'Monitor for issues',
          'Deploy to production (gradual rollout)',
          'Monitor metrics and error rates',
          'Complete rollout',
        ],
        duration: '1-2 days',
      });
    }

    // Breaking changes (generic)
    breakingChanges.push(`Check ${to} release notes for breaking changes`);
    breakingChanges.push('API signature changes may require code updates');
    breakingChanges.push('Configuration format changes');

    // Risks
    risks.push({
      risk: 'Unexpected breaking changes in dependencies',
      mitigation: 'Comprehensive testing in staging environment',
    });
    risks.push({
      risk: 'Performance degradation',
      mitigation: 'Load testing before production deployment',
    });
    risks.push({
      risk: 'Third-party library incompatibility',
      mitigation: 'Review and test all integrations',
    });

    const rollbackPlan = [
      'Keep previous version deployment available',
      'Use feature flags to disable new code',
      'Database migration rollback scripts ready',
      'Quick rollback procedure documented',
      'Monitoring alerts configured',
    ];

    return {
      from,
      to,
      scope,
      phases,
      breaking_changes: breakingChanges,
      risks,
      rollback_plan: rollbackPlan,
    };
  }
}
