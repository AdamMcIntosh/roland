/**
 * Keyword Parser - Detect execution modes from query strings
 * 
 * Parses magic keywords like "eco:", "autopilot:", etc.
 * to determine execution mode and actual task
 */

export interface ParsedQuery {
  mode: ExecutionMode;
  query: string;
  skill?: string;
  agent?: string;
  options: Record<string, unknown>;
}

export type ExecutionMode =
  | 'ecomode'
  | 'autopilot'
  | 'ultrapilot'
  | 'swarm'
  | 'pipeline'
  | 'default';

const MODE_PATTERNS: Record<string, ExecutionMode> = {
  'eco:': 'ecomode',
  'ecomode:': 'ecomode',
  'autopilot:': 'autopilot',
  'ultrapilot:': 'ultrapilot',
  'ulw:': 'ultrapilot',
  'swarm:': 'swarm',
  'pipeline:': 'pipeline',
};

/**
 * Parse query string for magic keywords and execution mode
 * 
 * Examples:
 * - "eco: refactor this function" → ecomode, "refactor this function"
 * - "autopilot: analyze the codebase" → autopilot, "analyze the codebase"
 * - "regular task" → default, "regular task"
 */
export function parseQuery(fullQuery: string): ParsedQuery {
  let query = fullQuery.trim();
  let mode: ExecutionMode = 'default';
  let skill: string | undefined;
  let agent: string | undefined;

  // Check for magic keywords
  for (const [keyword, detectedMode] of Object.entries(MODE_PATTERNS)) {
    if (query.toLowerCase().startsWith(keyword.toLowerCase())) {
      mode = detectedMode;
      query = query.slice(keyword.length).trim();
      break;
    }
  }

  // Detect skill from remaining query (optional enhancement)
  skill = detectSkill(query);

  // Detect agent preference (optional enhancement)
  agent = detectAgent(query);

  return {
    mode,
    query,
    skill,
    agent,
    options: {
      useCache: true,
      showCost: true,
      verbose: false,
    },
  };
}

/**
 * Detect if query mentions a specific skill
 */
function detectSkill(query: string): string | undefined {
  const lower = query.toLowerCase();
  if (lower.includes('refactor') || lower.includes('improve code')) {
    return 'refactoring';
  }
  if (lower.includes('document') || lower.includes('doc')) {
    return 'documentation';
  }
  if (lower.includes('test') || lower.includes('write tests')) {
    return 'testing';
  }
  return undefined;
}

/**
 * Detect if query mentions a specific agent
 */
function detectAgent(query: string): string | undefined {
  const lower = query.toLowerCase();
  const agents = [
    'architect',
    'researcher',
    'designer',
    'writer',
    'vision',
    'critic',
    'analyst',
    'executor',
    'planner',
    'qa-tester',
  ];

  for (const agent of agents) {
    if (lower.includes(agent)) {
      return agent;
    }
  }

  return undefined;
}

/**
 * Get complexity level from query or default
 * MVP: Simple is default for Ecomode
 */
export function getComplexity(
  query: string
): 'simple' | 'medium' | 'complex' | 'explain' {
  const lower = query.toLowerCase();

  if (
    lower.includes('complex') ||
    lower.includes('analyze') ||
    lower.includes('design')
  ) {
    return 'complex';
  }

  if (
    lower.includes('medium') ||
    lower.includes('moderate') ||
    lower.includes('balance')
  ) {
    return 'medium';
  }

  if (
    lower.includes('explain') ||
    lower.includes('understand') ||
    lower.includes('learn')
  ) {
    return 'explain';
  }

  return 'simple';
}
