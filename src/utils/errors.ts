/**
 * Custom error classes for roland
 */

export class RolandError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

export class ConfigError extends RolandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', details);
  }
}

export class ConfigNotFoundError extends ConfigError {
  constructor(path: string) {
    super(`Configuration file not found: ${path}`, { path });
  }
}

export class ConfigParseError extends ConfigError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`Failed to parse configuration: ${message}`, details);
  }
}

export class ConfigValidationError extends ConfigError {
  constructor(errors: string[]) {
    super('Configuration validation failed', { errors });
  }
}

// ============================================================================
// Agent Errors
// ============================================================================

export class AgentError extends RolandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', details);
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(agentName: string) {
    super(`Agent not found: ${agentName}`, { agentName });
  }
}

export class AgentLoadError extends AgentError {
  constructor(agentName: string, reason: string) {
    super(`Failed to load agent "${agentName}": ${reason}`, { agentName, reason });
  }
}

// ============================================================================
// Skill Errors
// ============================================================================

export class SkillError extends RolandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SKILL_ERROR', details);
  }
}

export class SkillNotFoundError extends SkillError {
  constructor(skillName: string) {
    super(`Skill not found: ${skillName}`, { skillName });
  }
}

export class SkillExecutionError extends SkillError {
  constructor(skillName: string, reason: string) {
    super(`Skill execution failed: ${reason}`, { skillName, reason });
  }
}

export class SkillValidationError extends SkillError {
  constructor(skillName: string, errors: string[]) {
    super(`Skill validation failed`, { skillName, errors });
  }
}

// ============================================================================
// MCP Server Errors
// ============================================================================

export class McpError extends RolandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'MCP_ERROR', details);
  }
}

export class McpConnectionError extends McpError {
  constructor(reason: string) {
    super(`MCP connection failed: ${reason}`, { reason });
  }
}

export class McpToolError extends McpError {
  constructor(toolName: string, reason: string) {
    super(`MCP tool error: ${reason}`, { toolName, reason });
  }
}

export class McpServerError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`MCP server error: ${message}`, details);
  }
}

// ============================================================================
// Model Routing Errors
// ============================================================================

export class RoutingError extends RolandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ROUTING_ERROR', details);
  }
}

export class NoAvailableModelError extends RoutingError {
  constructor(complexity: string) {
    super(`No available model for complexity level: ${complexity}`, { complexity });
  }
}

export class ModelNotConfiguredError extends RoutingError {
  constructor(modelName: string) {
    super(`Model not configured: ${modelName}`, { modelName });
  }
}

// ============================================================================
// Cache Errors
// ============================================================================

export class CacheError extends RolandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CACHE_ERROR', details);
  }
}

export class CacheReadError extends CacheError {
  constructor(reason: string) {
    super(`Failed to read cache: ${reason}`, { reason });
  }
}

export class CacheWriteError extends CacheError {
  constructor(reason: string) {
    super(`Failed to write cache: ${reason}`, { reason });
  }
}

// ============================================================================
// Workflow Errors
// ============================================================================

export class WorkflowError extends RolandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKFLOW_ERROR', details);
  }
}

export class WorkflowValidationError extends WorkflowError {
  constructor(errors: string[]) {
    super('Workflow validation failed', { errors });
  }
}

export class WorkflowExecutionError extends WorkflowError {
  constructor(stepId: string, reason: string) {
    super(`Workflow step execution failed: ${reason}`, { stepId, reason });
  }
}

// ============================================================================
// API Errors
// ============================================================================

export class ApiError extends RolandError {
  constructor(message: string, public statusCode?: number, details?: Record<string, unknown>) {
    super(message, 'API_ERROR', details);
  }
}

export class ApiAuthenticationError extends ApiError {
  constructor(provider: string) {
    super(`Authentication failed for provider: ${provider}`, 401, { provider });
  }
}

export class ApiRateLimitError extends ApiError {
  constructor(provider: string, retryAfter?: number) {
    super(`Rate limit exceeded for provider: ${provider}`, 429, { provider, retryAfter });
  }
}
