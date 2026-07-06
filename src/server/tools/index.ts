/**
 * ## P1 Honesty & Consolidation
 *
 * Central tool registration — delegates to focused modules.
 */

import { registerUtilityTools } from './registry.js';
import { registerTriageTools } from './triage.js';
import { registerCostTools } from './cost.js';
import { registerRecipeTools } from './recipes.js';
import { registerContextTools } from './context.js';
import { registerGitTools } from './git.js';
import { registerCoordinationTools } from './coordination.js';
import { registerBoardTools } from './board.js';
import { registerHitlTools } from './hitl.js';
import { registerPmTools } from './pm.js';
import type { McpToolContext, McpToolRegistrar } from './types.js';

export function registerAllTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registerUtilityTools(registrar, ctx);
  registerTriageTools(registrar, ctx);
  registerCostTools(registrar, ctx);
  registerRecipeTools(registrar, ctx);
  registerContextTools(registrar, ctx);
  registerGitTools(registrar);
  registerCoordinationTools(registrar, ctx);
  registerBoardTools(registrar, ctx);
  registerHitlTools(registrar, ctx);
  registerPmTools(registrar, ctx);
}

export { createRegistrar } from './registry.js';
export type { McpToolContext, McpToolRegistrar, McpToolRegistry } from './types.js';
export { PROJECT_CONTEXT_SCHEMA } from './types.js';
export { resolveRecipesDir, buildRecipeCatalog } from './recipes.js';
