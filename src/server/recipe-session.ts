/**
 * Recipe Session Manager
 *
 * Manages stateful recipe execution sessions where the IDE (Cursor/VS Code)
 * drives each step. Instead of making server-side LLM calls, the server:
 *   1. Parses the recipe YAML
 *   2. Returns each step's prompt + system prompt to the IDE
 *   3. Accepts the IDE's output for that step
 *   4. Interpolates variables and returns the next step
 *
 * This lets the IDE use its own model while Roland orchestrates the flow,
 * tracks costs, and manages the multi-agent recipe structure.
 */

import { logger } from '../utils/logger.js';
import { AdvancedCostTracker, getGlobalTracker } from '../orchestrator/advanced-cost-tracker.js';

// ============================================================================
// Types
// ============================================================================

export interface SubagentDef {
  name: string;
  prompt: string;
  model?: string;
  provider?: string;
}

export interface RecipeStepDef {
  agent: string;
  input?: string;
  output_to?: string;
  loop_if?: string;
  loop_to?: string;
  final_output?: boolean;
  condition?: string;
}

export interface ParsedRecipe {
  name: string;
  description: string;
  subagents: SubagentDef[];
  steps: RecipeStepDef[];
  options?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface StepPrompt {
  session_id: string;
  step_number: number;
  total_steps: number;
  agent_name: string;
  system_prompt: string;
  user_prompt: string;
  is_final: boolean;
  recipe_name: string;
  previous_outputs: Record<string, string>;
}

export interface SessionSummary {
  session_id: string;
  recipe_name: string;
  status: 'completed' | 'failed';
  steps_executed: number;
  total_steps: number;
  outputs: Record<string, string>;
  cost: SessionCost;
  duration_ms: number;
}

export interface SessionCost {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  per_step: Array<{
    step: number;
    agent: string;
    input_tokens: number;
    output_tokens: number;
    cost: number;
    model?: string;
  }>;
}

interface ActiveSession {
  id: string;
  recipe: ParsedRecipe;
  currentStep: number;
  outputs: Map<string, string>;      // agent_name → output
  stepCosts: SessionCost;
  startTime: number;
  userTask: string;
}

// ============================================================================
// Recipe Session Manager
// ============================================================================

export class RecipeSessionManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private costTracker: AdvancedCostTracker;

  // Auto-expire sessions after 1 hour
  private readonly SESSION_TTL_MS = 60 * 60 * 1000;

  constructor() {
    this.costTracker = getGlobalTracker();
  }

  // --------------------------------------------------------------------------
  // Start a new recipe session
  // --------------------------------------------------------------------------

  startSession(recipe: ParsedRecipe, userTask: string): StepPrompt {
    // Clean expired sessions
    this.cleanExpiredSessions();

    const sessionId = this.generateSessionId();
    const session: ActiveSession = {
      id: sessionId,
      recipe,
      currentStep: 0,
      outputs: new Map(),
      stepCosts: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost: 0,
        per_step: [],
      },
      startTime: Date.now(),
      userTask,
    };

    this.sessions.set(sessionId, session);

    logger.info(`[RecipeSession] Started session ${sessionId} for recipe "${recipe.name}" — ${recipe.steps.length} steps`);

