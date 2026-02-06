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
    workflow.steps.forEach((step) => {
      if (step.input && typeof step.input === 'string') {
        const matches = step.input.match(/\{\{(\w+)\}\}/g);
        if (matches) {
          matches.forEach((match) => {
            const varName = match.slice(2, -2);
            if (!workflow.variables?.[varName] && !allSteps.includes(varName) && !workflow.input_variables?.includes(varName)) {
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

            // Store output
            if (step.output_to) {
              const outputValue =
                result && typeof result === 'object' && 'output' in result
                  ? (result as { output: unknown }).output
                  : result;
              context.variables.set(step.output_to, outputValue);
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
   * Execute a single step (placeholder - to be extended with agent execution)
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
    const systemPrompt = agentConfig?.system_prompt?.trim();

    const composedInput = [
      typeof repoContext === 'string' && repoContext.trim().length > 0
        ? `Repository Context (use only these facts):\n${repoContext}`
        : null,
      rolePrompt ? `Role:\n${rolePrompt}` : null,
      systemPrompt ? `System:\n${systemPrompt}` : null,
      `Task:\n${queryText}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const sessionConfig: SessionConfig = {
      model: agentConfig?.model || 'claude-opus',
      maxToolCalls: 40,
      maxTerminalCommands: 5,
      autoConfirm: {
        files: true,
        terminal: false,
        skills: true,
      },
    };

    const agent = new AutonomousAgent({
      config: sessionConfig,
      workspaceDirectory: process.cwd(),
      interactive: false,
      onConfirmation: async () => true,
      codegen: {
        enforceDirective: false,
      },
    });

    const output = await agent.processInput(composedInput);

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

    await this.ensureAgentsLoaded();

    const analystConfig = this.agentManager.getAgent('analyst');
    const sessionConfig: SessionConfig = {
      model: analystConfig?.model || 'claude-opus',
      maxToolCalls: 50,
      maxTerminalCommands: 0,
      autoConfirm: {
        files: true,
        terminal: false,
        skills: true,
      },
    };

    const agent = new AutonomousAgent({
      config: sessionConfig,
      workspaceDirectory: process.cwd(),
      interactive: false,
      onConfirmation: async () => true,
      codegen: {
        enforceDirective: false,
      },
    });

    const prompt =
      'You are preparing factual repository context for documentation.\n' +
      'Use file tools to list the repository root and read key documentation files.\n' +
      'Do not assume any technologies or features not present in files.\n\n' +
      'Steps:\n' +
      '1) List the repository root.\n' +
      '2) Read package.json and config files (config.yaml if present).\n' +
      '3) Read top-level markdowns (README, ReadMe.MD, CHANGELOG, TROUBLESHOOTING, EXAMPLE_USAGE, EXAMPLE_WORKFLOWS, RECIPES_CATALOG).\n' +
      '4) Read docs/ and docs/guides markdowns.\n\n' +
      'Output a concise, factual summary that includes:\n' +
      '- Actual tech stack and tools (from package.json/config).\n' +
      '- Existing docs list and what each covers.\n' +
      '- Key entry points and modules with real paths.\n' +
      '- Any notable gaps (only if confirmed missing).\n' +
      'Also include a list of file paths you read.';

    const output = await agent.processInput(prompt);
    context.variables.set('repo_context', output);
    return output;
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
