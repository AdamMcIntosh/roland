# Example Workflows

This guide shows how to create and use workflows with samwise. Workflows are composable units of automation that orchestrate multiple agents to accomplish complex tasks.

## Table of Contents

- [Basic Workflow Structure](#basic-workflow-structure)
- [Creating Your First Workflow](#creating-your-first-workflow)
- [Multi-Step Workflows](#multi-step-workflows)
- [Using Workflow Variables](#using-workflow-variables)
- [Workflow Execution](#workflow-execution)
- [Real-World Examples](#real-world-examples)

## Basic Workflow Structure

Every workflow has the following structure:

```yaml
name: WorkflowName
version: "1.0.0"
description: "Brief description of what this workflow does"
steps:
  - id: step_id
    type: agent
    agent: agent_name
    prompt: "The prompt to send to the agent"
    inputs:
      param1: value1
      param2: value2
metadata:
  tags: ["tag1", "tag2"]
  author: "Your Name"
```

### Key Components

- **name**: Unique identifier for the workflow
- **version**: Semantic versioning (e.g., "1.0.0")
- **description**: Human-readable description
- **steps**: Array of workflow steps to execute in order
- **metadata**: Optional metadata for organization and tracking

## Creating Your First Workflow

### Simple Code Analysis Workflow

```yaml
name: CodeAnalysis
version: "1.0.0"
description: "Analyzes code and suggests improvements"
steps:
  - id: analyze
    type: agent
    agent: analyst
    prompt: "Analyze the following code for issues and improvements"
    inputs:
      code: |
        function calculateSum(arr) {
          let total = 0;
          for (let i = 0; i < arr.length; i++) {
            total = total + arr[i];
          }
          return total;
        }
metadata:
  tags: ["analysis", "code-review"]
  difficulty: "beginner"
```

### Execute the Workflow

```typescript
import { WorkflowEngine } from './src/workflows/engine.js';
import { CacheManager } from './src/cache/cache-manager.js';

// Initialize cache and engine
const cache = new CacheManager({ enabled: true, persistent: true });
const engine = new WorkflowEngine(cache);

// Register workflow
const workflow = {
  name: 'CodeAnalysis',
  version: '1.0.0',
  description: 'Analyzes code and suggests improvements',
  steps: [
    {
      id: 'analyze',
      type: 'agent',
      agent: 'analyst',
      prompt: 'Analyze the following code for issues and improvements',
      inputs: {
        code: 'function calculateSum(arr) { ... }'
      }
    }
  ],
  metadata: { tags: ['analysis'] }
};

engine.registerWorkflow(workflow);

// Execute workflow
const result = await engine.executeWorkflow('CodeAnalysis', '1.0.0', {});
console.log('Workflow result:', result);
```

## Multi-Step Workflows

Combine multiple agents to create complex automation workflows:

```yaml
name: FullCodeReview
version: "1.0.0"
description: "Complete code review with analysis, refactoring, and testing"
steps:
  - id: analyze
    type: agent
    agent: analyst
    prompt: "Analyze this code for issues, performance problems, and security concerns"
    inputs:
      code: "{{ sourceCode }}"
  
  - id: refactor
    type: agent
    agent: architect
    prompt: "Based on the analysis, suggest code refactoring improvements"
    inputs:
      analysis: "{{ analyze.output }}"
      code: "{{ sourceCode }}"
  
  - id: generateTests
    type: agent
    agent: qa-tester
    prompt: "Generate comprehensive test cases for this code"
    inputs:
      code: "{{ sourceCode }}"
      refactoring: "{{ refactor.output }}"
  
  - id: documentation
    type: agent
    agent: writer
    prompt: "Create documentation for this code including examples"
    inputs:
      code: "{{ sourceCode }}"
      analysis: "{{ analyze.output }}"

metadata:
  tags: ["code-review", "testing", "documentation"]
  difficulty: "intermediate"
```

### Key Features

- **Steps execute sequentially** - Each step completes before the next begins
- **Variable interpolation** - Use `{{ stepId.output }}` to reference previous step outputs
- **Input passing** - Pass workflow inputs to steps using `{{ variableName }}`
- **Step tracking** - View which steps have completed and their results

## Using Workflow Variables

### Workflow Input Variables

Pass inputs when executing the workflow:

```typescript
const result = await engine.executeWorkflow('FullCodeReview', '1.0.0', {
  sourceCode: `
    function add(a, b) {
      return a + b;
    }
  `
});
```

Reference them in workflow steps using the double-brace syntax:

```yaml
- id: analyze
  type: agent
  agent: analyst
  prompt: "Analyze this code"
  inputs:
    code: "{{ sourceCode }}"
```

### Step Output Variables

Reference outputs from previous steps:

```yaml
- id: step1
  type: agent
  agent: analyst
  prompt: "Analyze code"
  inputs:
    code: "{{ sourceCode }}"

- id: step2
  type: agent
  agent: architect
  prompt: "Improve based on analysis"
  inputs:
    analysis: "{{ step1.output }}"
```

## Workflow Execution

### Execute via CLI

```bash
# Execute a specific workflow
samwise workflow CodeAnalysis

# Execute a specific version
samwise workflow CodeAnalysis:1.0.0

# Execute with inputs (via JSON)
samwise workflow CodeAnalysis --input '{"sourceCode":"const x = 1;"}'
```

### Execute via TypeScript

```typescript
import { WorkflowEngine } from './src/workflows/engine.js';

const engine = new WorkflowEngine();

// Execute
const result = await engine.executeWorkflow('CodeAnalysis', '1.0.0', {
  // Input parameters
});

// Check result
console.log('Status:', result.status); // 'success', 'partial', or 'error'
console.log('Steps completed:', result.steps.length);
console.log('Duration:', result.duration, 'ms');
console.log('Cost:', result.cost);
```

### Workflow Results

Execution returns a result object:

```typescript
{
  status: 'success' | 'partial' | 'error',
  workflowName: string,
  version: string,
  steps: Array<{
    id: string,
    status: 'success' | 'error' | 'skipped',
    output: string,
    duration: number,
    error?: string
  }>,
  output: string,
  duration: number,
  cost: number,
  timestamp: string,
  cacheHit: boolean
}
```

## Real-World Examples

### Example 1: API Documentation Generator

```yaml
name: APIDocumentationGenerator
version: "1.0.0"
description: "Generates comprehensive API documentation with examples"
steps:
  - id: analyze-api
    type: agent
    agent: architect
    prompt: "Analyze this API interface and identify all endpoints, parameters, and return types"
    inputs:
      apiCode: "{{ apiSourceCode }}"
  
  - id: generate-docs
    type: agent
    agent: writer
    prompt: "Create clear, well-structured documentation with usage examples"
    inputs:
      analysis: "{{ analyze-api.output }}"
      apiCode: "{{ apiSourceCode }}"
  
  - id: create-examples
    type: agent
    agent: qa-tester
    prompt: "Generate practical example code showing how to use each API endpoint"
    inputs:
      documentation: "{{ generate-docs.output }}"
      apiCode: "{{ apiSourceCode }}"
  
  - id: review-quality
    type: agent
    agent: critic
    prompt: "Review the documentation and examples for completeness and clarity"
    inputs:
      documentation: "{{ generate-docs.output }}"
      examples: "{{ create-examples.output }}"

metadata:
  tags: ["documentation", "api", "automation"]
  difficulty: "advanced"
```

### Example 2: Code Quality Pipeline

```yaml
name: CodeQualityPipeline
version: "1.0.0"
description: "Comprehensive code quality checks and improvements"
steps:
  - id: security-scan
    type: agent
    agent: security_scan
    prompt: "Perform security analysis and identify vulnerabilities"
    inputs:
      code: "{{ sourceCode }}"
  
  - id: performance-analysis
    type: agent
    agent: performance
    prompt: "Analyze performance and suggest optimizations"
    inputs:
      code: "{{ sourceCode }}"
  
  - id: refactor-suggestions
    type: agent
    agent: architect
    prompt: "Suggest code refactoring based on security and performance"
    inputs:
      security: "{{ security-scan.output }}"
      performance: "{{ performance-analysis.output }}"
      code: "{{ sourceCode }}"
  
  - id: test-generation
    type: agent
    agent: qa-tester
    prompt: "Generate tests for edge cases and security scenarios"
    inputs:
      code: "{{ sourceCode }}"
      refactoring: "{{ refactor-suggestions.output }}"

metadata:
  tags: ["quality", "security", "performance"]
  difficulty: "advanced"
```

### Example 3: Content Generation Workflow

```yaml
name: BlogPostGenerator
version: "1.0.0"
description: "Create complete blog posts from topic outlines"
steps:
  - id: research
    type: agent
    agent: researcher
    prompt: "Research and gather key points about the topic"
    inputs:
      topic: "{{ topic }}"
  
  - id: outline
    type: agent
    agent: planner
    prompt: "Create a comprehensive outline based on research"
    inputs:
      research: "{{ research.output }}"
      topic: "{{ topic }}"
  
  - id: write-draft
    type: agent
    agent: writer
    prompt: "Write the blog post based on the outline"
    inputs:
      outline: "{{ outline.output }}"
      topic: "{{ topic }}"
  
  - id: review-content
    type: agent
    agent: critic
    prompt: "Review for quality, clarity, and engagement"
    inputs:
      draft: "{{ write-draft.output }}"
  
  - id: optimize
    type: agent
    agent: architect
    prompt: "Optimize for SEO and readability"
    inputs:
      content: "{{ write-draft.output }}"
      feedback: "{{ review-content.output }}"

metadata:
  tags: ["content", "writing", "automation"]
  difficulty: "advanced"
```

## Best Practices

### Naming Conventions

- Use descriptive workflow names: `CodeAnalysis` not `workflow1`
- Keep step IDs simple and lowercase: `analyze-code` not `step_01`
- Use semantic versioning: `1.0.0`, `1.1.0`, `2.0.0`

### Workflow Design

- **Keep workflows focused**: Each workflow should accomplish one main goal
- **Organize steps logically**: Order steps in a way that makes sense
- **Add meaningful metadata**: Use tags and descriptions for discovery
- **Test incrementally**: Create simple workflows first, then add complexity

### Performance

- **Caching**: Results are automatically cached, so repeated executions are fast
- **Parallel potential**: Future versions will support parallel step execution
- **Input optimization**: Minimize input data to reduce processing time

### Error Handling

- Workflows continue even if individual steps encounter errors
- Check the `status` field in results: `'success'`, `'partial'`, or `'error'`
- View step-by-step results to identify where issues occurred

## Next Steps

- [Read the Troubleshooting Guide](./TROUBLESHOOTING.md) for common issues
- [Explore the MCP Tools](./MCP_TOOLS.md) for available agent capabilities