    return this.buildStepPrompt(session);
  }

  // --------------------------------------------------------------------------
  // Advance to the next step
  // --------------------------------------------------------------------------

  advanceSession(
    sessionId: string,
    stepOutput: string,
    costData?: {
      input_tokens?: number;
      output_tokens?: number;
      cost?: number;
      model?: string;
    }
  ): StepPrompt | SessionSummary {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}. It may have expired.`);
    }

    const currentStepDef = session.recipe.steps[session.currentStep];
    const agentName = this.normalizeAgentName(currentStepDef.agent);

    // Store the output
    session.outputs.set(agentName, stepOutput);

    // Also store by output_to variable name if specified
    if (currentStepDef.output_to) {
      const targetName = this.normalizeAgentName(currentStepDef.output_to);
      session.outputs.set(`__var_${targetName}`, stepOutput);
    }

    // Track cost for this step
    if (costData) {
      const stepCostEntry = {
        step: session.currentStep + 1,
        agent: agentName,
        input_tokens: costData.input_tokens || 0,
        output_tokens: costData.output_tokens || 0,
        cost: costData.cost || 0,
        model: costData.model,
      };
      session.stepCosts.per_step.push(stepCostEntry);
      session.stepCosts.total_input_tokens += stepCostEntry.input_tokens;
      session.stepCosts.total_output_tokens += stepCostEntry.output_tokens;
      session.stepCosts.total_cost += stepCostEntry.cost;

      // Also record in the global cost tracker
      this.costTracker.recordCost(
        costData.model || 'unknown',
        'cursor',
        agentName,
        stepCostEntry.input_tokens,
        stepCostEntry.output_tokens,
        stepCostEntry.cost,
        { query: `Recipe: ${session.recipe.name}, step ${session.currentStep}` }
      );
    }

    // Advance to next step
    session.currentStep++;

    // Check if we're done
    if (session.currentStep >= session.recipe.steps.length) {
      return this.buildSummary(session);
    }

    // Check if this step was marked final_output
    if (currentStepDef.final_output) {
      return this.buildSummary(session);
    }

    // Return next step's prompt
    return this.buildStepPrompt(session);
  }

  // --------------------------------------------------------------------------
  // Get session status
  // --------------------------------------------------------------------------

  getSessionStatus(sessionId: string): {
    exists: boolean;
    current_step?: number;
    total_steps?: number;
    agent?: string;
    recipe?: string;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { exists: false };
    }
    const stepDef = session.recipe.steps[session.currentStep];
    return {
      exists: true,
      current_step: session.currentStep + 1,
      total_steps: session.recipe.steps.length,
      agent: stepDef ? this.normalizeAgentName(stepDef.agent) : undefined,
      recipe: session.recipe.name,
    };
  }

  // --------------------------------------------------------------------------
  // Build the prompt for the current step
  // --------------------------------------------------------------------------

  private buildStepPrompt(session: ActiveSession): StepPrompt {
    const stepDef = session.recipe.steps[session.currentStep];
    const agentName = this.normalizeAgentName(stepDef.agent);

    // Find the subagent definition to get its prompt template
    const subagent = session.recipe.subagents.find(
      (s) => this.normalizeAgentName(s.name) === agentName
    );

    // Build system prompt from subagent's prompt field
    let systemPrompt = subagent?.prompt || `You are the ${agentName} agent.`;

    // Interpolate {{user_task}} in system prompt
    systemPrompt = systemPrompt.replace(/\{\{user_task\}\}/g, session.userTask);

    // Interpolate @AgentName references with actual outputs
    systemPrompt = this.interpolateAgentRefs(systemPrompt, session);

    // Build user prompt — the step's input with variable interpolation
    let userPrompt = '';

    if (session.currentStep === 0) {
      // First step: use the user's original task
      const stepInput = stepDef.input || '{{user_task}}';
      userPrompt = this.interpolateVariables(stepInput, session);
    } else {
      // Subsequent steps: combine step input with previous agent's output
      const prevStepDef = session.recipe.steps[session.currentStep - 1];
      const prevAgent = this.normalizeAgentName(prevStepDef.agent);
      const prevOutput = session.outputs.get(prevAgent) || '';

      if (stepDef.input) {
        userPrompt = this.interpolateVariables(stepDef.input, session);
        // If the input references @Agent but we haven't interpolated it, append the output
        if (!userPrompt.includes(prevOutput) && prevOutput) {
          userPrompt += `\n\n--- Output from ${prevAgent} ---\n${prevOutput}`;
        }
      } else {
        userPrompt = `Previous step output from ${prevAgent}:\n\n${prevOutput}`;
      }
    }

    // Build the previous outputs map for context
    const previousOutputs: Record<string, string> = {};
    for (const [key, value] of session.outputs) {
      if (!key.startsWith('__var_')) {
        previousOutputs[key] = value;
      }
    }

    const isFinal = session.currentStep === session.recipe.steps.length - 1 ||
                    stepDef.final_output === true;

    return {
      session_id: session.id,
      step_number: session.currentStep + 1,
      total_steps: session.recipe.steps.length,
      agent_name: agentName,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      is_final: isFinal,
      recipe_name: session.recipe.name,
      previous_outputs: previousOutputs,
    };
  }

  // --------------------------------------------------------------------------
  // Build session summary
  // --------------------------------------------------------------------------

  private buildSummary(session: ActiveSession): SessionSummary {
    const outputs: Record<string, string> = {};
    for (const [key, value] of session.outputs) {
      if (!key.startsWith('__var_')) {
        outputs[key] = value;
      }
    }

    const summary: SessionSummary = {
      session_id: session.id,
      recipe_name: session.recipe.name,
      status: 'completed',
      steps_executed: session.currentStep,
      total_steps: session.recipe.steps.length,
      outputs,
      cost: session.stepCosts,
      duration_ms: Date.now() - session.startTime,
    };

    // Clean up the session
    this.sessions.delete(session.id);

    logger.info(
      `[RecipeSession] Session ${session.id} completed — ` +
      `${summary.steps_executed} steps, $${summary.cost.total_cost.toFixed(4)}, ` +
      `${summary.duration_ms}ms`
    );

    return summary;
  }

  // --------------------------------------------------------------------------
  // Variable interpolation
  // --------------------------------------------------------------------------

  private interpolateVariables(input: string, session: ActiveSession): string {
    let result = input;

    // Replace {{user_task}}
    result = result.replace(/\{\{user_task\}\}/g, session.userTask);

    // Replace @AgentName references with their outputs
    result = this.interpolateAgentRefs(result, session);

    return result;
  }

  private interpolateAgentRefs(text: string, session: ActiveSession): string {
    // Match @AgentName patterns (e.g., @Planner, @Executor, @QA-Tester)
    return text.replace(/@(\w[\w-]*)/g, (match, name) => {
      const normalized = this.normalizeAgentName(name);
      const output = session.outputs.get(normalized);
      if (output) {
        return `[${name}'s output]:\n${output}`;
      }
      return match; // Leave as-is if no output yet
    });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private normalizeAgentName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '-');
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `rs_${timestamp}_${random}`;
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.startTime > this.SESSION_TTL_MS) {
        logger.debug(`[RecipeSession] Expiring session ${id}`);
        this.sessions.delete(id);
      }
    }
  }
}
