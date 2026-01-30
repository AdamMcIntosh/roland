/**
 * Enhanced Error Messages - User-friendly error handling
 * 
 * Provides clear, actionable error messages for all scenarios
 */

export class UserFacingError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string,
  ) {
    super(message);
    this.name = 'UserFacingError';
  }

  formatForDisplay(): string {
    let output = `\n❌ ${this.message}\n`;
    if (this.suggestion) {
      output += `\n💡 Suggestion: ${this.suggestion}\n`;
    }
    return output;
  }
}

/**
 * Common error scenarios and solutions
 */
export const ErrorScenarios = {
  MISSING_API_KEY: {
    create: (provider: string) =>
      new UserFacingError(
        `Missing API key for ${provider}`,
        'MISSING_API_KEY',
        `Set environment variable: OMG_GOOSE_API_KEYS_${provider.toUpperCase()}=your_api_key`,
      ),
  },

  INVALID_QUERY: {
    create: () =>
      new UserFacingError(
        'Query is empty or invalid',
        'INVALID_QUERY',
        'Try: goose run "eco: refactor this code"',
      ),
  },

  MODEL_NOT_FOUND: {
    create: (model: string) =>
      new UserFacingError(
        `Model not found: ${model}`,
        'MODEL_NOT_FOUND',
        `Use: goose skills to see available options`,
      ),
  },

  SKILL_NOT_FOUND: {
    create: (skill: string) =>
      new UserFacingError(
        `Skill not found: ${skill}`,
        'SKILL_NOT_FOUND',
        `Run: goose skills to see available skills`,
      ),
  },

  AGENT_NOT_FOUND: {
    create: (agent: string) =>
      new UserFacingError(
        `Agent not found: ${agent}`,
        'AGENT_NOT_FOUND',
        `Run: goose agents to see available agents`,
      ),
  },

  CONFIG_NOT_FOUND: {
    create: () =>
      new UserFacingError(
        'Configuration file not found',
        'CONFIG_NOT_FOUND',
        'Create config.yaml in project root with routing configuration',
      ),
  },

  CACHE_ERROR: {
    create: (operation: string) =>
      new UserFacingError(
        `Cache ${operation} failed`,
        'CACHE_ERROR',
        'Try: goose run --no-cache to disable caching',
      ),
  },

  NETWORK_ERROR: {
    create: (provider: string) =>
      new UserFacingError(
        `Network error connecting to ${provider}`,
        'NETWORK_ERROR',
        'Check your internet connection and API status',
      ),
  },

  RATE_LIMIT: {
    create: (provider: string) =>
      new UserFacingError(
        `Rate limit exceeded for ${provider}`,
        'RATE_LIMIT',
        'Try again in a few minutes',
      ),
  },

  INVALID_PARAMETERS: {
    create: (params: string) =>
      new UserFacingError(
        `Invalid parameters: ${params}`,
        'INVALID_PARAMETERS',
        'Check parameter names and types',
      ),
  },

  TIMEOUT: {
    create: () =>
      new UserFacingError(
        'Request timed out',
        'TIMEOUT',
        'Try a simpler query or try again later',
      ),
  },

  INTERNAL_ERROR: {
    create: (details: string) =>
      new UserFacingError(
        `Internal error: ${details}`,
        'INTERNAL_ERROR',
        'Please report this issue on GitHub',
      ),
  },
};

/**
 * Validate user input before execution
 */
export function validateQuery(query: string): { valid: boolean; error?: UserFacingError } {
  if (!query || query.trim().length === 0) {
    return {
      valid: false,
      error: ErrorScenarios.INVALID_QUERY.create(),
    };
  }

  if (query.length > 10000) {
    return {
      valid: false,
      error: new UserFacingError(
        'Query is too long (max 10000 characters)',
        'QUERY_TOO_LONG',
        'Break your task into smaller parts',
      ),
    };
  }

  return { valid: true };
}

/**
 * Validate skill exists
 */
export function validateSkill(skillName: string, availableSkills: string[]): { valid: boolean; error?: UserFacingError } {
  if (!availableSkills.includes(skillName)) {
    return {
      valid: false,
      error: ErrorScenarios.SKILL_NOT_FOUND.create(skillName),
    };
  }

  return { valid: true };
}

/**
 * Validate agent exists
 */
export function validateAgent(agentName: string, availableAgents: string[]): { valid: boolean; error?: UserFacingError } {
  if (!availableAgents.includes(agentName)) {
    return {
      valid: false,
      error: ErrorScenarios.AGENT_NOT_FOUND.create(agentName),
    };
  }

  return { valid: true };
}

/**
 * Safely execute async operations with error handling
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<{ success: boolean; data?: T; error?: UserFacingError }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: ErrorScenarios.INTERNAL_ERROR.create(`${context}: ${message}`),
    };
  }
}
