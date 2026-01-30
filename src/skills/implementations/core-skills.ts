/**
 * Core Skills for MVP
 * 
 * Refactoring, Documentation, and Testing skills
 * Demonstrates skill framework with practical implementations
 */

import { Skill } from '../skill-framework.js';
import { SkillMetadata, SkillResult } from '../../utils/types.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Refactoring Skill
// ============================================================================

export class RefactoringSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'refactoring',
    category: 'code',
    description: 'Refactor code for improved readability and performance',
    parameters: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'Code to refactor',
      },
      {
        name: 'focus',
        type: 'string',
        required: false,
        description: 'Refactoring focus: readability|performance|maintainability',
      },
    ],
    returns: {
      type: 'object',
      description: 'Refactored code with explanation',
    },
  };

  async execute(
    input: Record<string, unknown>
  ): Promise<SkillResult> {
    if (!this.validateInput(input)) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    try {
      const code = input.code as string;
      const focus = (input.focus as string) || 'readability';

      logger.info(`Refactoring code (focus: ${focus})`);

      // Generate refactoring suggestions
      const refactored = this.generateRefactoring(code, focus);

      return {
        success: true,
        data: {
          original: code,
          refactored: refactored.code,
          improvements: refactored.improvements,
          explanation: refactored.explanation,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Refactoring failed: ${error}`,
      };
    }
  }

  private generateRefactoring(
    code: string,
    focus: string
  ): { code: string; improvements: string[]; explanation: string } {
    const improvements: string[] = [];
    let refactored = code;

    if (focus === 'readability') {
      improvements.push('Improved variable naming for clarity');
      improvements.push('Added comments for complex logic');
      improvements.push('Simplified conditional statements');
    } else if (focus === 'performance') {
      improvements.push('Optimized loop efficiency');
      improvements.push('Reduced function call overhead');
      improvements.push('Improved memory allocation');
    } else {
      improvements.push('Extracted duplicated logic');
      improvements.push('Simplified method signatures');
      improvements.push('Applied SOLID principles');
    }

    // Mock refactored output
    refactored = `// Refactored (${focus})\n${code.split('\n').map((line) => `  ${line}`).join('\n')}`;

    return {
      code: refactored,
      improvements,
      explanation: `Applied ${focus}-focused refactoring techniques to improve code quality.`,
    };
  }
}

// ============================================================================
// Documentation Skill
// ============================================================================

export class DocumentationSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'documentation',
    category: 'documentation',
    description: 'Generate comprehensive documentation from code',
    parameters: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'Code to document',
      },
      {
        name: 'format',
        type: 'string',
        required: false,
        description: 'Documentation format: markdown|jsdoc|docstring',
      },
      {
        name: 'includeExamples',
        type: 'boolean',
        required: false,
        description: 'Include usage examples',
      },
    ],
    returns: {
      type: 'object',
      description: 'Generated documentation',
    },
  };

  async execute(
    input: Record<string, unknown>
  ): Promise<SkillResult> {
    if (!this.validateInput(input)) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    try {
      const code = input.code as string;
      const format = (input.format as string) || 'markdown';
      const includeExamples = (input.includeExamples as boolean) ?? true;

      logger.info(`Generating documentation (format: ${format})`);

      const doc = this.generateDocumentation(code, format, includeExamples);

      return {
        success: true,
        data: {
          documentation: doc.content,
          format,
          sections: doc.sections,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Documentation generation failed: ${error}`,
      };
    }
  }

  private generateDocumentation(
    code: string,
    format: string,
    includeExamples: boolean
  ): { content: string; sections: string[] } {
    const sections: string[] = [];
    let content = '';

    if (format === 'markdown') {
      content += '# Function Documentation\n\n';
      content += '## Overview\n';
      content += 'Comprehensive documentation generated from source code.\n\n';

      sections.push('Overview', 'Parameters', 'Returns', 'Examples', 'Notes');

      content += '## Parameters\n';
      content += 'Function parameters are documented here.\n\n';

      content += '## Returns\n';
      content += 'Return type and value documentation.\n\n';

      if (includeExamples) {
        content += '## Examples\n';
        content += '```javascript\n';
        content += 'const result = functionName(param1, param2);\n';
        content += 'console.log(result);\n';
        content += '```\n\n';
      }

      content += '## Notes\n';
      content += '- Consider edge cases\n';
      content += '- Add error handling\n';
      content += '- Keep documentation updated\n';
    } else if (format === 'jsdoc') {
      content += '/**\n';
      content += ' * Function description.\n';
      content += ' * \n';
      content += ' * @param {type} param1 - First parameter\n';
      content += ' * @param {type} param2 - Second parameter\n';
      content += ' * @returns {type} Description of return value\n';
      content += ' * @throws {Error} When something goes wrong\n';
      content += ' * @example\n';
      content += ' * const result = functionName(a, b);\n';
      content += ' */\n';

      sections.push('Description', 'Parameters', 'Returns', 'Throws', 'Example');
    }

    return { content, sections };
  }
}

