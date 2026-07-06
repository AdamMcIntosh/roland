/**
 * ## P1 Honesty & Consolidation
 *
 * Shared handler context types for MCP tool registration modules.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AppConfig } from '../../utils/types.js';
import type { AdvancedCostTracker } from '../../orchestrator/advanced-cost-tracker.js';
import type { RecipeSessionManager } from '../recipe-session.js';
import type { SessionContextManager } from '../session-context.js';
import type { ProjectContextManager } from '../project-context.js';
import type { QualityTracker } from '../../orchestrator/quality-tracker.js';
import type { CoordinationManager } from '../../coordination/index.js';
import type { LeadPM, LeadPMOptions } from '../../pm/lead-pm.js';
import type { McpProjectContext } from '../../utils/mcp-project-context.js';

/** Tool handler signature used across all registration modules. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/** Minimal registrar surface — implemented by McpServer.registerTool. */
export interface McpToolRegistrar {
  registerTool(
    name: string,
    description: string,
    handler: ToolHandler,
    inputSchema?: Record<string, unknown>,
  ): void;
}

/** Shared dependencies and helpers passed to every tool registration module. */
export interface McpToolContext {
  config: AppConfig;
  costTracker: AdvancedCostTracker;
  recipeSessionManager: RecipeSessionManager;
  sessionContextManager: SessionContextManager;
  projectContextManager: ProjectContextManager;
  qualityTracker: QualityTracker;
  coordination: CoordinationManager;
  leadPm: LeadPM;
  leadPmOpts: LeadPMOptions;
  recipesDir: string;
  getTools: () => string[];
  resolveToolProjectContext: (args: Record<string, unknown>) => McpProjectContext;
  scopedCoordination: (args: Record<string, unknown>) => CoordinationManager;
  scopedLeadPm: (args: Record<string, unknown>) => LeadPM;
}

/** Internal maps backing the registrar (for ListTools / CallTool). */
export interface McpToolRegistry {
  tools: Map<string, ToolHandler>;
  toolDefinitions: Map<string, Tool>;
}

/** Agent metadata for triage matching. */
export interface AgentCatalogEntry {
  name: string;
  role: string;
  triggers: string[];
  tier: 'simple' | 'medium' | 'complex';
}

/** Recipe metadata for triage matching — built from recipes/*.yaml. */
export interface RecipeCatalogEntry {
  name: string;
  fileKey: string;
  description: string;
  triggers: string[];
  agents: string[];
  category?: 'solo' | 'enterprise';
}

/** Shared schema fragment for project-scoped MCP tools. */
export const PROJECT_CONTEXT_SCHEMA = {
  project_root: {
    type: 'string',
    description: 'Absolute path to the target project directory (Hermes cwd). Default: ROLAND_PROJECT_ROOT env, then MCP server cwd.',
  },
  cwd: {
    type: 'string',
    description: 'Alias for project_root — working directory of the calling client.',
  },
  state_dir: {
    type: 'string',
    description: 'Path to .roland state directory (default: <project_root>/.roland).',
  },
} as const;
