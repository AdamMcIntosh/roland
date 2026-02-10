/**
 * Workflow Engine Core
 * 
 * Orchestrates multi-step workflows with variable interpolation,
 * conditional execution, and agent coordination.
 */

import { Workflow, WorkflowStep, WorkflowContext, WorkflowResult, ValidationResult } from './types.js';
import { AutonomousAgent } from '../agent-loop/agent.js';
import { SessionConfig } from '../agent-loop/types.js';
import { getAgentManager } from '../agents/agent-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { CacheManager } from '../cache/index.js';

// Simple UUID generator for workflow IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Workflow Engine - Executes workflows with multi-agent coordination
 */
export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private contexts: Map<string, WorkflowContext> = new Map();
  private cacheManager: CacheManager;
  private agentManager = getAgentManager();
  private agentsLoaded = false;

  constructor(enableCache: boolean = true) {
    this.cacheManager = new CacheManager({
      enabled: enableCache,
      persistent: true,
      cachePath: './cache.json',
    });
    logger.info('[WorkflowEngine] Initialized with caching ' + (enableCache ? 'enabled' : 'disabled'));
  }

  private async ensureAgentsLoaded(): Promise<void> {
    if (this.agentsLoaded) return;
    const existing = this.agentManager.getAllAgents();
    if (existing.length === 0) {
      await this.agentManager.loadAgents();
    }
    this.agentsLoaded = true;
  }

  /**
   * Register a workflow
   */
  registerWorkflow(workflow: Workflow): void {
    const key = `${workflow.name}:${workflow.version || '1.0.0'}`;
    this.workflows.set(key, workflow);
    logger.debug(`[WorkflowEngine] Registered workflow: ${key}`);
  }

  /**
   * Get registered workflow
   */
  getWorkflow(name: string, version?: string): Workflow | undefined {
    const key = `${name}:${version || '1.0.0'}`;
    return this.workflows.get(key);
  }

  /**
   * List all registered workflows
   */
  listWorkflows(): Array<{ name: string; version: string; description?: string }> {
    return Array.from(this.workflows.values()).map((w) => ({
      name: w.name,
      version: w.version || '1.0.0',
      description: w.description,
    }));
  }

  /**
   * Validate a workflow definition
   */
  validateWorkflow(workflow: Workflow): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!workflow.name) {
      errors.push('Workflow must have a name');
    }
    if (!workflow.agents || workflow.agents.length === 0) {
      errors.push('Workflow must specify at least one agent');
    }
    if (!workflow.steps || workflow.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Check steps
    workflow.steps.forEach((step, index) => {
      if (!step.name) {
        errors.push(`Step ${index} must have a name`);
      }
      if (!step.agent && !step.action) {
        errors.push(`Step "${step.name}" must specify either agent or action`);
      }
      if (step.loop_if && !step.loop_if.condition) {
        errors.push(`Step "${step.name}" loop_if must have a condition`);
      }
    });

    // Check variable references
    const allSteps = workflow.steps.map((s) => s.name);
    const allOutputVars = new Set(workflow.steps.map((s) => s.output_to).filter(Boolean));
    workflow.steps.forEach((step) => {
      if (step.input && typeof step.input === 'string') {
        const matches = step.input.match(/\{\{(\w+)\}\}/g);
        if (matches) {
          matches.forEach((match) => {
            const varName = match.slice(2, -2);
            if (!workflow.variables?.[varName] && !allSteps.includes(varName) && !workflow.input_variables?.includes(varName) && !allOutputVars.has(varName)) {
              warnings.push(
                `Step "${step.name}" references unknown variable or step: ${varName}`
              );
            }
          });
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowName: string,
    inputs: Record<string, any> = {},
    version?: string,
    useCache: boolean = true
  ): Promise<WorkflowResult> {
    const workflow = this.getWorkflow(workflowName, version);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    // Check cache first
    if (useCache) {
      const cacheHit = this.cacheManager.get(workflowName, version || '1.0.0', inputs);
      if (cacheHit.hit) {
        logger.success(`[WorkflowEngine] Cache HIT for ${workflowName} (saved $${cacheHit.costSaved?.toFixed(4)}, ${cacheHit.timeSaved}ms)`);
        return cacheHit.result;
      }
    }

    // Validate workflow
    const validation = this.validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      logger.warn(`[WorkflowEngine] Workflow warnings:`, validation.warnings);
    }

    // Create context
    const workflowId = generateId();
    const startTime = Date.now();
    const context: WorkflowContext = {
      workflowId,
      workflowName,
      variables: new Map(),
      startTime,
      totalCost: 0,
      costPerStep: new Map(),
      stepResults: new Map(),
      stepStartTime: new Map(),
      status: 'running',
    };

    // Initialize variables
    if (workflow.variables) {
      Object.entries(workflow.variables).forEach(([key, value]) => {
        context.variables.set(key, value);
      });
    }

    // Set input variables
    Object.entries(inputs).forEach(([key, value]) => {
      context.variables.set(key, value);
    });

    this.contexts.set(workflowId, context);

    try {
      const repoContext = await this.buildRepoContext(context);
      context.variables.set('repo_context', repoContext);

      logger.info(`[WorkflowEngine] Starting workflow execution: ${workflowName}`);

      // Execute steps sequentially
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];

        // Check if should skip
        if (step.skip_if && this.evaluateCondition(step.skip_if, context)) {
          logger.debug(`[WorkflowEngine] Skipping step: ${step.name}`);
          continue;
        }

        // Handle loops
        let loopCount = 0;
        const maxLoops = step.loop_if?.max_iterations || 3;

        do {
          logger.debug(`[WorkflowEngine] Executing step: ${step.name}${loopCount > 0 ? ` (loop ${loopCount + 1})` : ''}`);
          context.stepStartTime.set(step.name, Date.now());

          try {
            const result = await this.executeStep(step, context);
            context.stepResults.set(step.name, result);

            // Track cost
            const stepCost = (result as any).cost || 0;
            context.totalCost += stepCost;
            context.costPerStep.set(step.name, stepCost);

            // Store output (cap size for token budget in subsequent steps)
            if (step.output_to) {
              const outputValue =
                result && typeof result === 'object' && 'output' in result
                  ? (result as { output: unknown }).output
                  : result;
              const MAX_STEP_OUTPUT_CHARS = 12000;
              if (typeof outputValue === 'string' && outputValue.length > MAX_STEP_OUTPUT_CHARS) {
                const truncated = outputValue.slice(0, MAX_STEP_OUTPUT_CHARS) + '\n\n[OUTPUT TRUNCATED — use read_file tools for additional details]';
                context.variables.set(step.output_to, truncated);
                logger.info(`[WorkflowEngine] Truncated step "${step.name}" output from ${outputValue.length} to ${MAX_STEP_OUTPUT_CHARS} chars for variable {{${step.output_to}}}`);
              } else {
                context.variables.set(step.output_to, outputValue);
              }
            }

            loopCount++;
          } catch (error) {
            logger.error(`[WorkflowEngine] Step failed: ${step.name}`, error);
            if (!step.retry || !step.retry.max_attempts || step.retry.max_attempts <= 1) {
              throw error;
            }
            // Retry logic would go here
          }
        } while (
          step.loop_if &&
          loopCount < maxLoops &&
          this.evaluateCondition(step.loop_if.condition, context)
        );
      }

      context.status = 'completed';
      context.endTime = Date.now();

      // Build result outputs
      const outputs: Record<string, any> = {};
      if (workflow.outputs) {
        Object.entries(workflow.outputs).forEach(([key, variable]) => {
          outputs[key] = context.variables.get(variable);
        });
      }

      logger.info(
        `[WorkflowEngine] Workflow completed: ${workflowName} (Cost: $${context.totalCost.toFixed(4)}, Duration: ${context.endTime - startTime}ms)`
      );

      const result: WorkflowResult = {
        workflowId,
        workflowName,
        status: 'success',
        outputs,
        totalCost: context.totalCost,
        totalDuration: context.endTime - startTime,
        startTime,
        endTime: context.endTime,
        stepsExecuted: workflow.steps.length,
        stepResults: context.stepResults,
      };

      // Cache successful result
      if (useCache) {
        this.cacheManager.set(workflowName, version || '1.0.0', inputs, result);
      }

      return result;
    } catch (error) {
      context.status = 'failed';
      context.endTime = Date.now();

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[WorkflowEngine] Workflow failed: ${workflowName}`, error);

      return {
        workflowId,
        workflowName,
        status: 'failed',
        outputs: {},
        totalCost: context.totalCost,
        totalDuration: context.endTime - startTime,
        startTime,
        endTime: context.endTime,
        stepsExecuted: context.stepResults.size,
        stepResults: context.stepResults,
        errorMessage,
      };
    }
  }

  /**
   * Execute a single workflow step using an autonomous agent
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    // Interpolate input with variables
    const interpolatedInput = this.interpolateVariables(step.input, context);

    logger.debug(`[WorkflowEngine] Step "${step.name}" - Input:`, interpolatedInput);

    if (!step.agent) {
      throw new Error(`Step "${step.name}" has no agent; action execution is not implemented.`);
    }

    await this.ensureAgentsLoaded();

    const queryText =
      typeof interpolatedInput === 'string'
        ? interpolatedInput
        : JSON.stringify(interpolatedInput, null, 2);

    const repoContext = context.variables.get('repo_context');

    const agentConfig = this.agentManager.getAgent(step.agent);
    const rolePrompt = agentConfig?.role_prompt?.trim();
    const systemPromptText = agentConfig?.system_prompt?.trim();

    // Build system prompt (always sent via the system parameter, never truncated)
    const systemParts = [
      'GROUNDING INSTRUCTIONS:',
      'You have access to file tools (read_file, list_files, get_file_info).',
      'You MUST use these tools to verify facts before making claims.',
      'The repository context below was read directly from disk — treat it as ground truth.',
      'DO NOT invent, assume, or hallucinate any technologies, features, classes, or modules.',
      'If something is not in the provided context or readable via tools, state it is unknown.',
    ];

    if (typeof repoContext === 'string' && repoContext.trim().length > 0) {
      systemParts.push('');
      systemParts.push('REPOSITORY CONTEXT (read from actual files on disk):');
      systemParts.push(repoContext);
    }

    if (rolePrompt) {
      systemParts.push('');
      systemParts.push(`Role: ${rolePrompt}`);
    }

    if (systemPromptText) {
      systemParts.push('');
      systemParts.push(systemPromptText);
    }

    const systemPrompt = systemParts.join('\n');

    // User message is ONLY the task
    const userMessage = queryText;

    logger.info(`[WorkflowEngine] Step "${step.name}" — agent=${step.agent}, model=${agentConfig?.model || 'default'}`);
    logger.debug(`[WorkflowEngine] System prompt: ${systemPrompt.length} chars`);
    logger.debug(`[WorkflowEngine] User message: ${userMessage.length} chars, first 300: ${userMessage.slice(0, 300)}`);

    const sessionConfig: SessionConfig = {
      model: agentConfig?.model || 'nousresearch/hermes-3-llama-3.1-405b:free',
      maxToolCalls: 40,
      maxTerminalCommands: 0,
      autoConfirm: {
        files: false,
        terminal: false,
        skills: true,
      },
    };

    const agent = new AutonomousAgent({
      config: sessionConfig,
      workspaceDirectory: process.cwd(),
      interactive: false,
      onConfirmation: async () => false,
      codegen: {
        enforceDirective: false,
      },
    });

    const output = await agent.processInput(userMessage, systemPrompt);

    logger.info(`[WorkflowEngine] Step "${step.name}" completed — output: ${output.length} chars`);
    logger.debug(`[WorkflowEngine] Step "${step.name}" output first 300: ${output.slice(0, 300)}`);

    return {
      stepName: step.name,
      input: interpolatedInput,
      output,
      result: output,
      model: sessionConfig.model || 'unknown',
      cost: 0,
      cachedHit: false,
      duration: Date.now() - (context.stepStartTime.get(step.name) || Date.now()),
    };
  }

  private async buildRepoContext(context: WorkflowContext): Promise<string> {
    const existing = context.variables.get('repo_context');
    if (typeof existing === 'string' && existing.trim().length > 0) {
      return existing;
    }

    const baseDir = process.cwd();
    const maxCharsPerFile = 1500;
    const maxTotalChars = 12000;

    let totalChars = 0;
    const sections: string[] = [];

    // 1. Root directory listing
    const rootEntries = await fs.readdir(baseDir);
    sections.push('ROOT DIRECTORY LISTING:\n' + rootEntries.join(', '));
    sections.push('');

    // 2. Scan src/ tree (if it exists) to show actual modules
    const srcTree = await this.buildDirectoryTree(path.join(baseDir, 'src'), 2);
    if (srcTree) {
      sections.push('SOURCE CODE STRUCTURE (src/):\n' + srcTree);
      sections.push('');
    }

    // 3. Read config files FIRST — these establish project identity
    const configFiles = [
      'package.json',
      'tsconfig.json',
      'config.yaml',
      'requirements.txt',
      'Cargo.toml',
      'go.mod',
      'pom.xml',
      'build.gradle',
      'setup.py',
      'composer.json',
    ];

    for (const file of configFiles) {
      const fullPath = path.join(baseDir, file);
      const content = await this.safeReadText(fullPath, maxCharsPerFile);
      if (!content) continue;
      const block = `\nFILE: ${file} [PROJECT CONFIG]\n---\n${content}\n---`;
      sections.push(block);
      totalChars += block.length;
    }

    // 4. List documentation files (names only — agent will read via tools)
    const docFiles = [
      'ReadMe.MD', 'README.md', 'REALITY_CHECK.md', 'CHANGELOG.md',
      'EXAMPLE_USAGE.md', 'EXAMPLE_WORKFLOWS.md', 'RECIPES_CATALOG.md',
      'TROUBLESHOOTING.md', 'INSTALLATION.md', 'RELEASE_NOTES.md',
    ];

    const existingDocs: string[] = [];
    for (const file of docFiles) {
      const fullPath = path.join(baseDir, file);
      try {
        await fs.access(fullPath);
        existingDocs.push(file);
      } catch {
        // skip missing
      }
    }

    const docsDir = path.join(baseDir, 'docs');
    const docsMarkdowns = await this.collectMarkdownFiles(docsDir, 50);
    const allDocNames = existingDocs.concat(docsMarkdowns.map((p) => path.relative(baseDir, p)));

    if (allDocNames.length > 0) {
      sections.push('\nEXISTING DOCUMENTATION FILES (use read_file to read them):\n' + allDocNames.join(', '));
    }

    const output = sections.join('\n');
    const hasPackageJson = output.includes('"name":');
    const hasTsConfig = output.includes('tsconfig');
    logger.info(`[WorkflowEngine] buildRepoContext: ${output.length} chars, files read: ${sections.filter(s => s.includes('FILE:')).length}, hasPackageJson=${hasPackageJson}, hasTsConfig=${hasTsConfig}`);
    logger.debug(`[WorkflowEngine] Repo context first 500 chars: ${output.slice(0, 500)}`);
    context.variables.set('repo_context', output);
    return output;
  }

  /**
   * Build a directory tree string showing file/folder structure
   */
  private async buildDirectoryTree(dirPath: string, maxDepth: number, prefix: string = '', depth: number = 0): Promise<string | null> {
    if (depth >= maxDepth) return null;
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      return null;
    }

    const lines: string[] = [];
    const sorted = entries.sort();
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const fullPath = path.join(dirPath, entry);
      const isLast = i === sorted.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      let stat;
      try { stat = await fs.stat(fullPath); } catch { continue; }

      if (stat.isDirectory()) {
        lines.push(prefix + connector + entry + '/');
        const subtree = await this.buildDirectoryTree(fullPath, maxDepth, prefix + childPrefix, depth + 1);
        if (subtree) lines.push(subtree);
      } else {
        lines.push(prefix + connector + entry);
      }
    }
    return lines.length > 0 ? lines.join('\n') : null;
  }

  private async safeReadText(filePath: string, maxChars: number): Promise<string | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      if (raw.length <= maxChars) {
        return raw;
      }
      return raw.slice(0, maxChars) + '\n\n[TRUNCATED]';
    } catch {
      return null;
    }
  }

  private async collectMarkdownFiles(dirPath: string, limit: number): Promise<string[]> {
    const results: string[] = [];
    const visit = async (current: string) => {
      if (results.length >= limit) return;
      let entries: Array<string> = [];
      try {
        entries = await fs.readdir(current);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= limit) break;
        const fullPath = path.join(current, entry);
        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          await visit(fullPath);
        } else if (entry.toLowerCase().endsWith('.md')) {
          results.push(fullPath);
        }
      }
    };

    await visit(dirPath);
    return results;
  }

  /**
   * Interpolate variables in input strings
   */
  private interpolateVariables(
    input: any,
    context: WorkflowContext
  ): any {
    if (typeof input === 'string') {
      let result = input;
      const matches = input.match(/\{\{(\w+)\}\}/g);

      if (matches) {
        matches.forEach((match) => {
          const varName = match.slice(2, -2);
          const value = context.variables.get(varName) || match;
          result = result.replace(match, String(value));
        });
      }

      return result;
    }

    if (typeof input === 'object' && input !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(input)) {
        result[key] = this.interpolateVariables(value, context);
      }
      return result;
    }

    return input;
  }

  /**
   * Evaluate condition expressions (simple implementation)
   */
  private evaluateCondition(condition: string, context: WorkflowContext): boolean {
    try {
      // Simple variable checking
      if (condition.includes('==')) {
        const [left, right] = condition.split('==').map((s) => s.trim());
        const leftVal = context.variables.get(left) ?? left;
        const rightVal = context.variables.get(right) ?? right;
        return String(leftVal) === String(rightVal);
      }

      if (condition.includes('!=')) {
        const [left, right] = condition.split('!=').map((s) => s.trim());
        const leftVal = context.variables.get(left) ?? left;
        const rightVal = context.variables.get(right) ?? right;
        return String(leftVal) !== String(rightVal);
      }

      // Check if variable exists and is truthy
      const value = context.variables.get(condition);
      return !!value;
    } catch (error) {
      logger.warn(`[WorkflowEngine] Error evaluating condition: ${condition}`, error);
      return false;
    }
  }

  /**
   * Get workflow execution context
   */
  getContext(workflowId: string): WorkflowContext | undefined {
    return this.contexts.get(workflowId);
  }

  /**
   * Cancel a running workflow
   */
  cancelWorkflow(workflowId: string): void {
    const context = this.contexts.get(workflowId);
    if (context) {
      context.status = 'cancelled';
      logger.info(`[WorkflowEngine] Cancelled workflow: ${workflowId}`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Clear workflow cache
   */
  clearCache(): void {
    this.cacheManager.clear();
  }

  /**
   * Invalidate cache entries
   */
  invalidateCache(workflowName?: string, version?: string): number {
    return this.cacheManager.invalidate({ workflowName, version });
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache(): number {
    return this.cacheManager.cleanup();
  }

  /**
   * Destroy engine and save cache
   */
  destroy(): void {
    this.cacheManager.destroy();
  }
}

// Global workflow engine instance
let workflowEngine: WorkflowEngine | null = null;

/**
 * Get or create global workflow engine instance
 */
export function getWorkflowEngine(): WorkflowEngine {
  if (!workflowEngine) {
    workflowEngine = new WorkflowEngine();
  }
  return workflowEngine;
}
