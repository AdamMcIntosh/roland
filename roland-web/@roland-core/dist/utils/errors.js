/**
 * Custom error classes for roland
 */
export class RolandError extends Error {
    code;
    details;
    constructor(message, code = 'UNKNOWN_ERROR', details) {
        super(message);
        this.code = code;
        this.details = details;
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
    constructor(message, details) {
        super(message, 'CONFIG_ERROR', details);
    }
}
export class ConfigNotFoundError extends ConfigError {
    constructor(path) {
        super(`Configuration file not found: ${path}`, { path });
    }
}
export class ConfigParseError extends ConfigError {
    constructor(message, details) {
        super(`Failed to parse configuration: ${message}`, details);
    }
}
export class ConfigValidationError extends ConfigError {
    constructor(errors) {
        super('Configuration validation failed', { errors });
    }
}
// ============================================================================
// Agent Errors
// ============================================================================
export class AgentError extends RolandError {
    constructor(message, details) {
        super(message, 'AGENT_ERROR', details);
    }
}
export class AgentNotFoundError extends AgentError {
    constructor(agentName) {
        super(`Agent not found: ${agentName}`, { agentName });
    }
}
export class AgentLoadError extends AgentError {
    constructor(agentName, reason) {
        super(`Failed to load agent "${agentName}": ${reason}`, { agentName, reason });
    }
}
// ============================================================================
// Skill Errors
// ============================================================================
export class SkillError extends RolandError {
    constructor(message, details) {
        super(message, 'SKILL_ERROR', details);
    }
}
export class SkillNotFoundError extends SkillError {
    constructor(skillName) {
        super(`Skill not found: ${skillName}`, { skillName });
    }
}
export class SkillExecutionError extends SkillError {
    constructor(skillName, reason) {
        super(`Skill execution failed: ${reason}`, { skillName, reason });
    }
}
export class SkillValidationError extends SkillError {
    constructor(skillName, errors) {
        super(`Skill validation failed`, { skillName, errors });
    }
}
// ============================================================================
// MCP Server Errors
// ============================================================================
export class McpError extends RolandError {
    constructor(message, details) {
        super(message, 'MCP_ERROR', details);
    }
}
export class McpConnectionError extends McpError {
    constructor(reason) {
        super(`MCP connection failed: ${reason}`, { reason });
    }
}
export class McpToolError extends McpError {
    constructor(toolName, reason) {
        super(`MCP tool error: ${reason}`, { toolName, reason });
    }
}
export class McpServerError extends McpError {
    constructor(message, details) {
        super(`MCP server error: ${message}`, details);
    }
}
// ============================================================================
// Model Routing Errors
// ============================================================================
export class RoutingError extends RolandError {
    constructor(message, details) {
        super(message, 'ROUTING_ERROR', details);
    }
}
export class NoAvailableModelError extends RoutingError {
    constructor(complexity) {
        super(`No available model for complexity level: ${complexity}`, { complexity });
    }
}
export class ModelNotConfiguredError extends RoutingError {
    constructor(modelName) {
        super(`Model not configured: ${modelName}`, { modelName });
    }
}
// ============================================================================
// Cache Errors
// ============================================================================
export class CacheError extends RolandError {
    constructor(message, details) {
        super(message, 'CACHE_ERROR', details);
    }
}
export class CacheReadError extends CacheError {
    constructor(reason) {
        super(`Failed to read cache: ${reason}`, { reason });
    }
}
export class CacheWriteError extends CacheError {
    constructor(reason) {
        super(`Failed to write cache: ${reason}`, { reason });
    }
}
// ============================================================================
// Workflow Errors
// ============================================================================
export class WorkflowError extends RolandError {
    constructor(message, details) {
        super(message, 'WORKFLOW_ERROR', details);
    }
}
export class WorkflowValidationError extends WorkflowError {
    constructor(errors) {
        super('Workflow validation failed', { errors });
    }
}
export class WorkflowExecutionError extends WorkflowError {
    constructor(stepId, reason) {
        super(`Workflow step execution failed: ${reason}`, { stepId, reason });
    }
}
// ============================================================================
// API Errors
// ============================================================================
export class ApiError extends RolandError {
    statusCode;
    constructor(message, statusCode, details) {
        super(message, 'API_ERROR', details);
        this.statusCode = statusCode;
    }
}
export class ApiAuthenticationError extends ApiError {
    constructor(provider) {
        super(`Authentication failed for provider: ${provider}`, 401, { provider });
    }
}
export class ApiRateLimitError extends ApiError {
    constructor(provider, retryAfter) {
        super(`Rate limit exceeded for provider: ${provider}`, 429, { provider, retryAfter });
    }
}
//# sourceMappingURL=errors.js.map