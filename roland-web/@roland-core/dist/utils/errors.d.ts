/**
 * Custom error classes for roland
 */
export declare class RolandError extends Error {
    code: string;
    details?: Record<string, unknown> | undefined;
    constructor(message: string, code?: string, details?: Record<string, unknown> | undefined);
    toJSON(): {
        name: string;
        message: string;
        code: string;
        details: Record<string, unknown> | undefined;
        stack: string | undefined;
    };
}
export declare class ConfigError extends RolandError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ConfigNotFoundError extends ConfigError {
    constructor(path: string);
}
export declare class ConfigParseError extends ConfigError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ConfigValidationError extends ConfigError {
    constructor(errors: string[]);
}
export declare class AgentError extends RolandError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class AgentNotFoundError extends AgentError {
    constructor(agentName: string);
}
export declare class AgentLoadError extends AgentError {
    constructor(agentName: string, reason: string);
}
export declare class SkillError extends RolandError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class SkillNotFoundError extends SkillError {
    constructor(skillName: string);
}
export declare class SkillExecutionError extends SkillError {
    constructor(skillName: string, reason: string);
}
export declare class SkillValidationError extends SkillError {
    constructor(skillName: string, errors: string[]);
}
export declare class McpError extends RolandError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class McpConnectionError extends McpError {
    constructor(reason: string);
}
export declare class McpToolError extends McpError {
    constructor(toolName: string, reason: string);
}
export declare class McpServerError extends McpError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class RoutingError extends RolandError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class NoAvailableModelError extends RoutingError {
    constructor(complexity: string);
}
export declare class ModelNotConfiguredError extends RoutingError {
    constructor(modelName: string);
}
export declare class CacheError extends RolandError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class CacheReadError extends CacheError {
    constructor(reason: string);
}
export declare class CacheWriteError extends CacheError {
    constructor(reason: string);
}
export declare class WorkflowError extends RolandError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class WorkflowValidationError extends WorkflowError {
    constructor(errors: string[]);
}
export declare class WorkflowExecutionError extends WorkflowError {
    constructor(stepId: string, reason: string);
}
export declare class ApiError extends RolandError {
    statusCode?: number | undefined;
    constructor(message: string, statusCode?: number | undefined, details?: Record<string, unknown>);
}
export declare class ApiAuthenticationError extends ApiError {
    constructor(provider: string);
}
export declare class ApiRateLimitError extends ApiError {
    constructor(provider: string, retryAfter?: number);
}
//# sourceMappingURL=errors.d.ts.map