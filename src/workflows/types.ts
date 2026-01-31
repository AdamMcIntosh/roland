/**
 * Workflow System Types
 * 
 * Defines the structure for workflows and recipes that orchestrate
 * multi-step, multi-agent execution with conditional logic and variable interpolation.
 */

/**
 * Workflow step configuration
 * Represents a single step in a workflow that can involve an agent or action
 */
export interface WorkflowStep {
  // Step identification
  name: string;
  description?: string;
  
  // Agent or action to execute
  agent?: string;  // Agent name from agent registry
  action?: string; // Special action (validation, formatting, etc.)
  
  // Input and output
  input?: string | Record<string, any>; // Can reference variables with {{var}}
  output_to?: string; // Variable name to store result
  
  // Conditional execution
  skip_if?: string; // Condition expression to skip step
  loop_if?: {
    condition: string;
    max_iterations?: number; // Default: 3
  };
  
  // Mode selection for agent execution
  mode?: 'autopilot' | 'ultrapilot' | 'swarm' | 'pipeline' | 'ecomode';
  
  // Cost constraints
  max_cost?: number; // Maximum cost allowed for this step
  
  // Timeout
  timeout_seconds?: number; // Execution timeout
  
  // Retry logic
  retry?: {
    max_attempts?: number; // Default: 1 (no retry)
    backoff_seconds?: number; // Delay between retries
  };
}

/**
 * Workflow/Recipe definition
 * High-level orchestration blueprint for multi-agent execution
 */
export interface Workflow {
  // Metadata
  name: string;
  description?: string;
  version?: string;
  author?: string;
  
  // Recipe type indicators
  recipe?: string; // e.g., 'plan-exec-review-explain', 'web-app', 'api', etc.
  
  // Configuration
  agents: string[]; // List of agents involved
  modes?: string[]; // Execution modes used (autopilot, swarm, etc.)
  
  // Variables and input/output
  variables?: Record<string, any>; // Initial variables
  input_variables?: string[]; // Expected inputs from user
  outputs?: Record<string, string>; // Output variable mappings
  
  // Steps
  steps: WorkflowStep[];
  
  // Global constraints
  max_total_cost?: number; // Total budget for entire workflow
  max_duration_seconds?: number; // Overall timeout
  
  // Execution settings
  parallel_steps?: string[]; // Steps that can run in parallel
  checkpoint_at?: string[]; // Steps to save state at
}

/**
 * Workflow execution context
 * Runtime state during workflow execution
 */
export interface WorkflowContext {
  // Identification
  workflowId: string;
  workflowName: string;
  
  // Variables
  variables: Map<string, any>;
  
  // Execution tracking
  startTime: number;
  endTime?: number;
  
  // Cost tracking
  totalCost: number;
  costPerStep: Map<string, number>;
  
  // Step results
  stepResults: Map<string, any>;
  stepStartTime: Map<string, number>;
  
  // Status
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  workflowId: string;
  workflowName: string;
  status: 'success' | 'failed' | 'cancelled';
  outputs: Record<string, any>;
  totalCost: number;
  totalDuration: number;
  startTime: number;
  endTime: number;
  stepsExecuted: number;
  stepResults: Map<string, any>;
  errorMessage?: string;
}

/**
 * Recipe template (pre-built workflow)
 */
export interface Recipe extends Workflow {
  recipe: string;
  tags?: string[]; // e.g., ['backend', 'auth', 'database']
  template_variables?: Record<string, string>; // Documentation of template vars
}

/**
 * Workflow validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
