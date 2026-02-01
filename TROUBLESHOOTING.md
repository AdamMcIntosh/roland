# Troubleshooting Guide

Common issues and solutions for oh-my-goose workflow orchestration.

## Table of Contents

- [Installation & Setup](#installation--setup)
- [CLI Issues](#cli-issues)
- [Workflow Execution](#workflow-execution)
- [Caching Issues](#caching-issues)
- [Agent & Skill Problems](#agent--skill-problems)
- [Performance & Optimization](#performance--optimization)
- [Debugging Tips](#debugging-tips)

## Installation & Setup

### Issue: Module not found errors

**Error**: `Cannot find module 'oh-my-goose'` or similar

**Solutions**:
1. Ensure all dependencies are installed: `npm install`
2. Build the project: `npm run build`
3. Check that you're importing from compiled JavaScript with `.js` extensions:
   ```typescript
   // ✅ Correct
   import { WorkflowEngine } from './dist/workflows/engine.js';
   
   // ❌ Wrong
   import { WorkflowEngine } from './dist/workflows/engine';
   ```

### Issue: TypeScript compilation errors

**Error**: `tsc: command not found` or TypeScript errors

**Solutions**:
1. Install TypeScript globally: `npm install -g typescript`
2. Or use npx: `npx tsc`
3. Check `tsconfig.json` for module settings
4. Ensure `.js` extensions are added to all import statements for ES modules

## CLI Issues

### Issue: `goose` command not found

**Error**: `command not found: goose` or `'goose' is not recognized`

**Solutions**:
1. Build the project: `npm run build`
2. Run directly: `node dist/cli/cli-main.js help`
3. Create an alias in your shell:
   ```bash
   alias goose='node /path/to/dist/cli/cli-main.js'
   ```
4. Install globally: `npm install -g` (if published)

### Issue: CLI help text not displaying

**Error**: No output or garbled text when running `goose help`

**Solutions**:
1. Rebuild the project: `npm run build`
2. Clear terminal and try again
3. Check terminal supports UTF-8 (for goose ASCII art)
4. Try a simpler command: `goose --version`

### Issue: Workflow execution command fails silently

**Error**: `goose workflow MyWorkflow` returns nothing

**Solutions**:
1. Verify the workflow exists: `goose recipes`
2. Check the workflow name exactly: `goose workflow MyWorkflow:1.0.0`
3. Check for errors in your shell: `goose workflow MyWorkflow 2>&1`
4. Run in verbose mode if available

## Workflow Execution

### Issue: Workflow not found

**Error**: `Error: Workflow not found: MyWorkflow`

**Solutions**:
1. Register the workflow first:
   ```typescript
   engine.registerWorkflow({
     name: 'MyWorkflow',
     version: '1.0.0',
     // ... rest of workflow definition
   });
   ```
2. Check spelling and case sensitivity
3. Verify version matches: `getWorkflow('MyWorkflow', '1.0.0')`
4. List available workflows: `engine.getWorkflowNames()`

### Issue: Steps not executing in order

**Error**: Steps execute out of order or in parallel

**Solutions**:
1. Note: All steps currently execute sequentially by design
2. If step dependencies are unclear, add explicit step IDs:
   ```yaml
   steps:
     - id: step1
       # ...
     - id: step2
       inputs:
         prevOutput: "{{ step1.output }}"
   ```
3. Check that step outputs are properly referenced

### Issue: Variable interpolation not working

**Error**: Variables like `{{ variableName }}` not being replaced

**Solutions**:
1. Use exact syntax: `{{ variableName }}` (double braces)
2. Only works in workflow step inputs, not in prompts
3. Variables must be provided when executing:
   ```typescript
   await engine.executeWorkflow('Workflow', '1.0.0', {
     variableName: 'value'
   });
   ```
4. For step outputs, use: `{{ stepId.output }}`

### Issue: Step fails silently

**Error**: Step completes but with error status, no clear error message

**Solutions**:
1. Check the detailed step result:
   ```typescript
   result.steps.forEach(step => {
     console.log(`Step ${step.id}:`, step.error);
   });
   ```
2. Validate agent name is correct
3. Check agent inputs match expected parameters
4. Enable debug logging: `process.env.LOG_LEVEL = 'debug'`

## Caching Issues

### Issue: Cache not being used

**Error**: Execution always takes full time, cache stats show 0 hits

**Solutions**:
1. Verify cache is enabled:
   ```typescript
   const cache = new CacheManager({ enabled: true });
   ```
2. Ensure same workflow and inputs on subsequent calls:
   ```typescript
   // First call - cache miss
   await engine.executeWorkflow('Workflow', '1.0.0', { input: 'value' });
   
   // Second call - should hit cache
   await engine.executeWorkflow('Workflow', '1.0.0', { input: 'value' });
   ```
3. Check cache file exists: `cache.json` in project root
4. Verify cache isn't being cleared between calls

### Issue: Stale cache results

**Error**: Getting old results when data should be fresh

**Solutions**:
1. Check cache TTL (time-to-live):
   ```typescript
   const cache = new CacheManager({ 
     ttl: 3600000 // 1 hour in milliseconds
   });
   ```
2. Clear cache manually if needed:
   ```typescript
   cache.clear();
   ```
3. Invalidate specific workflow:
   ```typescript
   cache.invalidate('WorkflowName:1.0.0:{}');
   ```
4. Disable caching for testing:
   ```typescript
   const cache = new CacheManager({ enabled: false });
   ```

### Issue: Cache persistence not working

**Error**: Cache lost after application restart

**Solutions**:
1. Enable persistent caching:
   ```typescript
   const cache = new CacheManager({ persistent: true });
   ```
2. Verify `cache.json` is created in project root
3. Check file permissions for write access
4. Ensure application doesn't delete `cache.json`
5. For development, temporarily disable: `persistent: false`

## Agent & Skill Problems

### Issue: Agent not found

**Error**: `Error: Agent not found: agent_name`

**Solutions**:
1. Verify agent name from available agents:
   ```typescript
   const agents = agentManager.listAgents();
   console.log(agents);
   ```
2. Check agent configuration in `agents/` directory
3. Ensure agent is registered:
   ```typescript
   await initializeAgents();
   ```
4. Available agents: `analyst`, `architect`, `critic`, `designer`, `executor`, `planner`, `qa-tester`, `researcher`, `vision`, `writer`

### Issue: Skill execution fails

**Error**: `Error: Skill execution failed: skill_name`

**Solutions**:
1. Verify skill is registered:
   ```typescript
   await initializeSkills();
   const skill = skillRegistry.getSkill('skill_name');
   ```
2. Check skill parameters:
   ```typescript
   const metadata = skill.metadata;
   console.log('Required params:', metadata.parameters);
   ```
3. Provide required inputs:
   ```typescript
   await skill.execute({
     code: 'valid code string',
     // other required parameters
   });
   ```
4. Available skills: `refactoring`, `documentation`, `testing`, `security_scan`, `performance`

### Issue: Missing skill parameter error

**Error**: `Missing required parameter: code`

**Solutions**:
1. Check which parameters are required in skill metadata
2. Provide all required parameters:
   ```typescript
   await skill.execute({
     code: 'your code here', // required
     improvements: 'optional description' // optional
   });
   ```
3. Validate parameter types (string, object, array, etc.)
4. Use skill metadata to discover parameters:
   ```typescript
   skill.metadata.parameters.forEach(param => {
     console.log(`${param.name}: ${param.type} (required: ${param.required})`);
   });
   ```

## Performance & Optimization

### Issue: Slow workflow execution

**Error**: Workflows take too long to complete

**Solutions**:
1. Check if using cache:
   ```typescript
   const stats = engine.getCacheStats();
   console.log('Cache hits:', stats.hits);
   ```
2. Reduce input size:
   ```typescript
   // ❌ Large input
   await engine.executeWorkflow('Workflow', '1.0.0', { 
     largeFile: '... 10MB of data ...' 
   });
   
   // ✅ Reference or summary
   await engine.executeWorkflow('Workflow', '1.0.0', { 
     filePath: '/path/to/file.js' 
   });
   ```
3. Simplify workflow steps
4. Consider parallel workflows in future versions

### Issue: Memory usage growing

**Error**: Application memory increases over time

**Solutions**:
1. Implement cache cleanup:
   ```typescript
   setInterval(() => {
     cache.cleanup();
   }, 300000); // Every 5 minutes
   ```
2. Clear old cache entries:
   ```typescript
   cache.invalidate('WorkflowName:1.0.0:*');
   ```
3. Monitor workflow results size
4. Enable garbage collection in Node.js: `--expose-gc` flag

### Issue: Too many cached entries

**Error**: `cache.json` growing very large

**Solutions**:
1. Reduce cache TTL:
   ```typescript
   const cache = new CacheManager({ 
     ttl: 1800000 // 30 minutes instead of 1 hour
   });
   ```
2. Clear cache periodically:
   ```typescript
   cache.clear();
   ```
3. Implement cache size limits (future enhancement)
4. Rotate cache file:
   ```bash
   mv cache.json cache.backup.json
   ```

## Debugging Tips

### Enable Debug Logging

```typescript
import { logger } from './src/utils/logger.js';

// Set log level
if (process.env.LOG_LEVEL === 'debug') {
  logger.setLevel('debug');
}

// Or in code
logger.debug('Detailed debug information');
logger.info('Important information');
logger.warn('Warning message');
logger.error('Error message');
```

### Inspect Workflow State

```typescript
// Get all workflows
const allWorkflows = engine.getAllWorkflows();
console.log('Registered workflows:', allWorkflows);

// Get specific workflow
const workflow = engine.getWorkflow('Workflow', '1.0.0');
console.log('Workflow structure:', workflow);

// Get cache stats
const stats = engine.getCacheStats();
console.log('Cache statistics:', stats);
```

### Monitor Execution Step-by-Step

```typescript
const result = await engine.executeWorkflow('Workflow', '1.0.0', {});

result.steps.forEach((step, index) => {
  console.log(`\nStep ${index + 1}: ${step.id}`);
  console.log(`  Status: ${step.status}`);
  console.log(`  Duration: ${step.duration}ms`);
  if (step.error) {
    console.log(`  Error: ${step.error}`);
  }
  console.log(`  Output: ${step.output?.substring(0, 100)}...`);
});
```

### Validate Workflow Configuration

```typescript
// Check workflow structure
function validateWorkflow(workflow) {
  const errors = [];
  
  if (!workflow.name) errors.push('Missing name');
  if (!workflow.version) errors.push('Missing version');
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    errors.push('No steps defined');
  }
  
  workflow.steps?.forEach((step, i) => {
    if (!step.id) errors.push(`Step ${i}: Missing id`);
    if (!step.agent) errors.push(`Step ${i}: Missing agent`);
    if (!step.prompt) errors.push(`Step ${i}: Missing prompt`);
  });
  
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

const validation = validateWorkflow(myWorkflow);
if (!validation.valid) {
  console.log('Workflow errors:', validation.errors);
}
```

## Getting Help

If you can't find the solution here:

1. Check [Example Workflows](./EXAMPLE_WORKFLOWS.md) for working examples
2. Review test files for usage patterns:
   - `tests/integration/mcp-tools.test.ts` - Skill usage
   - `tests/e2e/workflow-execution.test.ts` - Workflow examples
3. Check project README: [ReadMe.MD](./ReadMe.MD)
4. Enable all debug logging and inspect the logs carefully

## Report a Bug

When reporting issues, include:

- oh-my-goose version: `cat package.json | grep version`
- Node.js version: `node --version`
- Exact error message and stack trace
- Minimal reproduction code
- Any relevant workflow definitions
- Steps to reproduce the issue