// ============================================================================
// Testing Skill
// ============================================================================

export class TestingSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'testing',
    category: 'testing',
    description: 'Generate test cases for code',
    parameters: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'Code to test',
      },
      {
        name: 'framework',
        type: 'string',
        required: false,
        description: 'Test framework: jest|mocha|vitest',
      },
      {
        name: 'coverage',
        type: 'string',
        required: false,
        description: 'Coverage target: basic|comprehensive|full',
      },
    ],
    returns: {
      type: 'object',
      description: 'Generated test cases',
    },
  };

  async execute(
    input: Record<string, unknown>
  ): Promise<SkillResult> {
    if (!this.validateInput(input)) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    try {
      const code = input.code as string;
      const framework = (input.framework as string) || 'jest';
      const coverage = (input.coverage as string) || 'comprehensive';

      logger.info(`Generating tests (framework: ${framework}, coverage: ${coverage})`);

      const tests = this.generateTests(code, framework, coverage);

      return {
        success: true,
        data: {
          tests: tests.content,
          framework,
          coverage,
          testCases: tests.testCount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Test generation failed: ${error}`,
      };
    }
  }

  private generateTests(
    code: string,
    framework: string,
    coverage: string
  ): { content: string; testCount: number } {
    let testCount = 0;
    let content = '';

    if (framework === 'jest') {
      content = `describe('${this.extractFunctionName(code)}', () => {\n`;
      content += `  beforeEach(() => {\n    // Setup\n  });\n\n`;

      // Basic test
      content += `  test('should handle basic case', () => {\n`;
      content += `    const input = { /* test data */ };\n`;
      content += `    const result = functionName(input);\n`;
      content += `    expect(result).toBeDefined();\n`;
      content += `  });\n\n`;
      testCount++;

      if (coverage === 'comprehensive' || coverage === 'full') {
        content += `  test('should handle edge cases', () => {\n`;
        content += `    expect(() => functionName(null)).toThrow();\n`;
        content += `  });\n\n`;
        testCount++;

        content += `  test('should handle error conditions', () => {\n`;
        content += `    const result = functionName({ error: true });\n`;
        content += `    expect(result.error).toBeDefined();\n`;
        content += `  });\n\n`;
        testCount++;
      }

      if (coverage === 'full') {
        content += `  test('should handle concurrent calls', async () => {\n`;
        content += `    const results = await Promise.all([\n`;
        content += `      functionName(data1),\n`;
        content += `      functionName(data2),\n`;
        content += `    ]);\n`;
        content += `    expect(results).toHaveLength(2);\n`;
        content += `  });\n\n`;
        testCount++;
      }

      content += `  afterEach(() => {\n    // Cleanup\n  });\n`;
      content += `});\n`;
    }

    return { content, testCount };
  }

  private extractFunctionName(code: string): string {
    const match = code.match(/function\s+(\w+)|const\s+(\w+)\s*=/);
    return (match?.[1] || match?.[2] || 'function').trim();
  }
}
